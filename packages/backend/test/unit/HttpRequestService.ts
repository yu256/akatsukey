/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as http from 'node:http';
import got from 'got';
import { Test } from '@nestjs/testing';
import { DI } from '@/di-symbols.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { Config } from '@/config.js';
import type { TestingModule } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';

const mockLoggerService = {
	getLogger: () => ({
		info: () => {},
		warn: () => {},
		error: () => {},
		debug: () => {},
		succ: () => {},
		createSubLogger: () => mockLoggerService.getLogger(),
	}),
};

const testConfig: Partial<Config> = {
	url: 'https://test.example.com',
	userAgent: 'Misskey/test',
	allowedPrivateNetworks: [],
	proxy: undefined,
	proxyBypassHosts: [],
	outgoingAddress: undefined,
	deliverJobConcurrency: 128,
} as Partial<Config>;

describe('HttpRequestService', () => {
	let app: TestingModule;
	let httpRequestService: HttpRequestService;

	beforeAll(async () => {
		app = await Test.createTestingModule({
			providers: [
				{ provide: DI.config, useValue: testConfig },
				{ provide: LoggerService, useValue: mockLoggerService },
				HttpRequestService,
			],
		}).compile();
		httpRequestService = app.get(HttpRequestService);
	});

	afterAll(async () => {
		await app.close();
	});

	// =========================================================================
	// isPrivateIp — pure function tests
	// =========================================================================
	describe('isPrivateIp', () => {
		// --- IPv4: should BLOCK ---
		const blockedV4 = [
			['0.0.0.0', 'unspecified (0.0.0.0/8)'],
			['0.255.255.255', 'unspecified upper bound'],
			['10.0.0.1', 'private 10/8'],
			['10.255.255.255', 'private 10/8 upper'],
			['127.0.0.1', 'loopback'],
			['127.255.255.255', 'loopback upper'],
			['169.254.0.1', 'link-local'],
			['169.254.255.255', 'link-local upper'],
			['172.16.0.1', 'private 172.16/12'],
			['172.31.255.255', 'private 172.16/12 upper'],
			['192.168.0.1', 'private 192.168/16'],
			['192.168.255.255', 'private 192.168/16 upper'],
			['100.64.0.1', 'carrier-grade NAT (100.64/10)'],
			['100.127.255.255', 'carrier-grade NAT upper'],
			['198.18.0.1', 'benchmarking (198.18/15)'],
			['198.19.255.255', 'benchmarking upper'],
			['224.0.0.1', 'multicast'],
			['239.255.255.255', 'multicast upper'],
			['255.255.255.255', 'broadcast'],
			['192.0.2.1', 'TEST-NET-1 (192.0.2/24)'],
			['198.51.100.1', 'TEST-NET-2 (198.51.100/24)'],
			['203.0.113.1', 'TEST-NET-3 (203.0.113/24)'],
			['240.0.0.1', 'reserved (240/4)'],
		] as const;

		for (const [ip, description] of blockedV4) {
			test(`blocks IPv4 ${ip} (${description})`, () => {
				expect(httpRequestService.isPrivateIp(ip)).toBe(true);
			});
		}

		// --- IPv4: should ALLOW ---
		const allowedV4 = [
			['8.8.8.8', 'Google DNS'],
			['1.1.1.1', 'Cloudflare DNS'],
			['93.184.216.34', 'example.com'],
		] as const;

		for (const [ip, description] of allowedV4) {
			test(`allows IPv4 ${ip} (${description})`, () => {
				expect(httpRequestService.isPrivateIp(ip)).toBe(false);
			});
		}

		// --- IPv6: should BLOCK ---
		const blockedV6 = [
			['::1', 'loopback'],
			['::', 'unspecified'],
			['fc00::1', 'unique-local (fc00::/7)'],
			['fd00::1', 'unique-local (fd00::/8)'],
			['fe80::1', 'link-local (fe80::/10)'],
			['ff02::1', 'multicast'],
			['ff05::1', 'multicast (site-local)'],
			['2001:db8::1', 'documentation reserved'],
		] as const;

		for (const [ip, description] of blockedV6) {
			test(`blocks IPv6 ${ip} (${description})`, () => {
				expect(httpRequestService.isPrivateIp(ip)).toBe(true);
			});
		}

		// --- IPv6: should ALLOW ---
		const allowedV6 = [
			['2607:f8b0:4004:800::200e', 'Google (unicast)'],
			['2606:4700:4700::1111', 'Cloudflare DNS (unicast)'],
		] as const;

		for (const [ip, description] of allowedV6) {
			test(`allows IPv6 ${ip} (${description})`, () => {
				expect(httpRequestService.isPrivateIp(ip)).toBe(false);
			});
		}

		// --- IPv4-mapped IPv6: critical SSRF bypass vector ---
		test('blocks ::ffff:127.0.0.1 (IPv4-mapped loopback)', () => {
			expect(httpRequestService.isPrivateIp('::ffff:127.0.0.1')).toBe(true);
		});

		test('blocks ::ffff:10.0.0.1 (IPv4-mapped private)', () => {
			expect(httpRequestService.isPrivateIp('::ffff:10.0.0.1')).toBe(true);
		});

		test('blocks ::ffff:169.254.0.1 (IPv4-mapped link-local)', () => {
			expect(httpRequestService.isPrivateIp('::ffff:169.254.0.1')).toBe(true);
		});

		test('blocks ::ffff:192.168.1.1 (IPv4-mapped private)', () => {
			expect(httpRequestService.isPrivateIp('::ffff:192.168.1.1')).toBe(true);
		});

		test('allows ::ffff:8.8.8.8 (IPv4-mapped public)', () => {
			expect(httpRequestService.isPrivateIp('::ffff:8.8.8.8')).toBe(false);
		});

		test('allows ::ffff:1.1.1.1 (IPv4-mapped public)', () => {
			expect(httpRequestService.isPrivateIp('::ffff:1.1.1.1')).toBe(false);
		});

		// --- Unparseable addresses: should reject ---
		test('blocks garbage input', () => {
			expect(httpRequestService.isPrivateIp('not-an-ip')).toBe(true);
		});

		test('blocks empty string', () => {
			expect(httpRequestService.isPrivateIp('')).toBe(true);
		});
	});

	// =========================================================================
	// validateUrl — pure function tests
	// =========================================================================
	describe('validateUrl', () => {
		test('accepts http URL', () => {
			expect(() => httpRequestService.validateUrl('http://example.com')).not.toThrow();
		});

		test('accepts https URL', () => {
			expect(() => httpRequestService.validateUrl('https://example.com')).not.toThrow();
		});

		test('accepts URL with port', () => {
			expect(() => httpRequestService.validateUrl('https://example.com:8443/path')).not.toThrow();
		});

		test('rejects file:// protocol', () => {
			expect(() => httpRequestService.validateUrl('file:///etc/passwd')).toThrow();
		});

		test('rejects ftp:// protocol', () => {
			expect(() => httpRequestService.validateUrl('ftp://example.com/file')).toThrow();
		});

		test('rejects gopher:// protocol', () => {
			expect(() => httpRequestService.validateUrl('gopher://example.com')).toThrow();
		});

		test('rejects javascript: protocol', () => {
			expect(() => httpRequestService.validateUrl('javascript:alert(1)')).toThrow();
		});

		test('rejects data: protocol', () => {
			expect(() => httpRequestService.validateUrl('data:text/html,<h1>hi</h1>')).toThrow();
		});

		test('rejects URL with username', () => {
			expect(() => httpRequestService.validateUrl('https://user@example.com')).toThrow();
		});

		test('rejects URL with username:password', () => {
			expect(() => httpRequestService.validateUrl('https://user:pass@example.com')).toThrow();
		});

		test('rejects invalid URL', () => {
			expect(() => httpRequestService.validateUrl('not a url')).toThrow();
		});

		test('rejects empty string', () => {
			expect(() => httpRequestService.validateUrl('')).toThrow();
		});
	});

	// =========================================================================
	// send() — behaviour tests (the actual SSRF protection wiring)
	// =========================================================================
	describe('send', () => {
		test('blocks request to loopback IP literal', async () => {
			const server = http.createServer((_req, res) => {
				res.writeHead(200, { 'Content-Type': 'text/plain' });
				res.end('should not reach here');
			});
			await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
			const port = (server.address() as AddressInfo).port;

			try {
				await expect(
					httpRequestService.send(`http://127.0.0.1:${port}/`, {}, { throwErrorWhenResponseNotOk: true }),
				).rejects.toThrow(/SSRF/i);
			} finally {
				server.close();
			}
		});

		test('blocks request to localhost via DNS lookup guard', async () => {
			await expect(
				httpRequestService.send('http://localhost:9999/', {}, { throwErrorWhenResponseNotOk: true }),
			).rejects.toThrow(/SSRF/i);
		});

		test('blocks file:// protocol via send()', async () => {
			await expect(
				httpRequestService.send('file:///etc/passwd', {}, { throwErrorWhenResponseNotOk: true }),
			).rejects.toThrow(/protocol/i);
		});

		test('blocks credential URL via send()', async () => {
			await expect(
				httpRequestService.send('https://user:pass@example.com/', {}, { throwErrorWhenResponseNotOk: true }),
			).rejects.toThrow(/credentials/i);
		});

		// These tests use got directly with httpAgent to exercise the actual
		// consumer pattern that third-party libraries (summaly, etc.) follow.
		// They verify end-to-end protection, not just the guard in isolation.
		test('got via httpAgent blocks IPv4 literal (createConnection guard)', async () => {
			await expect(
				got('http://127.0.0.1:9999/', {
					agent: { http: httpRequestService.httpAgent },
					retry: { limit: 0 },
					timeout: { request: 2000 },
				}),
			).rejects.toMatchObject({ code: 'ESSRF' });
		});

		test('got via httpAgent blocks IPv6 literal (createConnection guard)', async () => {
			// Node passes the unbracketed form "::1" to createConnection.
			await expect(
				got('http://[::1]:9999/', {
					agent: { http: httpRequestService.httpAgent },
					retry: { limit: 0 },
					timeout: { request: 2000 },
				}),
			).rejects.toMatchObject({ code: 'ESSRF' });
		});

		test('got via httpAgent blocks hostname that resolves to private IP (safeLookup guard)', async () => {
			await expect(
				got('http://localhost:9999/', {
					agent: { http: httpRequestService.httpAgent },
					retry: { limit: 0 },
					timeout: { request: 2000 },
				}),
			).rejects.toMatchObject({ code: 'ESSRF' });
		});
	});

	// =========================================================================
	// send() redirect tests — uses loopback-allowed service to exercise redirect logic
	// =========================================================================
	describe('send (redirect handling)', () => {
		let loopbackService: HttpRequestService;
		let loopbackApp: TestingModule;

		beforeAll(async () => {
			loopbackApp = await Test.createTestingModule({
				providers: [
					{
						provide: DI.config,
						useValue: {
							...testConfig,
							allowedPrivateNetworks: ['127.0.0.0/8'],
						},
					},
					{ provide: LoggerService, useValue: mockLoggerService },
					HttpRequestService,
				],
			}).compile();
			loopbackService = loopbackApp.get(HttpRequestService);
		});

		afterAll(async () => {
			await loopbackApp.close();
		});

		test('blocks redirect to file:// protocol', async () => {
			const server = http.createServer((_req, res) => {
				res.writeHead(302, { Location: 'file:///etc/passwd' });
				res.end();
			});
			await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
			const port = (server.address() as AddressInfo).port;

			try {
				await expect(
					loopbackService.send(`http://127.0.0.1:${port}/`, {}, { throwErrorWhenResponseNotOk: true }),
				).rejects.toThrow(/protocol/i);
			} finally {
				server.close();
			}
		});

		test('blocks redirect to private IP when loopback is allowed', async () => {
			const redirector = http.createServer((_req, res) => {
				res.writeHead(302, { Location: 'http://10.0.0.1:9999/' });
				res.end();
			});
			await new Promise<void>(resolve => redirector.listen(0, '127.0.0.1', resolve));
			const port = (redirector.address() as AddressInfo).port;

			try {
				await expect(
					loopbackService.send(`http://127.0.0.1:${port}/`, {}, { throwErrorWhenResponseNotOk: true }),
				).rejects.toThrow(/SSRF/i);
			} finally {
				redirector.close();
			}
		});

		test('strips headers on cross-origin redirect', async () => {
			let receivedHeaders: Record<string, string | string[] | undefined> = {};

			const target = http.createServer((req, res) => {
				receivedHeaders = req.headers;
				res.writeHead(200, { 'Content-Type': 'text/plain' });
				res.end('ok');
			});
			await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve));
			const targetPort = (target.address() as AddressInfo).port;

			const redirector = http.createServer((_req, res) => {
				// Redirect to a different port = different origin
				res.writeHead(302, { Location: `http://127.0.0.1:${targetPort}/` });
				res.end();
			});
			await new Promise<void>(resolve => redirector.listen(0, '127.0.0.1', resolve));
			const redirectorPort = (redirector.address() as AddressInfo).port;

			try {
				await loopbackService.send(`http://127.0.0.1:${redirectorPort}/`, {
					headers: { 'Authorization': 'Bearer secret-token', 'X-Custom': 'value' },
				}, { throwErrorWhenResponseNotOk: true });

				// After cross-origin redirect (different port), caller-supplied headers should be stripped
				expect(receivedHeaders['authorization']).toBeUndefined();
				expect(receivedHeaders['x-custom']).toBeUndefined();
			} finally {
				target.close();
				redirector.close();
			}
		});

		test('follows same-origin redirect and preserves headers', async () => {
			let receivedHeaders: Record<string, string | string[] | undefined> = {};

			const server = http.createServer((req, res) => {
				if (req.url === '/redirect') {
					res.writeHead(302, { Location: '/target' });
					res.end();
				} else {
					receivedHeaders = req.headers;
					res.writeHead(200, { 'Content-Type': 'text/plain' });
					res.end('ok');
				}
			});
			await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
			const port = (server.address() as AddressInfo).port;

			try {
				const res = await loopbackService.send(`http://127.0.0.1:${port}/redirect`, {
					headers: { 'Authorization': 'Bearer keep-me' },
				}, { throwErrorWhenResponseNotOk: true });

				expect(res.status).toBe(200);
				// Same-origin redirect: headers should be preserved
				expect(receivedHeaders['authorization']).toBe('Bearer keep-me');
			} finally {
				server.close();
			}
		});
	});
});
