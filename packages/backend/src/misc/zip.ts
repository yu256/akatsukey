/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { promises as fsp } from 'node:fs';
import { Reader, ZipReader } from '@zip.js/zip.js';
import type { FileEntry } from '@zip.js/zip.js';

class FileHandleReader extends Reader<fsp.FileHandle> {
	constructor(
		private readonly handle: fsp.FileHandle,
		size: number,
	) {
		super(handle);
		this.size = size;
	}

	public override async readUint8Array(index: number, length: number): Promise<Uint8Array> {
		const buffer = new Uint8Array(length);
		let read = 0;
		while (read < length) {
			const { bytesRead } = await this.handle.read(buffer, read, length - read, index + read);
			if (bytesRead === 0) break;
			read += bytesRead;
		}
		return read === length ? buffer : buffer.subarray(0, read);
	}
}

async function writeAll(handle: fsp.FileHandle, chunk: Uint8Array): Promise<void> {
	let offset = 0;
	while (offset < chunk.byteLength) {
		const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset);
		offset += bytesWritten;
	}
}

export class ZipExtractError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ZipExtractError';
	}
}

export type ZipExtractOptions = {
	maxBytes: number;
};

export class ZipFile {
	private constructor(
		private readonly handle: fsp.FileHandle,
		private readonly reader: ZipReader<unknown>,
	) {}

	public static async open(path: string): Promise<ZipFile> {
		const handle = await fsp.open(path, 'r');
		try {
			const { size } = await handle.stat();
			const reader = new ZipReader(new FileHandleReader(handle, size), {
				useWebWorkers: false,
				checkCrc32: true,
				filenameValidation: 'balanced',
			});
			return new ZipFile(handle, reader);
		} catch (e) {
			await handle.close();
			throw e;
		}
	}

	public async *entries(): AsyncGenerator<FileEntry, void, undefined> {
		const seen = new Set<string>();
		for await (const entry of this.reader.getEntriesGenerator()) {
			if (entry.directory) continue;
			if (seen.has(entry.filename)) {
				throw new ZipExtractError(`duplicate entry: ${entry.filename}`);
			}
			seen.add(entry.filename);
			yield entry;
		}
	}

	public async extractToFile(entry: FileEntry, destPath: string, options: ZipExtractOptions): Promise<void> {
		const { maxBytes } = options;

		if (entry.symlink) {
			throw new ZipExtractError(`symbolic link entry is not allowed: ${entry.filename}`);
		}
		if (entry.encrypted) {
			throw new ZipExtractError(`encrypted entry is not allowed: ${entry.filename}`);
		}
		if (entry.uncompressedSize > maxBytes) {
			throw new ZipExtractError(`entry is too large: ${entry.filename} (${entry.uncompressedSize} > ${maxBytes} bytes)`);
		}

		const handle = await fsp.open(destPath, 'wx');
		let succeeded = false;
		try {
			let written = 0;
			await entry.getData(new WritableStream<Uint8Array>({
				async write(chunk) {
					written += chunk.byteLength;
					if (written > maxBytes) {
						throw new ZipExtractError(`entry is too large: ${entry.filename} (> ${maxBytes} bytes)`);
					}
					await writeAll(handle, chunk);
				},
			}));
			succeeded = true;
		} finally {
			await handle.close();
			if (!succeeded) {
				await fsp.rm(destPath, { force: true });
			}
		}
	}

	public async close(): Promise<void> {
		await this.reader.close();
		await this.handle.close();
	}
}
