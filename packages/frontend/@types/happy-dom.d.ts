import type { UnderlyingSource } from 'node:stream/web';

// happy-dom references this DOM stream type through node:stream/web, which Node 24 omits.
declare module 'node:stream/web' {
	interface UnderlyingDefaultSource<R = unknown> extends UnderlyingSource<R> {
		type?: undefined;
	}
}
