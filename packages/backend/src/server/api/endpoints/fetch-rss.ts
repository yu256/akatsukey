/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Parser from 'rss-parser';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';

export const meta = {
	tags: ['meta'],

	requireCredential: true,
	allowGet: true,
	cacheSec: 60 * 3,

	limit: {
		duration: 60 * 1000,
		max: 10,
	},

	res: {
		type: 'object',
		properties: {
			items: {
				type: 'array',
				items: {
					type: 'object',
				},
			}
		}
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		url: { type: 'string' },
	},
	required: ['url'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private httpRequestService: HttpRequestService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const res = await this.httpRequestService.send(ps.url, {
				method: 'GET',
				headers: {
					Accept: 'application/rss+xml, */*',
				},
				timeout: 5000,
				size: 1024 * 1024,
			});

			const text = await res.text();
			const rssParser = new Parser({
				xml2js: {
					async: true,
				},
			});
			const feed = await rssParser.parseString(text);

			feed.items = feed.items.filter(item => {
				if (!item.link) return false;
				try {
					const url = new URL(item.link);
					return url.protocol === 'http:' || url.protocol === 'https:';
				} catch {
					return false;
				}
			});

			return feed;
		});
	}
}
