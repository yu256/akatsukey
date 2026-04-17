/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Deny-list of header names that must never be persisted or returned with
// signin history records. Matching is case-insensitive. These typically
// carry bearer tokens, session cookies or other secrets that would let an
// attacker replay the request or escalate to full account takeover if the
// history leaked (via i/signin-history, admin/show-user, etc.).
const SENSITIVE_HEADERS = new Set([
	'authorization',
	'proxy-authorization',
	'cookie',
	'set-cookie',
	'x-api-key',
	'x-auth-token',
	'x-csrf-token',
	'x-access-token',
	'x-forwarded-authorization',
]);

type HeaderValue = string | string[] | undefined;
export type SigninHeaders = Record<string, HeaderValue>;

export function filterSigninHeaders(headers: SigninHeaders | null | undefined): SigninHeaders {
	if (headers == null) return {};

	const out: SigninHeaders = {};
	for (const key of Object.keys(headers)) {
		if (SENSITIVE_HEADERS.has(key.toLowerCase())) continue;
		out[key] = headers[key];
	}
	return out;
}
