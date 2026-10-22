/*
 * SPDX-FileCopyrightText: misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { describe, expect, jest, test } from '@jest/globals';
import cbor from 'cbor';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import { WebAuthnService } from '@/core/WebAuthnService.js';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Config } from '@/config.js';
import type { MetaService } from '@/core/MetaService.js';
import type { UserSecurityKeysRepository } from '@/models/_.js';
import type { Redis } from 'ioredis';

const userId = '9x12345678';
const origin = 'https://misskey.example:8443';
const rpID = 'misskey.example';

function fixture(legacy = false) {
	const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
	const jwk = publicKey.export({ format: 'jwk' });
	const x = Buffer.from(jwk.x!, 'base64url');
	const y = Buffer.from(jwk.y!, 'base64url');
	const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([
		[1, 2], [3, -7], [-1, 1], [-2, x], [-3, y],
	]));
	const credentialId = randomBytes(32);
	const key = {
		id: credentialId.toString('base64url'),
		publicKey: Buffer.from(legacy ? Buffer.concat([Buffer.from([4]), x, y]) : cose).toString('base64url'),
		counter: 0,
		transports: ['internal'],
	};
	const challenges = new Map<string, string>();
	const redis = {
		async setex(name: string, _ttl: number, challenge: string) { challenges.set(name, challenge); },
		async getdel(name: string) {
			const challenge = challenges.get(name);
			challenges.delete(name);
			return challenge ?? null;
		},
	};
	const repository = {
		async findBy() { return [key]; },
		async findOneBy() { return key; },
		async update(_where: unknown, changes: Partial<typeof key>) { Object.assign(key, changes); },
	};
	const service = new WebAuthnService(
		redis as unknown as Redis,
		{ url: origin, host: 'misskey.example:8443', hostname: rpID } as Config,
		repository as unknown as UserSecurityKeysRepository,
		{ async fetch() { return { name: 'Misskey' }; } } as unknown as MetaService,
	);
	const rpHash = createHash('sha256').update(rpID).digest();

	function registration(challenge: string): RegistrationResponseJSON {
		const length = Buffer.alloc(2);
		length.writeUInt16BE(credentialId.length);
		return {
			id: key.id,
			rawId: key.id,
			type: 'public-key',
			clientExtensionResults: {},
			response: {
				clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin })).toString('base64url'),
				attestationObject: cbor.encode({
					fmt: 'none',
					attStmt: {},
					authData: Buffer.concat([rpHash, Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), length, credentialId, cose]),
				}).toString('base64url'),
				transports: key.transports,
			},
		};
	}

	function authentication(challenge: string, responseOrigin = origin): AuthenticationResponseJSON {
		const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: responseOrigin }));
		const authData = Buffer.concat([rpHash, Buffer.from([0x05, 0, 0, 0, 1])]);
		const signature = sign('sha256', Buffer.concat([authData, createHash('sha256').update(clientData).digest()]), privateKey);
		return {
			id: key.id,
			rawId: key.id,
			type: 'public-key',
			clientExtensionResults: {},
			response: {
				clientDataJSON: clientData.toString('base64url'),
				authenticatorData: authData.toString('base64url'),
				signature: signature.toString('base64url'),
			},
		};
	}

	return { service, key, cose, registration, authentication };
}

describe('WebAuthnService', () => {
	test('registers a credential and authenticates with the persisted base64url key', async () => {
		const { service, key, cose, registration, authentication } = fixture();
		const options = await service.initiateRegistration(userId, 'alice');
		expect(options.rp.id).toBe(rpID);
		expect(Buffer.from(options.user.id, 'base64url').toString()).toBe(userId);
		expect(options.excludeCredentials?.[0].id).toBe(key.id);
		const registered = await service.verifyRegistration(userId, registration(options.challenge));
		expect(registered.credentialID).toBe(key.id);
		expect(Buffer.from(registered.credentialPublicKey)).toEqual(Buffer.from(cose));
		key.publicKey = Buffer.from(registered.credentialPublicKey).toString('base64url');
		const request = await service.initiateAuthentication(userId);
		expect(request.rpId).toBe(rpID);
		expect(request.allowCredentials?.[0].id).toBe(key.id);
		const response = authentication(request.challenge);
		await expect(service.verifyAuthentication(userId, response)).resolves.toBe(true);
		expect(key.counter).toBe(1);
		await expect(service.verifyAuthentication(userId, response)).rejects.toThrow('challenge not found');
	});

	test('authenticates and migrates a legacy uncompressed EC key', async () => {
		const { service, key, cose, authentication } = fixture(true);
		const request = await service.initiateAuthentication(userId);
		await expect(service.verifyAuthentication(userId, authentication(request.challenge))).resolves.toBe(true);
		expect(key.publicKey).toBe(Buffer.from(cose).toString('base64url'));
		expect(key.counter).toBe(1);
	});

	test('rejects a valid signature for another origin without updating the counter', async () => {
		const { service, key, authentication } = fixture();
		const request = await service.initiateAuthentication(userId);
		const error = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await expect(service.verifyAuthentication(userId, authentication(request.challenge, 'https://other.example'))).rejects.toThrow('verification failed');
			expect(key.counter).toBe(0);
		} finally {
			error.mockRestore();
		}
	});
});
