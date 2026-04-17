/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { filterSigninHeaders } from '@/misc/signin-headers.js';

describe('filterSigninHeaders', () => {
	describe('strips sensitive headers', () => {
		test('removes authorization', () => {
			const result = filterSigninHeaders({ authorization: 'Bearer secret-token', 'user-agent': 'Mozilla' });
			expect(result).not.toHaveProperty('authorization');
			expect(result).toHaveProperty('user-agent', 'Mozilla');
		});

		test('removes cookie and set-cookie', () => {
			const result = filterSigninHeaders({
				cookie: 'session=abc',
				'set-cookie': 'x=1',
				'user-agent': 'Mozilla',
			});
			expect(result).not.toHaveProperty('cookie');
			expect(result).not.toHaveProperty('set-cookie');
		});

		test('removes proxy authorization and API key headers', () => {
			const result = filterSigninHeaders({
				'proxy-authorization': 'Basic abc',
				'x-api-key': 'secret',
				'x-auth-token': 'secret',
			});
			expect(result).not.toHaveProperty('proxy-authorization');
			expect(result).not.toHaveProperty('x-api-key');
			expect(result).not.toHaveProperty('x-auth-token');
		});

		test('strips headers case-insensitively', () => {
			const result = filterSigninHeaders({
				Authorization: 'Bearer x',
				COOKIE: 'a=1',
				'X-Api-Key': 'k',
			});
			expect(result).not.toHaveProperty('Authorization');
			expect(result).not.toHaveProperty('COOKIE');
			expect(result).not.toHaveProperty('X-Api-Key');
		});
	});

	describe('retains benign headers', () => {
		test('keeps user-agent and accept-language', () => {
			const result = filterSigninHeaders({
				'user-agent': 'Firefox/125',
				'accept-language': 'ja-JP',
			});
			expect(result['user-agent']).toBe('Firefox/125');
			expect(result['accept-language']).toBe('ja-JP');
		});
	});

	describe('edge cases', () => {
		test('handles empty input', () => {
			expect(filterSigninHeaders({})).toEqual({});
		});

		test('handles null/undefined input', () => {
			expect(filterSigninHeaders(null as any)).toEqual({});
			expect(filterSigninHeaders(undefined as any)).toEqual({});
		});

		test('does not mutate input', () => {
			const input = { authorization: 'x', 'user-agent': 'y' };
			const copy = { ...input };
			filterSigninHeaders(input);
			expect(input).toEqual(copy);
		});
	});
});
