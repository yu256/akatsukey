/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals';
import { Test } from '@nestjs/testing';
import Fastify from 'fastify';
import { ApiServerService } from '@/server/api/ApiServerService.js';
import { ChannelsService } from '@/server/api/stream/ChannelsService.js';
import MainStreamConnection from '@/server/api/stream/Connection.js';
import { genOpenapiSpec } from '@/server/api/openapi/gen-spec.js';
import FetchExternalResources from '@/server/api/endpoints/fetch-external-resources.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { TestingModule } from '@nestjs/testing';

describe('retired features', () => {
	const fastify = Fastify();
	let module: TestingModule;
	const config = { version: 'test', apiUrl: 'https://misskey.example/api' } as Config;
	const removedEndpoints = [
		'flash/create', 'flash/delete', 'flash/featured', 'flash/like', 'flash/show',
		'flash/unlike', 'flash/update', 'flash/my', 'flash/my-likes', 'users/flashs',
		'bubble-game/register', 'bubble-game/ranking', 'reversi/cancel-match',
		'reversi/games', 'reversi/match', 'reversi/invitations', 'reversi/show-game',
		'reversi/surrender', 'reversi/verify',
	];

	beforeAll(async () => {
		module = await Test.createTestingModule({
			providers: [ApiServerService, ChannelsService, { provide: DI.config, useValue: config }],
		}).useMocker(() => ({})).compile();
		// Endpoint implementations are never invoked for the removed paths.
		module.get(ApiServerService)['moduleRef'].get = jest.fn(() => ({ exec: jest.fn() })) as never;
		fastify.register(module.get(ApiServerService).createServer, { prefix: '/api' });
		await fastify.ready();
	});

	afterAll(async () => {
		await fastify.close();
		await module.close();
	});

	test.each(removedEndpoints)('does not expose %s through HTTP or the API specification', async endpoint => {
		for (const method of ['GET', 'POST'] as const) {
			const response = await fastify.inject({ method, url: `/api/${endpoint}` });
			expect(response.statusCode).toBe(404);
		}
		const spec = genOpenapiSpec(config);
		expect(spec.paths).not.toHaveProperty(`/${endpoint}`);
	});

	test.each(['reversi', 'reversiGame', 'unknown'])('ignores a connection request for %s', channel => {
		const service = module.get(ChannelsService);
		expect(service.getChannelService(channel)).toBeUndefined();
		const connection = new MainStreamConnection(service, {} as never, {} as never, {} as never, {} as never, null, null);
		expect(() => connection.connectChannel('old-client', {}, channel, true)).not.toThrow();
	});

	test('keeps normal timeline and main channels registered', () => {
		const service = module.get(ChannelsService);
		for (const channel of ['main', 'homeTimeline', 'localTimeline', 'globalTimeline']) {
			expect(service.getChannelService(channel)).toBeDefined();
		}
	});

	test('rejects an external plugin resource even with a matching hash', async () => {
		const data = 'plugin source';
		const endpoint = new FetchExternalResources({ getJson: async () => ({ type: 'plugin', data }) } as unknown as HttpRequestService);
		await expect(endpoint.exec({ url: 'https://vendor.example/plugin', hash: hash(data) }, {} as never, null))
			.rejects.toMatchObject({ code: 'EXT_RESOURCE_RETURNED_INVALID_SCHEMA' });
	});

	test('keeps external theme resources working', async () => {
		const data = '{ id: "theme", props: {} }';
		const endpoint = new FetchExternalResources({ getJson: async () => ({ type: 'theme', data }) } as unknown as HttpRequestService);
		await expect(endpoint.exec({ url: 'https://vendor.example/theme', hash: hash(data) }, {} as never, null))
			.resolves.toEqual({ type: 'theme', data });
	});
});

function hash(data: string): string {
	return createHash('sha512').update(data).digest('hex');
}
