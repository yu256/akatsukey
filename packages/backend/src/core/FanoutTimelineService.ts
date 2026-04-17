/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';

export type FanoutTimelineName =
	// home timeline
	| `homeTimeline:${string}`
	| `homeTimelineWithFiles:${string}` // only notes with files are included
	// local timeline
	| `localTimeline` // replies are not included
	| `localTimelineWithFiles` // only non-reply notes with files are included
	| `localTimelineWithReplies` // only replies are included
	| `localTimelineWithReplyTo:${string}` // Only replies to specific local user are included. Parameter is reply user id.

	// antenna
	| `antennaTimeline:${string}`

	// user timeline
	| `userTimeline:${string}` // replies are not included
	| `userTimelineWithFiles:${string}` // only non-reply notes with files are included
	| `userTimelineWithReplies:${string}` // only replies are included
	| `userTimelineWithChannel:${string}` // only channel notes are included, replies are included

	// user list timelines
	| `userListTimeline:${string}`
	| `userListTimelineWithFiles:${string}` // only notes with files are included

	// channel timelines
	| `channelTimeline:${string}` // replies are included

	// role timelines
	| `roleTimeline:${string}` // any notes are included

@Injectable()
export class FanoutTimelineService {
	constructor(
		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		private idService: IdService,
	) {
	}

	@bindThis
	public push(tl: FanoutTimelineName, id: string, maxlen: number, pipeline: Redis.ChainableCommander) {
		// リモートから遅れて届いた(もしくは後から追加された)投稿日時が古い投稿が追加されるとページネーション時に問題を引き起こすため、
		// 3分以内に投稿されたものでない場合、Redisにある最古のIDより新しい場合のみ追加する
		if (this.idService.parse(id).date.getTime() > Date.now() - 1000 * 60 * 3) {
			pipeline.lpush('list:' + tl, id);
			if (Math.random() < 0.1) { // 10%の確率でトリム
				pipeline.ltrim('list:' + tl, 0, maxlen - 1);
			}
		} else {
			// 末尾のIDを取得
			this.redisForTimelines.lindex('list:' + tl, -1).then(lastId => {
				if (lastId == null || (this.idService.parse(id).date.getTime() > this.idService.parse(lastId).date.getTime())) {
					this.redisForTimelines.lpush('list:' + tl, id);
				} else {
					Promise.resolve();
				}
			});
		}
	}

	@bindThis
	public get(name: FanoutTimelineName, untilId?: string | null, sinceId?: string | null) {
		if (untilId && sinceId) {
			return this.redisForTimelines.lrange('list:' + name, 0, -1)
				.then(ids => ids.filter(id => id < untilId && id > sinceId).sort((a, b) => a > b ? -1 : 1));
		} else if (untilId) {
			return this.redisForTimelines.lrange('list:' + name, 0, -1)
				.then(ids => ids.filter(id => id < untilId).sort((a, b) => a > b ? -1 : 1));
		} else if (sinceId) {
			return this.redisForTimelines.lrange('list:' + name, 0, -1)
				.then(ids => ids.filter(id => id > sinceId).sort((a, b) => a < b ? -1 : 1));
		} else {
			return this.redisForTimelines.lrange('list:' + name, 0, -1)
				.then(ids => ids.sort((a, b) => a > b ? -1 : 1));
		}
	}

	@bindThis
	public getMulti(name: FanoutTimelineName[], untilId?: string | null, sinceId?: string | null): Promise<string[][]> {
		const pipeline = this.redisForTimelines.pipeline();
		for (const n of name) {
			pipeline.lrange('list:' + n, 0, -1);
		}
		return pipeline.exec().then(res => {
			if (res == null) return [];
			const tls = res.map(r => r[1] as string[]);
			return tls.map(ids =>
				(untilId && sinceId)
					? ids.filter(id => id < untilId && id > sinceId).sort((a, b) => a > b ? -1 : 1)
					: untilId
						? ids.filter(id => id < untilId).sort((a, b) => a > b ? -1 : 1)
						: sinceId
							? ids.filter(id => id > sinceId).sort((a, b) => a < b ? -1 : 1)
							: ids.sort((a, b) => a > b ? -1 : 1),
			);
		});
	}

	@bindThis
	public purge(name: FanoutTimelineName) {
		return this.redisForTimelines.del('list:' + name);
	}

	// 指定cursorがfanoutキャッシュの保持範囲より古いかを判定する。
	// 複数timelineを与えた場合、いずれかのtimelineがcursorをカバーできない場合にtrueを返す
	// （最も新しい「最古キャッシュID」との比較で判定するため、最短retentionのtimelineに合わせた保守的な判定となる）。
	// 空のtimelineはカバー不能とみなす。paginationが排他的（id < untilId）なため境界は<=で判定する。
	// すべてのtimelineが空で、かつcursorがすべてnullの場合はfalse（キャッシュ無しの新規状態）。
	@bindThis
	public async cursorsPrecedeCache(names: FanoutTimelineName[], ...cursors: (string | null)[]): Promise<boolean> {
		if (names.length === 0) return false;
		const pipeline = this.redisForTimelines.pipeline();
		for (const n of names) {
			pipeline.lindex('list:' + n, -1);
		}
		const res = await pipeline.exec();
		if (res == null) return false;
		let newestOldest: string | null = null;
		for (const [, value] of res) {
			const id = value as string | null;
			if (id == null) {
				// 空のtimelineはキャッシュカバー範囲外とみなし、cursorが指定されていればDB直行させる
				return cursors.some(c => c != null);
			}
			if (newestOldest == null || id > newestOldest) newestOldest = id;
		}
		if (newestOldest == null) return false;
		const threshold = newestOldest;
		return cursors.some(c => c != null && c <= threshold);
	}
}
