/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';
import pug from 'pug';
import { getClientEntry, type ClientManifest } from '@/misc/get-client-entry.js';

describe('client entry stylesheets', () => {
	test('renders CSS for statically imported header and avatar chunks in the page', () => {
		const manifest: ClientManifest = {
			'app.ts': { file: 'app.js', css: ['app.css'], imports: ['_header.js'] },
			'_header.js': { file: 'header.js', css: ['header.css'], imports: ['_avatar.js'] },
			'_avatar.js': { file: 'avatar.js', css: ['avatar.css'] },
		};
		const clientEntry = getClientEntry(manifest, 'app.ts');
		const html = pug.renderFile(fileURLToPath(new URL('../../../src/server/web/views/base.pug', import.meta.url)), {
			config: { clientManifestExists: true, clientEntry },
		});

		expect(html.match(/<link rel="stylesheet" href="\/vite\/[^\"]+">/g)).toEqual([
			'<link rel="stylesheet" href="/vite/app.css">',
			'<link rel="stylesheet" href="/vite/avatar.css">',
			'<link rel="stylesheet" href="/vite/header.css">',
		]);
		expect(html).toContain('var CLIENT_ENTRY = "app.js";');
		expect(manifest['app.ts'].css).toEqual(['app.css']);
	});

	test('deduplicates CSS shared by multiple imports and handles circular imports', () => {
		const manifest: ClientManifest = {
			'app.ts': { file: 'app.js', css: ['shared.css'], imports: ['_a.js', '_b.js'] },
			'_a.js': { file: 'a.js', css: ['a.css', 'shared.css'], imports: ['_b.js'] },
			'_b.js': { file: 'b.js', css: ['shared.css', 'b.css'], imports: ['app.ts'] },
		};

		expect(getClientEntry(manifest, 'app.ts').css).toEqual(['shared.css', 'b.css', 'a.css']);
	});

	test('keeps dynamically imported styles lazy', () => {
		const manifest: ClientManifest = {
			'app.ts': { file: 'app.js', imports: ['_header.js'], dynamicImports: ['settings.ts'] },
			'_header.js': { file: 'header.js', css: ['header.css'], dynamicImports: ['settings.ts'] },
			'settings.ts': { file: 'settings.js', css: ['settings.css'] },
		};

		expect(getClientEntry(manifest, 'app.ts').css).toEqual(['header.css']);
	});

	test('supports the development entry without a build manifest', () => {
		expect(getClientEntry({ 'app.ts': { file: 'app.ts' } }, 'app.ts')).toEqual({ file: 'app.ts', css: [] });
	});
});
