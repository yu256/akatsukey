/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
import { createRequire } from 'node:module';
import createFetchMock from 'vitest-fetch-mock';

const fetchMocker = createFetchMock(vi);
fetchMocker.enableMocks();

// Set i18n
import { updateI18n } from '@/i18n.js';
// The locale loader reads files in Node; keep Vite's browser asset rewriting out of it.
const locales = createRequire(import.meta.url)('../../../locales/index.js').default;
updateI18n(locales['en-US']);

// XXX: misskey-js panics if WebSocket is not defined
vi.stubGlobal('WebSocket', class WebSocket extends EventTarget { static CLOSING = 2; });

export const defaultStoreState: Record<string, unknown> = {

	// なんかtestがうまいこと動かないのでここに書く
	dataSaver: {
		media: false,
		avatar: false,
		urlPreview: false,
		code: false,
	},

};

// XXX: defaultStore somehow becomes undefined in vitest?
vi.mock('@/store.js', () => {
	return {
		defaultStore: {
			state: defaultStoreState,
		},
	};
});

// Add mocks for Web Audio API
const AudioNodeMock = vi.fn(function () {
	return {
		connect: vi.fn(() => ({ connect: vi.fn() })),
		start: vi.fn(),
	};
});

const GainNodeMock = vi.fn(function () {
	return {
		gain: vi.fn(),
	};
});

const AudioContextMock = vi.fn(function () {
	return {
		createBufferSource: vi.fn(() => new AudioNodeMock()),
		createGain: vi.fn(() => new GainNodeMock()),
		decodeAudioData: vi.fn(),
	};
});

vi.stubGlobal('AudioContext', AudioContextMock);
