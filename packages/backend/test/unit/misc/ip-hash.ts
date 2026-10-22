/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getIpHash } from '@/misc/get-ip-hash.js';

describe('getIpHash', () => {
	test.each([
		['192.0.2.1', 'ip-1h9u1vl'],
		['192.0.2.1:8080', 'ip-1h9u1vl'],
		['::ffff:192.0.2.1', 'ip-1h9u1vl'],
		['2001:db8:abcd:1234::1', 'ip-hir691dgwto4'],
		['2001:db8:abcd:1234:ffff::2', 'ip-hir691dgwto4'],
		['2001:db8:abcd:1235::1', 'ip-hir691dgwto5'],
		['127.0.0.1', 'ip-z8kflt'],
	])('preserves the address or IPv6 /64 hash for %s', (address, hash) => {
		expect(getIpHash(address)).toBe(hash);
	});

	test('rejects ambiguous IPv4 octets with leading zeros', () => {
		expect(() => getIpHash('0177.0.0.1')).toThrow();
	});
});
