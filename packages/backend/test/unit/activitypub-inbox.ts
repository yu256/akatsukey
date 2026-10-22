/*
 * SPDX-FileCopyrightText: misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals';
import { Test } from '@nestjs/testing';
import Fastify from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import { ActivityPubServerService } from '@/server/ActivityPubServerService.js';
import { QueueService } from '@/core/QueueService.js';
import { DI } from '@/di-symbols.js';
import type { TestingModule } from '@nestjs/testing';

describe('ActivityPub inbox parsing', () => {
	const fastify = Fastify();
	const inbox = jest.fn();
	const payload = '{ "type": "Create", "content": "あいう" }\n';
	const digest = `SHA-256=${createHash('sha256').update(payload).digest('base64')}`;
	let module: TestingModule;

	beforeAll(async () => {
		module = await Test.createTestingModule({
			providers: [
				ActivityPubServerService,
				{ provide: DI.config, useValue: { host: 'misskey.example' } },
				{ provide: QueueService, useValue: { inbox } },
			],
		}).useMocker(() => ({})).compile();
		await fastify.register(fastifyRawBody, { global: false, encoding: null, runFirst: true });
		fastify.register(module.get(ActivityPubServerService).createServer);
		await fastify.ready();
	});

	afterAll(async () => {
		await fastify.close();
		await module.close();
	});

	function post(contentType: string, requestDigest = digest) {
		return fastify.inject({
			method: 'POST', url: '/inbox', payload,
			headers: {
				host: 'misskey.example',
				'content-type': contentType,
				date: new Date().toUTCString(),
				digest: requestDigest,
				signature: 'keyId="https://remote.example/key",algorithm="rsa-sha256",headers="host digest",signature="YWJj"',
			},
		});
	}

	test.each([
		'application/activity+json',
		'application/ld+json; profile="https://www.w3.org/ns/activitystreams"; charset=utf-8',
	])('preserves exact bytes for Digest validation with %s', async contentType => {
		inbox.mockClear();
		const response = await post(contentType);
		expect(response.statusCode).toBe(202);
		expect(inbox).toHaveBeenCalledWith(JSON.parse(payload), expect.any(Object));
	});

	test('rejects a digest computed from reserialized JSON', async () => {
		inbox.mockClear();
		const normalized = JSON.stringify(JSON.parse(payload));
		const response = await post('application/activity+json', `SHA-256=${createHash('sha256').update(normalized).digest('base64')}`);
		expect(response.statusCode).toBe(401);
		expect(inbox).not.toHaveBeenCalled();
	});
});
