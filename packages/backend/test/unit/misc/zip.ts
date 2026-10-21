/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { ZipExtractError, ZipFile } from '@/misc/zip.js';

type TestEntry = {
	name: string;
	data: string;
	unixMode?: number;
};

const S_IFLNK = 0o120000;

async function buildZip(entries: TestEntry[]): Promise<Uint8Array> {
	const writer = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false });
	for (const entry of entries) {
		await writer.add(entry.name, new TextReader(entry.data), entry.unixMode != null ? { unixMode: entry.unixMode } : {});
	}
	const blob = await writer.close();
	return new Uint8Array(await blob.arrayBuffer());
}

async function findEntry(zip: ZipFile, name: string) {
	for await (const entry of zip.entries()) {
		if (entry.filename === name) return entry;
	}
	return null;
}

async function listNames(zip: ZipFile): Promise<string[]> {
	const names: string[] = [];
	for await (const entry of zip.entries()) names.push(entry.filename);
	return names.sort();
}

describe('misc:zip', () => {
	let dir: string;

	async function writeZip(entries: TestEntry[] | Uint8Array): Promise<string> {
		const zipPath = path.join(dir, 'test.zip');
		await fs.promises.writeFile(zipPath, entries instanceof Uint8Array ? entries : await buildZip(entries));
		return zipPath;
	}

	beforeEach(async () => {
		dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'misskey-zip-test-'));
	});

	afterEach(async () => {
		await fs.promises.rm(dir, { recursive: true, force: true });
	});

	test('extracts a regular entry', async () => {
		const zipPath = await writeZip([
			{ name: 'meta.json', data: '{"metaVersion":2,"emojis":[]}' },
		]);
		const zip = await ZipFile.open(zipPath);
		try {
			const dest = path.join(dir, 'meta.json');
			await zip.extractToFile((await findEntry(zip, 'meta.json'))!, dest, { maxBytes: 1024 });
			expect(await fs.promises.readFile(dest, 'utf-8')).toBe('{"metaVersion":2,"emojis":[]}');
		} finally {
			await zip.close();
		}
	});

	test('rejects path traversal entries', async () => {
		const zipPath = await writeZip([
			{ name: 'meta.json', data: '{}' },
			{ name: '../../evil.txt', data: 'evil' },
		]);
		const zip = await ZipFile.open(zipPath);
		try {
			await expect(listNames(zip)).rejects.toThrow();
		} finally {
			await zip.close();
		}
	});

	test('rejects absolute path entries', async () => {
		const zipPath = await writeZip([
			{ name: '/etc/evil.txt', data: 'evil' },
		]);
		const zip = await ZipFile.open(zipPath);
		try {
			await expect(listNames(zip)).rejects.toThrow();
		} finally {
			await zip.close();
		}
	});

	test('rejects symbolic links', async () => {
		const zipPath = await writeZip([
			{ name: 'passwd', data: '/etc/passwd', unixMode: S_IFLNK | 0o777 },
		]);
		const zip = await ZipFile.open(zipPath);
		try {
			const entry = (await findEntry(zip, 'passwd'))!;
			const dest = path.join(dir, 'passwd');
			await expect(zip.extractToFile(entry, dest, { maxBytes: 1024 })).rejects.toThrow(ZipExtractError);
			expect(fs.existsSync(dest)).toBe(false);
		} finally {
			await zip.close();
		}
	});

	test('rejects duplicate entry names', async () => {
		const bytes = await buildZip([
			{ name: 'a.png', data: 'first' },
			{ name: 'b.png', data: 'second' },
		]);
		const text = new TextDecoder('latin1').decode(bytes);
		const forged = new Uint8Array(bytes);
		for (let i = text.indexOf('b.png'); i !== -1; i = text.indexOf('b.png', i + 1)) {
			forged[i] = 'a'.charCodeAt(0);
		}
		const zipPath = await writeZip(forged);
		const zip = await ZipFile.open(zipPath);
		try {
			await expect(listNames(zip)).rejects.toThrow('duplicate entry');
		} finally {
			await zip.close();
		}
	});

	test('rejects entries larger than the extraction limit', async () => {
		const zipPath = await writeZip([
			{ name: 'big.txt', data: 'x'.repeat(4096) },
		]);
		const zip = await ZipFile.open(zipPath);
		try {
			const dest = path.join(dir, 'big.txt');
			await expect(zip.extractToFile((await findEntry(zip, 'big.txt'))!, dest, { maxBytes: 1024 })).rejects.toThrow(ZipExtractError);
			expect(fs.existsSync(dest)).toBe(false);
		} finally {
			await zip.close();
		}
	});

	test('never writes through an existing symbolic link', async () => {
		const zipPath = await writeZip([
			{ name: 'ok.txt', data: 'overwritten?' },
		]);
		const target = path.join(dir, 'target.txt');
		await fs.promises.writeFile(target, 'original');
		const dest = path.join(dir, 'ok.txt');
		await fs.promises.symlink(target, dest);

		const zip = await ZipFile.open(zipPath);
		try {
			await expect(zip.extractToFile((await findEntry(zip, 'ok.txt'))!, dest, { maxBytes: 1024 })).rejects.toThrow();
			expect(await fs.promises.readFile(target, 'utf-8')).toBe('original');
		} finally {
			await zip.close();
		}
	});
});
