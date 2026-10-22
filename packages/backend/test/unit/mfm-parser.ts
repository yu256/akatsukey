/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as mfm from 'mfm-js';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';

describe('MFM link parser security patch', () => {
	test.each<[string, mfm.MfmNode[]]>([
		['[[[foo] [bar](https://example.com)', [mfm.TEXT('[[[foo] '), mfm.LINK(false, 'https://example.com', [mfm.TEXT('bar')])]],
		['[[[foo](https://example.com)', [mfm.LINK(false, 'https://example.com', [mfm.TEXT('[[foo')])]],
		['[[foo\n?[[bar](https://example.com)', [mfm.TEXT('[[foo\n'), mfm.LINK(true, 'https://example.com', [mfm.TEXT('[bar')])]],
		['**[[foo** [[bar** **[baz](https://example.com)**', [mfm.BOLD([mfm.TEXT('[[foo')]), mfm.TEXT(' '), mfm.LINK(false, 'https://example.com', [mfm.TEXT('[bar'), mfm.BOLD([mfm.TEXT(' ')]), mfm.TEXT('[baz')]), mfm.TEXT('**')]],
		['[**bold**](https://example.com)', [mfm.LINK(false, 'https://example.com', [mfm.BOLD([mfm.TEXT('bold')])])]],
	])('preserves links after incomplete labels: %s', (input, nodes) => {
		expect(mfm.parse(input)).toEqual(nodes);
	});

	test.each(['[', '?['])('bounds parsing of a maximum-length note made of %s', marker => {
		const input = marker.repeat(Math.floor(MAX_NOTE_TEXT_LENGTH / marker.length));
		// A separate process bounds the regression even if synchronous parsing stalls.
		const result = spawnSync(process.execPath, ['-e', `
			const assert = require('node:assert/strict');
			const mfm = require(process.argv[1]);
			const input = process.argv[2];
			assert.deepEqual(mfm.parse(input), [mfm.TEXT(input)]);
		`, createRequire(import.meta.url).resolve('mfm-js'), input], {
			encoding: 'utf8',
			timeout: 5000,
		});
		expect(result.error).toBeUndefined();
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
	});
});
