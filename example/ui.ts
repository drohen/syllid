import type { Syllid } from "../build/syllid.js"

export class UI
{
	private el: HTMLElement

	private ui: {
		playBtn: HTMLButtonElement
		channelBtns: HTMLButtonElement[]
		playing: HTMLDivElement,
		scrubber: HTMLDivElement
	}

	private scrubLen: number

	private isNormal: boolean

	private scrubPos: number

	private scrubbing: boolean

	private noData: boolean

	constructor(
		private id: string,
		mount: HTMLElement,
		private syllid: Syllid,
		private onPositionChange?: ( position: number ) => void )
	{
		this.bindFns()

		this.scrubLen = 0

		this.scrubPos = 0

		this.el = document.createElement( `div` )

		mount.appendChild( this.el )

		const playing = document.createElement( `div` )

		playing.textContent = `No data`

		this.el.appendChild( playing )

		this.ui = {
			playBtn: this.playBtn(),
			channelBtns: [],
			playing,
			scrubber: document.createElement( `div` )
		}

		for ( let c = 0; c < this.syllid.getChannels(); c++ )
		{
			this.ui.channelBtns[ c ] = this.btn( c )
		}

		this.isNormal = this.onPositionChange !== undefined

		this.scrubbing = false

		this.noData = false

		if ( this.isNormal ) this.scrubber()
	}

	private bindFns()
	{
		this.disableBtn = this.disableBtn.bind( this )

		this.btnClick = this.btnClick.bind( this )

		this.playToggle = this.playToggle.bind( this )

		this.setSegmentPlaying = this.setSegmentPlaying.bind( this )

		this.setPlaying = this.setPlaying.bind( this )

		this.setStopped = this.setStopped.bind( this )

		this.setUnmute = this.setUnmute.bind( this )

		this.setMute = this.setMute.bind( this )

		this.setNoData = this.setNoData.bind( this )

		this.updateScrub = this.updateScrub.bind( this )

		this.emitPosition = this.emitPosition.bind( this )
	}

	private disableBtn( btn: HTMLButtonElement )
	{
		btn.textContent = `Loading`

		btn.dataset.state = `loading`

		btn.disabled = true
	}

	private btn( channel: number )
	{
		const b = document.createElement( `button` )

		b.textContent = `Unmute channel ${channel}`

		b.dataset.channel = `${channel}`

		b.dataset.state = `mute`

		b.addEventListener( `click`, () => this.btnClick( channel ) )

		this.el.appendChild( b )

		return b
	}

	private btnClick( channel: number )
	{
		const btn = this.ui.channelBtns[ channel ]

		const state = btn.dataset.state
		
		if ( state === `loading` )
		{
			return
		}
		else if ( state === `mute` )
		{
			this.disableBtn( btn )

			this.syllid.startStreamChannel( this.id, channel )
		}
		else
		{
			this.disableBtn( btn )

			this.syllid.stopStreamChannel( this.id, channel )
		}
	}

	private playBtn()
	{
		const b = document.createElement( `button` )

		b.textContent = `Play stream`

		b.dataset.state = `stopped`

		b.addEventListener( `click`, () => this.playToggle() )

		this.el.appendChild( b )

		return b
	}

	private playToggle()
	{
		const btn = this.ui.playBtn

		const state = btn.dataset.state

		if ( state === `loading` )
		{
			return
		}
		else if ( state === `stopped` )
		{
			this.disableBtn( btn )

			this.syllid.startStream( this.id )
		}
		else
		{
			this.disableBtn( btn )
			
			if ( this.isNormal )
			{
				this.scrubbing = true

				this.emitPosition()
			}
			else
			{
				this.syllid.stopStream( this.id )
			}
		}
	}

	private scrubber()
	{
		const range = document.createElement( `input` )

		range.type = `range`

		range.min = `0`

		range.max = `${this.scrubLen}`

		range.step = `1`

		this.ui.scrubber.appendChild( range )

		range.addEventListener( `input`, () => this.updateScrub() )

		range.addEventListener( `change`, () => this.emitPosition() )

		const time = document.createElement( `div` )

		const now = document.createElement( `span` )

		now.textContent = this.lengthToTime( this.scrubPos )

		const total = document.createElement( `span` )

		total.textContent = ` / ${this.lengthToTime( this.scrubLen )}`

		time.appendChild( now )

		time.appendChild( total )

		this.ui.scrubber.appendChild( time )

		this.el.appendChild( this.ui.scrubber )
	}

