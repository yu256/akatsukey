/*
 * SPDX-FileCopyrightText: misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals';
import { Test } from '@nestjs/testing';
import Fastify from 'fastify';
import { DI } from '@/di-symbols.js';
import { LoggerService } from '@/core/LoggerService.js';
import { OAuth2ProviderService } from '@/server/oauth/OAuth2ProviderService.js';
import type { TestingModule } from '@nestjs/testing';

describe('OAuth2ProviderService middleware', () => {
	const fastify = Fastify();
	let module: TestingModule;

	beforeAll(async () => {
		// Express replaces the response prototype. Preserve inject's payload capture methods.
		fastify.addHook('onRequest', (request, reply, done) => {
			reply.raw.write = reply.raw.write.bind(reply.raw);
			reply.raw.end = reply.raw.end.bind(reply.raw);
			reply.raw.writeHead = reply.raw.writeHead.bind(reply.raw);
			done();
		});
		const intervals = jest.spyOn(global, 'setInterval');
		module = await Test.createTestingModule({
			providers: [
				OAuth2ProviderService,
				{ provide: DI.config, useValue: { url: 'https://misskey.example', version: 'test' } },
				{ provide: LoggerService, useValue: { getLogger: () => ({ info() {} }) } },
			],
		}).useMocker(() => ({})).compile();
		// The grant-code cache owns a periodic GC timer; no clock advances in these tests.
		for (const result of intervals.mock.results) {
			if (result.type === 'return') clearInterval(result.value);
		}
		intervals.mockRestore();
		const service = module.get(OAuth2ProviderService);
		fastify.register(service.createServer, { prefix: '/oauth' });
		fastify.register(service.createTokenServer, { prefix: '/oauth/token' });
		await fastify.ready();
	});

	afterAll(async () => {
		await fastify.close();
		await module.close();
	});

	test.each(['/oauth/authorize', '/oauth/%61uthorize'])('requires OAuth parameters at %s', async url => {
		const response = await fastify.inject({ method: 'GET', url });
		expect(response.statusCode).toBe(400);
	});

	test.each(['/oauth/token', '/oauth/%74oken'])('rejects unsupported grants at %s', async url => {
		const response = await fastify.inject({
			method: 'POST', url,
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			payload: 'grant_type=unsupported',
		});
		expect(response.statusCode).toBe(501);
		expect(response.json().error).toBe('unsupported_grant_type');
	});

	test('returns an OAuth error when the token request has no body', async () => {
		const response = await fastify.inject({ method: 'POST', url: '/oauth/token' });
		expect(response.statusCode).toBe(501);
		expect(response.json().error).toBe('unsupported_grant_type');
	});

	test('decodes a percent sign only once', async () => {
		const response = await fastify.inject({ method: 'GET', url: '/oauth/%25unknown' });
		expect(response.statusCode).toBe(404);
	});
});
