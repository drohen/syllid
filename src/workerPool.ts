import worker from "worker!/opus-recorder/dist/decoder/decoderWorker.min.js"

export interface WorkerPoolHandler
{
	onFailure: ( error: string | Error | ErrorEvent ) => void
}

enum WorkerState
{
	free = `free`,
	reserved = `reserved`,
	decoding = `decoding`
}

interface WorkerData
{
	index: number
	timeout: number
	state: WorkerState
	worker: Worker
	pageCount: number
	bufferLength: number
	bufferPages: Float32Array[]
	onCompleted: ( buffer: Float32Array ) => void 
}

export class WorkerPool
{
	private workers: WorkerData[]

	private workerScript: URL

	private idMap: Record<string, number | undefined>

	private bufferCount: number

	constructor(
		private workerCount: number,
		private handler: WorkerPoolHandler,
		private sampleRate: number )
	{
		this.onMessage = this.onMessage.bind( this )

		this.noHandlerCompleted = this.noHandlerCompleted.bind( this )

		this.workerScript = this.createWorkerScriptBlob( worker )

		this.workers = []

		this.idMap = {}

		this.bufferCount = 0

		for ( let w = 0; w < this.workerCount; w += 1 )
		{
			this.workers[ w ] = this.createWorker( w )
		}
	}

	private createWorkerScriptBlob( script: string ): URL
	{
		const blob = new Blob( [ script ], { type: `text/javascript` } )

		return new URL( URL.createObjectURL( blob ), import.meta.url )
	}

	private createWorker( index: number ): WorkerData
	{
		const worker = new Worker( this.workerScript, {
			name: `decode-worker`,
			type: `module`,
		} )

		worker.onmessage = e => this.onMessage( e, index )

		worker.onerror = err => this.handler.onFailure( err )

		worker.postMessage( { 
			command: `init`,
			decoderSampleRate: 48000,
			outputBufferSampleRate: this.sampleRate,
			resampleQuality: 10
		} )

		return {
			index,
			timeout: 0,
			worker,
			bufferPages: [],
			pageCount: 0,
			bufferLength: 0,
			onCompleted: this.noHandlerCompleted,
			state: WorkerState.free
		}
	}

	private onMessage( { data }: MessageEvent<Float32Array[]>, workerIndex: number ): void
	{
		// null means decoder is finished
		if ( data === null )
		{
			this.workers[ workerIndex ].onCompleted( this.buildBuffer( workerIndex ) )

			this.reset( workerIndex )
		}
		else
		{
			// data contains decoded buffers as float32 values
			for( const buffer of data )
			{
				this.workers[ workerIndex ].bufferPages[ this.workers[ workerIndex ].pageCount ] = buffer

				this.workers[ workerIndex ].pageCount += 1

				this.workers[ workerIndex ].bufferLength += buffer.length
			}
		}
	}

	private noHandlerCompleted(): void
	{
		this.handler.onFailure( `Received completed buffer for non-attached worker.` )
	}

	private reset( index: number )
	{
		this.workers[ index ].pageCount = 0

		this.workers[ index ].bufferLength = 0

		this.workers[ index ].onCompleted = this.noHandlerCompleted
	}

	private buildBuffer( index: number ): Float32Array
	{
		const buffer = new Float32Array( this.sampleRate * 1.01 )

		let offset = 0

		const pad = this.sampleRate * 0.07

		let incr = 0

		for( let i = 0; i < this.workers[ index ].pageCount; i += 1 )
		{
			const page = this.workers[ index ].bufferPages[ i ]

			if ( incr < pad )
			{
				// length of current page
				const len = page.length

				// rem of pad to skip
				const rem = pad - incr

				// if len is less than pad - incr, add to incr and continue
				if ( len <= rem )
				{
					incr += len

					continue
				}

				buffer.set( page.subarray( rem ) )

				incr = pad

				offset += ( len - rem )
			}
			else
			{
				const rem = buffer.length - offset

				const p = page.length > rem
					? page.subarray( 0, rem )
					: page

				buffer.set( p, offset )

				offset += p.length
			}

			if ( offset >= buffer.length ) break
		}

		this.fadeBuffer( buffer )

		// this.download( buffer )

		return buffer
	}

	/**
	 * method used for testing purposes
	 * analyse data using program like audacity
	 * float32, little-endian, 1 channel, (sample rate of output)
	 * */
	private download( buffer: ArrayBuffer )
	{
		const saveByteArray = ( function () 
		{
			const a = document.createElement( `a` )

			document.body.appendChild( a )

			a.style.display = `none`

			return ( data: BlobPart[], name: string ) => 
			{
				const blob = new Blob( data, { type: `octet/stream` } ),
					url = window.URL.createObjectURL( blob )

				a.href = url

				a.download = name

				a.click()

				window.URL.revokeObjectURL( url )
			}
		}() )

		saveByteArray( [ buffer ], `${this.bufferCount++}`.padStart( 4, `0` ) )
	}
	

	/**
	 * Decoded data often has a bunch of 0s at the start and end,
	 * this finds the first index of non-0s or last index before 0s
	 */
	/*
	private getIndex( buffer: Float32Array, direction: `start` | `end` ): number
	{
		let seqCount = 0

		let seqStart = -1

		for ( let i = 0; i < buffer.length; i += 1 )
		{
			const index = direction === `start` ? i : buffer.length - 1 - i

			if ( buffer[ index ] === 0 )
			{
				seqCount = 0

				seqStart = -1

				continue
			}
			else if ( seqCount === 9 )
			{
				break
			}
			else
			{
				seqCount += 1

				seqStart = seqStart === -1 ? index : seqStart
			}
		}

		return seqStart
	}
	*/

	/**
	 * To prevent popping between uneven buffers, add a tiny fade in
	 * at the beginning and fade out at the end
	 */
	
	private fadeBuffer( buffer: Float32Array )
	{
		const samples = this.sampleRate * 0.01

		for( let i = 0; i < samples; i += 1 )
		{
			// FADE IN
			buffer[ i ] = ( buffer[ i ] * i / samples )

			// FADE OUT
			const j = buffer.length - 1 - i

			buffer[ j ] = buffer[ j ] - ( buffer[ j ] * ( samples - i ) / samples )
		}
	}
	

	public getWorker(): string | undefined
	{
		for ( const worker of this.workers )
		{
			if ( worker.state === WorkerState.free )
			{
				worker.state = WorkerState.reserved

				const id = `${Math.round( Math.random() * 100000 )}`

				this.idMap[ id ] = worker.index

				worker.timeout = window.setTimeout( () =>
				{
					worker.state = WorkerState.free

					this.idMap[ id ] = undefined
				}, 1000 )

				return id
			}
		}
	}

	public decode( id: string, bytes: Uint8Array, onCompleted: ( buffer: Float32Array ) => void ): void
	{
		const index = this.idMap[ id ]

		if ( index === undefined ) throw Error( `No worker available for ID: ${id}.` )

		if ( this.workers[ index ].state !== WorkerState.reserved ) throw Error( `Worker not in correct state.` )

		this.workers[ index ].state = WorkerState.decoding

		this.workers[ index ].onCompleted = buffer => onCompleted( buffer )

		this.workers[ index ].worker.postMessage( {
			command: `decode`,
			pages: bytes
		}, [ bytes.buffer ] )
	}
}