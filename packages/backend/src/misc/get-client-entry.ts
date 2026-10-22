/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type ManifestChunk = {
	file: string;
	css?: string[];
	imports?: string[];
	dynamicImports?: string[];
};

export type ClientManifest = Record<string, ManifestChunk>;

export function getClientEntry(manifest: ClientManifest, name: string): ManifestChunk {
	const entry = manifest[name];
	const css = new Set(entry.css);
	const seen = new Set([name]);

	// Static JS imports do not load their CSS. Include those styles in the HTML,
	// following Vite's backend integration order, and leave dynamic imports to Vite.
	function collectImports(chunk: ManifestChunk): void {
		for (const name of chunk.imports ?? []) {
			if (seen.has(name)) continue;
			seen.add(name);
			const imported = manifest[name];
			collectImports(imported);
			for (const file of imported.css ?? []) css.add(file);
		}
	}

	collectImports(entry);
	return { ...entry, css: [...css] };
}