	private updateScrub()
	{
		this.scrubbing = true
		
		const time = this.ui.scrubber.querySelector( `div > span:first-child` )

		const scrub = this.ui.scrubber.querySelector( `input` )

		if ( time && scrub )
		{
			this.scrubPos = parseInt( scrub.value ) ?? 0

			time.textContent = this.lengthToTime( this.scrubPos )
		}
	}

	private emitPosition()
	{
		const scrub = this.ui.scrubber.querySelector( `input` )

		if ( scrub ) scrub.disabled = true

		this.onPositionChange?.( this.scrubPos )
	}

	private lengthToTime( time: number )
	{
		const hour = time * ( 1 / 3600 )

		const min = ( hour % 1 ) * 60

		const sec =  ( min % 1 ) * 60

		return `${this.toInterval( hour )}:${this.toInterval( min )}:${this.toInterval( sec )}`
	}

	private toInterval( value: number )
	{
		return `${`${Math.round( value )}`.padStart( 2, `0` )}`
	}

	public setSegmentPlaying( segmentID: string, position?: number ): void
	{
		this.ui.playing.textContent = `Playing: ${segmentID}`

		if ( position && this.isNormal && !this.scrubbing )
		{
			this.scrubPos = position
			
			const time = this.ui.scrubber.querySelector( `div > span:first-child` )

			if ( time ) time.textContent = this.lengthToTime( position )

			const scrub = this.ui.scrubber.querySelector( `input` )

			if ( scrub ) scrub.value = `${this.scrubPos}`
		}
	}

	public setPlaying(): void
	{
		this.ui.playBtn.disabled = false
		
		this.ui.playBtn.textContent = `Stop stream`

		this.ui.playBtn.dataset.state = `playing`
	}

	public setStopped(): void
	{
		this.ui.playBtn.disabled = false

		this.ui.playBtn.textContent = `Play stream`

		this.ui.playBtn.dataset.state = `stopped`
	}

	public setUnmute( channel: number ): void
	{
		this.ui.channelBtns[ channel ].disabled = false
		
		this.ui.channelBtns[ channel ].textContent = `Mute channel ${channel}`

		this.ui.channelBtns[ channel ].dataset.state = `playing`
	}

	public setMute( channel: number ): void
	{
		this.ui.channelBtns[ channel ].disabled = false
		
		this.ui.channelBtns[ channel ].textContent = `Unmute channel ${channel}`

		this.ui.channelBtns[ channel ].dataset.state = `mute`
	}

	public setNoData(): void
	{
		this.noData = true
	}

	public setHasData(): void
	{
		this.noData = false
	}

	public setRangeLength( length: number ): void
	{
		if ( !this.isNormal ) return

		this.scrubLen = length

		const scrub = this.ui.scrubber.querySelector( `input` )

		if ( scrub ) scrub.max = `${this.scrubLen}`

		const time = this.ui.scrubber.querySelector( `div > span:last-child` )

		if ( time ) time.textContent = ` / ${this.lengthToTime( this.scrubLen )}`
	}

	public setEnded(): void
	{
		if ( this.noData )
		{
			this.ui.playing.textContent = `No data`

			this.syllid.stopStream( this.id )
		}

		if ( this.isNormal )
		{
			this.syllid.stopStream( this.id )

			const scrub = this.ui.scrubber.querySelector( `input` )
	
			this.scrubPos = this.scrubLen

			if ( scrub )
			{
				scrub.value = `${this.scrubPos}`
			}
			
			const time = this.ui.scrubber.querySelector( `div > span:first-child` )
	
			if ( time ) time.textContent = this.lengthToTime( this.scrubPos )
		}
	}

	public setPosition( position: number ): void
	{
		if ( !this.isNormal ) return

		this.scrubbing = false

		const scrub = this.ui.scrubber.querySelector( `input` )

		this.scrubPos = position

		if ( scrub )
		{
			scrub.disabled = false

			scrub.value = `${this.scrubPos}`
		}
			
		const time = this.ui.scrubber.querySelector( `div > span:first-child` )

		if ( time ) time.textContent = this.lengthToTime( this.scrubPos )
	}
}