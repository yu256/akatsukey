/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as dns from 'node:dns';
import ipaddr from 'ipaddr.js';
import CacheableLookup from 'cacheable-lookup';
import fetch from 'node-fetch';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { StatusError } from '@/misc/status-error.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { validateContentTypeSetAsActivityPub } from '@/core/activitypub/misc/validator.js';
import type { IObject } from '@/core/activitypub/type.js';
import type { Response } from 'node-fetch';
import type { URL } from 'node:url';

export type HttpRequestSendOptions = {
	throwErrorWhenResponseNotOk: boolean;
	validators?: ((res: Response) => void)[];
};

const MAX_REDIRECTS = 20;

@Injectable()
export class HttpRequestService {
	/**
	 * Get http non-proxy agent
	 */
	private http: http.Agent;

	/**
	 * Get https non-proxy agent
	 */
	private https: https.Agent;

	/**
	 * Get http proxy or non-proxy agent
	 */
	public httpAgent: http.Agent;

	/**
	 * Get https proxy or non-proxy agent
	 */
	public httpsAgent: https.Agent;

	private logger: Logger;

	/**
	 * Parsed allowedPrivateNetworks CIDRs, computed once at construction.
	 */
	private allowedCidrs: [ipaddr.IPv4 | ipaddr.IPv6, number][];

	constructor(
		@Inject(DI.config)
		private config: Config,

		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('http-request');

		// Pre-parse allowedPrivateNetworks once. Malformed entries are logged and skipped.
		this.allowedCidrs = [];
		for (const cidrStr of config.allowedPrivateNetworks ?? []) {
			try {
				this.allowedCidrs.push(ipaddr.parseCIDR(cidrStr));
			} catch {
				this.logger.warn(`Ignoring malformed allowedPrivateNetworks entry: ${cidrStr}`);
			}
		}

		const cache = new CacheableLookup({
			maxTtl: 3600,	// 1hours
			errorTtl: 30,	// 30secs
			lookup: false,	// nativeのdns.lookupにfallbackしない
		});

		const safeLookup = this.createSafeLookup(cache.lookup as unknown as net.LookupFunction);

		this.http = new http.Agent({
			keepAlive: true,
			keepAliveMsecs: 30 * 1000,
			lookup: safeLookup,
			localAddress: config.outgoingAddress,
		});

		this.https = new https.Agent({
			keepAlive: true,
			keepAliveMsecs: 30 * 1000,
			lookup: safeLookup,
			localAddress: config.outgoingAddress,
		});

		const maxSockets = Math.max(256, config.deliverJobConcurrency ?? 128);

		this.httpAgent = config.proxy
			? new HttpProxyAgent({
				keepAlive: true,
				keepAliveMsecs: 30 * 1000,
				maxSockets,
				maxFreeSockets: 256,
				scheduling: 'lifo',
				proxy: config.proxy,
				localAddress: config.outgoingAddress,
			})
			: this.http;

		this.httpsAgent = config.proxy
			? new HttpsProxyAgent({
				keepAlive: true,
				keepAliveMsecs: 30 * 1000,
				maxSockets,
				maxFreeSockets: 256,
				scheduling: 'lifo',
				proxy: config.proxy,
				localAddress: config.outgoingAddress,
			})
			: this.https;
	}

