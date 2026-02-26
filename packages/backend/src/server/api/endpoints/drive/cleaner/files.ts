/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { DriveFilesRepository } from '@/models/_.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	kind: 'read:drive',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'DriveFile',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		cursorId: { type: 'string', format: 'misskey:id' },
		cursorSize: { type: 'integer', minimum: 0 },
		type: { type: 'string', nullable: true, pattern: /^[a-zA-Z\/\-*]+$/.toString().slice(1, -1) },
		sort: { type: 'string', enum: ['+size', '-createdAt'], default: '+size' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.driveFilesRepository.createQueryBuilder('file')
				.andWhere('file.userId = :userId', { userId: me.id });

			if (ps.type) {
				if (ps.type.endsWith('/*')) {
					query.andWhere('file.type like :type', { type: ps.type.replace('/*', '/') + '%' });
				} else {
					query.andWhere('file.type = :type', { type: ps.type });
				}
			}

			switch (ps.sort) {
				case '-createdAt': {
					if (ps.cursorId) {
						query.andWhere('file.id > :cursorId', { cursorId: ps.cursorId });
					}

					query.orderBy('file.id', 'ASC');
					break;
				}

				case '+size':
				default: {
					if (ps.cursorId && ps.cursorSize != null) {
						query.andWhere(new Brackets(qb => {
							qb.where('file.size < :cursorSize', { cursorSize: ps.cursorSize })
								.orWhere(new Brackets(qb2 => {
									qb2.where('file.size = :cursorSize', { cursorSize: ps.cursorSize })
										.andWhere('file.id < :cursorId', { cursorId: ps.cursorId });
								}));
						}));
					}

					query
						.orderBy('file.size', 'DESC')
						.addOrderBy('file.id', 'DESC');
					break;
				}
			}

			const files = await query.limit(ps.limit).getMany();

			return await this.driveFileEntityService.packMany(files, { detail: false, self: true });
		});
	}
}
