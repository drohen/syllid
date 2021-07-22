/**
 * Single worker node
 * Worker receives data for
 * - channel playing state
 * - buffers for channel
 * 
 * When channel is stopped, just copy 0s
 * When channel playing but buffer is empty, just copy almost silent randoms
 * When channel is playing and buffer is available
 * - get current buffer file
 * - get current buffer index
 * - get next non 0 value
 * - if new buffer file, fade in values
 * - if end of buffer (sequence of 0 values > 10), fade out values
 * - copy values to output for channel
 * 
 * TODO:
 * - send request for segments
 * - emit current playing segments
 * 
 */

enum MessageType
{
	state = `state`,
	buffer = `buffer`,
	add = `add`
}

enum EmitType
{
	feed = `feed`,
	id = `id`
}

enum BufferState
{
	new = `new`,
	stale = `stale`
}

class PlayerWorklet extends AudioWorkletProcessor
{
	private handlers: Record<MessageType, ( data: Message ) => void>

	private sources: SourceData[]

	private sourceKey: Record<string, number>

	constructor( options?: AudioWorkletNodeOptions )
	{
		super( options )

		this.bindFns()

		this.sources = []

		this.sourceKey = {}

		this.port.onmessage = e => this.handleMessage( e )

		this.handlers = {
			[ MessageType.state ]: this.handleState,
			[ MessageType.buffer ]: this.handleBuffer,
			[ MessageType.add ]: this.handleAdd
		}
	}

	private bindFns()
	{
		this.handleMessage = this.handleMessage.bind( this )

		this.handleState = this.handleState.bind( this )

		this.handleBuffer = this.handleBuffer.bind( this )

		this.handleAdd = this.handleAdd.bind( this )

		this.bufferKey = this.bufferKey.bind( this )

		this.process = this.process.bind( this )

		this.onEndProcess = this.onEndProcess.bind( this )
	}

	private newStreamItem( id: string ): SourceData
	{
		return {
			id,
			bufferCursor: 0,
			currentBuffer: 0,
			state: false,
			totalBuffers: 0,
			bufferState: BufferState.new
		}
	}

	private handleMessage( event: MessageEvent<Message> )
	{
		this.handlers[ event.data.type ]( event.data )
	}

	private handleAdd( data: Message )
	{
		if ( data.type !== MessageType.add ) return

		if ( typeof data.id !== `string` ) return

		// Stream exists
		if ( this.sourceKey[ data.id ] !== undefined ) return

		this.sourceKey[ data.id ] = data.index

		this.sources[ data.index ] = this.newStreamItem( data.id )
	}

	private handleState( data: Message )
	{
		// Wrong type
		if ( data.type !== MessageType.state ) return

		// Invalid data
		if ( typeof data.state !== `boolean` || typeof data.id !== `string` ) return
		
		// No relevant stream
		const index = this.sourceKey[ data.id ]

		if ( index === undefined ) return

		this.sources[ index ].state = data.state
	}

	private handleBuffer( data: Message )
	{
		// Wrong type
		if ( data.type !== MessageType.buffer ) return

		// Invalid data
		if ( data.buffer?.buffer === undefined
			|| typeof data.id !== `string`
			|| typeof data.bufferID !== `string` ) return
		
		let index = this.sourceKey[ data.id ]

		if ( index === undefined )
		{
			index = this.sources.length
			
			this.sourceKey[ data.id ] = index
			
			this.sources.push( this.newStreamItem( data.id ) )
		}

		const key = this.bufferKey( index )

		this.sources[ index ][ key ] = {
			buffer: data.buffer,
			id: data.bufferID
		}
	}

	private bufferKey( index: number )
	{
		const number = this.sources[ index ].totalBuffers

		this.sources[ index ].totalBuffers += 1

		return number
	}

	// Clean up tasks
	private onEndProcess( idList: IDMessageItem[] )
	{
		if ( idList.length > 0 )
			this.port.postMessage( this.emitBufferIDs( idList ) )

		const requestBuffer: string[] = []

		for ( let i = 0; i < this.sources.length; i += 1 ) 
		{
			if ( !this.sources[ i ].state && this.sources[ i ].totalBuffers > 0 )
			{
				// Reset channel if stopped
				// this is here so anything buffering can finish before being cleared
				this.sources[ i ] = this.newStreamItem( this.sources[ i ].id )
			}

			if ( this.sources[ i ].state && ( this.sources[ i ].totalBuffers - this.sources[ i ].currentBuffer ) < 6 )
			{
				requestBuffer.push( this.sources[ i ].id )
			}
		}

		this.port.postMessage( this.emitFeedRequest( requestBuffer ) )
	}

	private emitBufferIDs( idList: IDMessageItem[] ): IDMessage
	{
		return {
			idList,
			type: EmitType.id
		}
	}

	private emitFeedRequest( streams: string[] ): FeedMessage
	{
		return {
			streams,
			type: EmitType.feed
		}
	}

	/**
	 * Output matrix:
	 * - First dimension is an output in a list of outputs, in this case, just 1
	 * - Second dimension is channels for the output, in this case, equal to destination channels
	 */
	process( _: Float32Array[][], outputs: Float32Array[][] ) 
	{
		try
		{
			const playingBuffer: IDMessageItem[] = []
			
			for ( let s = 0; s < this.sources.length; s += 1 )
			{		
				const source = this.sources[ s ]

				if ( !source || !source.state ) continue

				const output = outputs[ s ]

				if ( !output ) continue

				const channelBuffer = output[ 0 ]

				if ( !source.state // not playing
					|| !source.totalBuffers // no buffers
					|| !source[ source.currentBuffer ] // no current buffer
				)
				{
					channelBuffer.fill( 0 )

					continue
				}

				for ( let dataIndex = 0; dataIndex < channelBuffer.length; dataIndex += 1 ) 
				{
					if ( !source.state || !source.totalBuffers || !source[ source.currentBuffer ] )
					{
						channelBuffer.fill( 0, dataIndex )

						break
					}

					if ( source.bufferState === BufferState.new )
					{
						playingBuffer.push( {
							bufferID: source[ source.currentBuffer ].id,
							sourceID: source.id
						} )

						source.bufferState = BufferState.stale
					}

					channelBuffer[ dataIndex ] = source[ source.currentBuffer ].buffer[ source.bufferCursor ]

					let faded = false

					// If we are < 2000 from end of buffer, add beginning of new buffer
					if ( source.bufferCursor > source[ source.currentBuffer ].buffer.length - 2000
						&& source[ source.currentBuffer + 1 ] )
					{
						const i = 2000 - ( source[ source.currentBuffer ].buffer.length - source.bufferCursor )

						channelBuffer[ dataIndex ] += source[ source.currentBuffer + 1 ].buffer[ i ]

						faded = true
					}

					source.bufferCursor += 1

					// Reached end of buffer
					if ( source.bufferCursor === source[ source.currentBuffer ].buffer.length )
					{
						// Delete used buffer
						delete source[ source.currentBuffer ]

						source.bufferCursor = faded ? 2000 : 0

						source.currentBuffer += 1

						source.bufferState = BufferState.new
					}
				}
			}

			this.onEndProcess( playingBuffer )
		}
		catch ( e )
		{
			console.warn( `Audio Worklet Errored:`, e )
		}

		return true
	}
}

registerProcessor( `playerWorklet`, PlayerWorklet )