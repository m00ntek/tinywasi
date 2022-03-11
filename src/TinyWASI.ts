import * as crypto from "crypto";

export class TinyWASI
{
	private instance?: WebAssembly.Instance = undefined;

	private WASI_ERRNO_SUCCESS = 0;
	private WASI_ERRNO_BADF = 8;
	private WASI_ERRNO_FAULT = 21;
	private WASI_ERRNO_NOSYS = 52;

	private WASI_FILETYPE_CHARACTER_DEVICE = 2;

	imports = {
		wasi_snapshot_preview1:
		{
			fd_write: this.fd_write.bind( this ),
			fd_fdstat_get: this.fd_fdstat_get.bind( this ),

			clock_time_get: this.clock_time_get.bind( this ),

			random_get: this.random_get.bind( this ),

			environ_sizes_get: this.nosys( "environ_sizes_get" ).bind( this ),
			environ_get: this.nosys( "environ_get" ).bind( this ),

			fd_open: this.nosys( "fd_open" ).bind( this ),
			fd_close: this.nosys( "fd_close" ).bind( this ),
			fd_read: this.nosys( "fd_read" ).bind( this ),
			fd_seek: this.nosys( "fd_seek" ).bind( this ),

			proc_exit: this.nosys( "proc_exit" ).bind( this ),
		}
	};


	initialize( instance: WebAssembly.Instance )
	{
		this.instance = instance;

		const initialize = instance.exports._initialize as CallableFunction;
		initialize();
	}


	private getMemory(): WebAssembly.Memory | undefined
	{
		if( this.instance )
			return ( this.instance.exports.memory as WebAssembly.Memory );
	}

	private getDataView(): DataView | undefined
	{
		if( this.instance )
			return new DataView( ( this.instance.exports.memory as WebAssembly.Memory ).buffer );
	}


	private nosys( name: string ): CallableFunction
	{
		return ( ...args: number[] ): number =>
		{
			console.error( `Unimplemented call to ${name}(${args.toString()})` );

			return this.WASI_ERRNO_NOSYS;
		}
	}


	private fd_fdstat_get( fd: number, fdstat: number ): number
	{
		if( fd > 2 )
			return this.WASI_ERRNO_BADF;

		const view = this.getDataView();

		if( !view )
			return this.WASI_ERRNO_FAULT;

		view.setUint8( fdstat, this.WASI_FILETYPE_CHARACTER_DEVICE );
		view.setUint16( fdstat + 2, 0b1, true );
		view.setUint16( fdstat + 8, 0b101001, true );
		view.setUint16( fdstat + 16, 0, true );

		return this.WASI_ERRNO_SUCCESS;
	}

	private fd_write( fd: number, iovs: number, iovsLen: number, nwritten: number ): number
	{
		if( fd > 2 )
			return this.WASI_ERRNO_BADF;

		const view = this.getDataView();
		const memory = this.getMemory();

		if( !view || !memory )
			return this.WASI_ERRNO_FAULT;

		let buffers: Uint8Array[] = []

		for( let i = 0; i < iovsLen; i++ )
		{
			const iov = iovs + i * 8;
			const offset = view.getUint32( iov, true );
			const len = view.getUint32( iov + 4, true );

			buffers.push( new Uint8Array( memory.buffer, offset, len ) );
		}

		const length = buffers.reduce( ( s, b ) => s + b.length, 0 );

		const buffer = new Uint8Array( length );
		let offset = 0;

		buffers.forEach( b =>
		{
			buffer.set( b, offset );
			offset += b.length;
		} );

		const string = new TextDecoder( "utf-8" ).decode( buffer ).replace( /\n$/, "" );

		if( fd == 1 )
			console.log( string );
		else
			console.error( string );

		view.setUint32( nwritten, buffer.length, true );

		return this.WASI_ERRNO_SUCCESS;
	}

	private clock_time_get( clockId: number, precision: number, time: number ): number
	{
		const view = this.getDataView();

		if( !view )
			return this.WASI_ERRNO_FAULT;

		const now = new Date().getTime();

		view.setUint32( time, ( now * 1000000.0 ) % 0xFFFFFFFF, true );
		view.setUint32( time + 4, now * 1000000.0 / 0xFFFFFFFF, true );

		return this.WASI_ERRNO_SUCCESS;
	}

	private random_get( pointer: number, size: number ): number
	{
		const view = this.getDataView();
		const memory = this.getMemory();

		if( !view || !memory )
			return this.WASI_ERRNO_FAULT;

		const buffer = new Uint8Array( memory.buffer, pointer, size )

		if( typeof window != "undefined" )
			window.crypto.getRandomValues( buffer );
		else
			crypto.randomFillSync( buffer );

		return this.WASI_ERRNO_SUCCESS;
	}
}