	/**
	 * Wrap a lookup function to reject private/reserved IP addresses after DNS resolution.
	 * This catches DNS rebinding and CNAME-chain attacks because every resolution goes through this check.
	 */
	@bindThis
	private createSafeLookup(baseLookup: net.LookupFunction): net.LookupFunction {
		return ((hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => {
			baseLookup(hostname, options, (err, address, family) => {
				if (err) return callback(err, address, family);

				// When options.all is true, address is LookupAddress[]; otherwise it's a string.
				if (Array.isArray(address)) {
					for (const entry of address) {
						if (this.isPrivateIp(entry.address)) {
							this.logger.warn(`SSRF blocked: ${hostname} resolved to private address ${entry.address}`);
							return callback(
								Object.assign(new Error(`SSRF blocked: request to ${hostname} was denied`), { code: 'ESSRF' }),
								address,
								family,
							);
						}
					}
				} else if (typeof address === 'string') {
					if (this.isPrivateIp(address)) {
						this.logger.warn(`SSRF blocked: ${hostname} resolved to private address ${address}`);
						return callback(
							Object.assign(new Error(`SSRF blocked: request to ${hostname} was denied`), { code: 'ESSRF' }),
							address,
							family,
						);
					}
				}

				return callback(null, address, family);
			});
		}) as net.LookupFunction;
	}

	/**
	 * Check if an IP address falls into a private/reserved/non-unicast range.
	 * Covers: 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12,
	 * 192.168.0.0/16, 100.64.0.0/10, 198.18.0.0/15, multicast, broadcast, reserved,
	 * ::1/128, ::/128, fc00::/7, fe80::/10, IPv6 multicast, IPv4-mapped IPv6.
	 */
	@bindThis
	public isPrivateIp(ip: string): boolean {
		let parsed: ipaddr.IPv4 | ipaddr.IPv6;
		try {
			parsed = ipaddr.parse(ip);
		} catch {
			// Unparseable = reject
			return true;
		}

		// Check pre-parsed allowedPrivateNetworks (operator-configured exceptions)
		if (this.matchesAllowedCidr(parsed)) return false;

		// For IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1), extract the IPv4 part and check it.
		// Without this, ::ffff:8.8.8.8 would be blocked (range='ipv4Mapped') even though it's public.
		if (parsed.kind() === 'ipv6') {
			const v6 = parsed as ipaddr.IPv6;
			if (v6.isIPv4MappedAddress()) {
				const v4 = v6.toIPv4Address();
				if (this.matchesAllowedCidr(v4)) return false;
				return v4.range() !== 'unicast';
			}
		}

		// ipaddr.js range() returns 'unicast' for publicly routable addresses.
		// Everything else (loopback, private, linkLocal, carrierGradeNat, reserved,
		// multicast, broadcast, unspecified, uniqueLocal, etc.) is non-unicast.
		return parsed.range() !== 'unicast';
	}

	@bindThis
	private matchesAllowedCidr(parsed: ipaddr.IPv4 | ipaddr.IPv6): boolean {
		for (const cidr of this.allowedCidrs) {
			if (cidr[0].kind() === parsed.kind() && parsed.match(cidr)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Validate a URL string for SSRF-safe outbound requests.
	 * - Protocol must be http: or https: (blocks file:, ftp:, gopher:, etc.)
	 * - Credentials in URL are rejected (user:pass@host)
	 * - URL must be parseable
	 */
	@bindThis
	public validateUrl(url: string): URL {
		let parsed: globalThis.URL;
		try {
			parsed = new globalThis.URL(url);
		} catch {
			throw new StatusError(`Invalid URL: ${url}`, 400, 'Bad Request');
		}

		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			throw new StatusError(`Blocked protocol: ${parsed.protocol}`, 400, 'Bad Request');
		}

		if (parsed.username || parsed.password) {
			throw new StatusError('URL credentials not allowed', 400, 'Bad Request');
		}

		// IP literal hostnames bypass DNS lookup, so check them here directly.
		// IPv6 brackets are stripped (e.g. "[::1]" → "::1").
		const hostname = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
			? parsed.hostname.slice(1, -1)
			: parsed.hostname;
		if (ipaddr.isValid(hostname) && this.isPrivateIp(hostname)) {
			this.logger.warn(`SSRF blocked: direct request to private IP ${hostname}`);
			throw new StatusError('SSRF blocked: request to the specified host is not allowed', 400, 'Bad Request');
		}

		return parsed as unknown as URL;
	}

	/**
	 * Get agent by URL
	 * @param url URL
	 * @param bypassProxy Allways bypass proxy
	 */
	@bindThis
	public getAgentByUrl(url: URL, bypassProxy = false): http.Agent | https.Agent {
		if (bypassProxy || (this.config.proxyBypassHosts ?? []).includes(url.hostname)) {
			return url.protocol === 'http:' ? this.http : this.https;
		} else {
			return url.protocol === 'http:' ? this.httpAgent : this.httpsAgent;
		}
	}

	@bindThis
	public async getActivityJson(url: string): Promise<IObject> {
		const res = await this.send(url, {
			method: 'GET',
			headers: {
				Accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
			},
			timeout: 5000,
			size: 1024 * 256,
		}, {
			throwErrorWhenResponseNotOk: true,
			validators: [validateContentTypeSetAsActivityPub],
		});

		return await res.json() as IObject;
	}

	@bindThis
	public async getJson<T = unknown>(url: string, accept = 'application/json, */*', headers?: Record<string, string>): Promise<T> {
		const res = await this.send(url, {
			method: 'GET',
			headers: Object.assign({
				Accept: accept,
			}, headers ?? {}),
			timeout: 5000,
			size: 1024 * 256,
		});

		return await res.json() as T;
	}

	@bindThis
	public async getHtml(url: string, accept = 'text/html, */*', headers?: Record<string, string>): Promise<string> {
		const res = await this.send(url, {
			method: 'GET',
			headers: Object.assign({
				Accept: accept,
			}, headers ?? {}),
			timeout: 5000,
		});

		return await res.text();
	}

	@bindThis
	public async send(
		url: string,
		args: {
			method?: string,
			body?: string,
			headers?: Record<string, string>,
			timeout?: number,
			size?: number,
		} = {},
		extra: HttpRequestSendOptions = {
			throwErrorWhenResponseNotOk: true,
			validators: [],
		},
	): Promise<Response> {
		// Validate URL before making any request (protocol, credentials)
		this.validateUrl(url);

		const timeout = args.timeout ?? 5000;

		const controller = new AbortController();
		setTimeout(() => {
			controller.abort();
		}, timeout);

		const initialOrigin = new globalThis.URL(url).origin;

		// Manual redirect following: validate each redirect destination
		let currentUrl = url;
		let redirectCount = 0;
		let currentMethod = args.method ?? 'GET';
		let currentBody = args.body;
		let currentHeaders = args.headers;

		// eslint-disable-next-line no-constant-condition
		while (true) {
			const res = await fetch(currentUrl, {
				method: currentMethod,
				headers: {
					'User-Agent': this.config.userAgent,
					...(currentHeaders ?? {}),
				},
				body: currentBody,
				size: args.size ?? 10 * 1024 * 1024,
				agent: (url) => this.getAgentByUrl(url),
				signal: controller.signal,
				redirect: 'manual',
			});

			// Handle redirects manually to validate each destination
			if ([301, 302, 303, 307, 308].includes(res.status)) {
				// Drain response body to free the socket for keep-alive reuse
				await res.text().catch(() => {});

				if (++redirectCount > MAX_REDIRECTS) {
					throw new StatusError('Too many redirects', 502, 'Bad Gateway');
				}

				const location = res.headers.get('location');
				if (!location) {
					throw new StatusError('Redirect with no Location header', 502, 'Bad Gateway');
				}

				// Resolve relative redirects against current URL
				const redirectParsed = new globalThis.URL(location, currentUrl);
				const redirectUrl = redirectParsed.toString();

				// Validate the redirect destination (protocol, credentials, IP)
				// DNS/IP check happens automatically via the safe lookup in the agent
				this.validateUrl(redirectUrl);

				// 303 always becomes GET; 301/302 become GET for non-GET/HEAD; 307/308 preserve method
				if (res.status === 303 || (res.status !== 307 && res.status !== 308 && currentMethod !== 'HEAD')) {
					currentMethod = 'GET';
					currentBody = undefined;
				}

				// Strip sensitive headers when redirecting to a different origin
				if (redirectParsed.origin !== initialOrigin) {
					currentHeaders = undefined;
					currentBody = undefined;
				}

				currentUrl = redirectUrl;
				continue;
			}

			if (!res.ok && extra.throwErrorWhenResponseNotOk) {
				throw new StatusError(`${res.status} ${res.statusText}`, res.status, res.statusText);
			}

			if (res.ok) {
				for (const validator of (extra.validators ?? [])) {
					validator(res);
				}
			}

			return res;
		}
	}
}
