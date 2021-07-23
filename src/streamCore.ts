import { circular_buffer as CircularBuffer } from "circular_buffer_js"

enum State
{
	stopped,
	running
}

export interface StreamHandler
{
	handleSegment: ( streamID: string, segment: Float32Array, id: string ) => void

	onWarning: ( message: string ) => void

	onFailure: ( message: string ) => void

	noData: ( id: string ) => void
}

export interface StreamProvider
{
	validatePlaylistResponse: ( items: Playlist ) => Playlist

	decodeSegment: ( data: Uint8Array ) => Promise<Float32Array>
}

export interface PathProvider
{
	path: () => string
}

export class StreamCore implements Stream
{
	// Buffered data
	private segments: CircularBuffer<Segment>

	// Buffer update semaphore
	private updateLock: boolean

	// Feed segments semaphore
	private nextLock: boolean

	// Segment URLs
	public fileList: string[]

	// Segment IDs
	public idList: string[]

	// Current index for fetching segments
	private refCursor: number

	// Get URLs interval
	private checkInterval: number

	// Times checked for URLs without update
	private noUpdateCount: number

	// Active state
	private state: State

	// Get more segments
	private continueFetch: boolean

	// Segment feed size
	private feedSize: number

	constructor(
		private id: string,
		private bufferSize: number = 10,
		private handler: StreamHandler,
		private provider: StreamProvider,
		private path: PathProvider )
	{
		this.bindFns()

		this.fileList = []

		this.idList = []

		this.segments = new CircularBuffer( this.bufferSize )

		this.updateLock = false

		this.nextLock = false

		this.refCursor = 0

		this.noUpdateCount = 0

		this.checkInterval = 0

		this.state = State.stopped

		this.continueFetch = false

		this.feedSize = 5
	}

	private bindFns()
	{
		this.checkNewSegments = this.checkNewSegments.bind( this )

		this.start = this.start.bind( this )

		this.stop = this.stop.bind( this )
	}

	/**
	 * Check if new segments are available
	 * Add to segmentRef list
	 */
	private checkNewSegments()
	{
		if ( this.fileList.length - this.refCursor > this.bufferSize * 1.5 )
		{
			this.checkInterval = window.setTimeout(
				() => this.checkNewSegments(),
				this.bufferSize * 1000 )

			return
		}

		const path: string = this.path.path()

		if ( !path ) return

		// start=live query required to hint server
		// to return the most recent segments
		fetch( path )
			.then( response =>
			{
				if ( response.status !== 200 )
				{
					this.noUpdate()

					throw Error( `Invalid response from endpoint.` )
				}

				return response.json()
			} )
			.then( ( items: Playlist ) => this.provider.validatePlaylistResponse( items ) )
			.then( items => this.addItemsFromPlaylist( items ) )
			.then( () => this.updateBuffer() )
			.catch( ( e: Error ) => 
			{
				this.handler.onWarning( e.message )

				this.noUpdate()
			} )
	}

	private addItemsFromPlaylist( playlist: Playlist ): void
	{
		if ( playlist.length === 0 )
		{
			this.noUpdate()
		}
		else
		{
			this.noUpdateCount = 0
		}

		this.checkInterval = window.setTimeout(
			() => this.checkNewSegments(),
			Math.max( 0.5, playlist.length - 1 ) * 1000 )

		for ( const { segmentID, segmentURL } of playlist )
		{
			this.fileList.push( segmentURL )

			this.idList.push( segmentID )
		}
	}

	private noUpdate()
	{
		this.noUpdateCount += 1

		if ( this.noUpdateCount > 5 )
		{	
			this.handler.noData( this.id )

			this.stop()
		}
		else
		{
			this.checkInterval = window.setTimeout(
				() => this.checkNewSegments(),
				Math.round( Math.exp( this.noUpdateCount ) * ( 100 / this.noUpdateCount ) ) )
		}
	}

	/**
	 * Get files from Ref, add to segments
	 * array
	 * Check if locked,
	 * if not, check if full,
	 * if not, lock and get availability
	 * iterate over available count,
	 * push as many available segment URL downloads
	 * unlock, then call itself
	 */
	private async updateBuffer()
	{
		if ( this.updateLock || this.segments.isFull ) return

		this.updateLock = true

		while( this.segments.available )
		{
			const url = this.fileList[ this.refCursor ]

			if ( !url ) break

			await this.getBuffer( url )

			this.refCursor += 1
		}

		this.updateLock = false

		if ( this.continueFetch )
		{
			this.nextSegments()

			this.continueFetch = false
		}
	}

	/**
	 * Reserve worker
	 * Download data
	 * send data to worker
	 * return decoded buffer
	 * push to segment circular buffer
	 */
	private async getBuffer( url: string )
	{
		try
		{
			const response = await fetch( url )

			if ( !response.ok )
				throw Error(
					`Invalid Response: ${response.status} ${response.statusText}`
				)

			if ( !response.body ) throw Error( `ReadableStream not supported.` )
		
			const reader = response.body.getReader()
		
			const data = await reader.read().then( res => this.evalChunk( reader, res, 0, [] ) )
			
			const decoded = await this.provider.decodeSegment( data )

			this.segments.push( { buffer: decoded, id: url } )
		}
		catch ( e )
		{
			this.handler.onFailure( e )
		}
	}

	private async evalChunk(
		reader: Reader,
		{ done, value }: Result,
		totalSize: number,
		chunks: Uint8Array[] ): Promise<Uint8Array> 
	{
		if ( done )
		{
			const data = new Uint8Array( totalSize )

			let offset = 0

			for ( const chunk of chunks )
			{
				data.set( chunk, offset )

				offset += chunk.length
			}

			return data
		}

		if ( value )
		{
			totalSize += value.length

			chunks.push( value )
		}

		return reader.read().then( res => this.evalChunk( reader, res, totalSize, chunks ) )
	}

	public nextSegments(): void
	{
		if ( this.nextLock )
		{
			this.continueFetch = true

			return
		}

		this.nextLock = true

		// Maximum segments to load is 10
		// This is also the limit of segments returned
		// When requesting latest audio
		const count = Math.min( this.feedSize, this.segments.length )

		for ( let i = 0; i < count; i += 1 )
		{
			const segment = this.segments.pop()

			if ( !segment ) continue

			this.handler.handleSegment( this.id, segment.buffer, segment.id )
		}

		this.nextLock = false

		this.updateBuffer()
	}

	public start(): void
	{
		if ( this.state === State.running ) return

		this.state = State.running

		this.checkNewSegments()
	}

	public stop(): void
	{
		if ( this.state === State.stopped ) return

		this.state = State.stopped

		clearInterval( this.checkInterval )
	}
}