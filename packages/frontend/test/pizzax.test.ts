/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Storage } from '@/pizzax.js';

const mocks = vi.hoisted(() => ({
	data: new Map<string, unknown>(),
	channels: new Map<string, (message: any) => void>(),
	stream: new Map<string, (message: any) => void>(),
	api: vi.fn(async () => ({ theme: 'dark', retiredSetting: 'old value' })),
}));

vi.mock('@/account.js', () => ({ $i: { id: 'test-user' } }));
vi.mock('@/store.js', () => ({ defaultStore: { ready: Promise.resolve() } }));
vi.mock('@/scripts/misskey-api.js', () => ({ misskeyApi: mocks.api }));
vi.mock('@/scripts/idb-proxy.js', () => ({
	get: async (key: string) => structuredClone(mocks.data.get(key)),
	set: async (key: string, value: unknown) => mocks.data.set(key, structuredClone(value)),
}));
vi.mock('@/stream.js', () => ({
	useStream: () => ({ useChannel: () => ({ on: (event: string, callback: (message: any) => void) => mocks.stream.set(event, callback) }) }),
}));
vi.mock('broadcast-channel', () => ({
	BroadcastChannel: class {
		constructor(private name: string) {}

		addEventListener(event: string, callback: (message: any) => void) {
			mocks.channels.set(this.name, callback);
		}
	},
}));

function createStore() {
	return new Storage('test', {
		animation: { where: 'device', default: true },
		menu: { where: 'deviceAccount', default: ['home'] },
		theme: { where: 'account', default: 'light' },
	});
}

describe('retired storage settings', () => {
	beforeEach(() => {
		localStorage.clear();
		mocks.data.clear();
		mocks.channels.clear();
		mocks.stream.clear();
	});

	test('erases removed settings from persistent storage and keeps supported values', async () => {
		mocks.data.set('pizzax::test', { animation: false, VRChatAuth: 'old credential', VRChatURL: 'old proxy' });
		mocks.data.set('pizzax::test::test-user', { menu: ['notifications'], retiredSetting: 'old value' });
		mocks.data.set('pizzax::test::cache::test-user', { theme: 'dark', retiredSetting: 'old value' });

		const store = createStore();
		await store.loaded;

		expect(mocks.data.get('pizzax::test')).toEqual({ animation: false });
		expect(mocks.data.get('pizzax::test::test-user')).toEqual({ menu: ['notifications'] });
		expect(mocks.data.get('pizzax::test::cache::test-user')).toEqual({ theme: 'dark' });
		expect(store.state).toEqual({ animation: false, menu: ['notifications'], theme: 'dark' });
	});

	test('erases removed credentials when migrating old localStorage data', async () => {
		localStorage.setItem('pizzax::test', JSON.stringify({ animation: false, VRChatAuth: 'old credential' }));

		const store = createStore();
		await store.loaded;

		expect(localStorage.getItem('pizzax::test')).toBeNull();
		expect(mocks.data.get('pizzax::test')).toEqual({ animation: false });
	});

	test('ignores removed settings from older tabs and registry events', async () => {
		const store = createStore();
		await store.loaded;

		const broadcast = mocks.channels.get('pizzax::test')!;
		const registry = mocks.stream.get('registryUpdated')!;
		expect(() => broadcast({ where: 'device', key: 'retiredSetting', value: 'old value' })).not.toThrow();
		expect(() => registry({ scope: ['client', 'test'], key: 'retiredSetting', value: 'old value' })).not.toThrow();
		expect(store.state).not.toHaveProperty('retiredSetting');

		broadcast({ where: 'device', key: 'animation', value: false });
		expect(store.state.animation).toBe(false);
		registry({ scope: ['client', 'test'], key: 'theme', value: 'blue' });
		expect(store.state.theme).toBe('blue');
	});
});
