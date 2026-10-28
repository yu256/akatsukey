/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isConcurrentIndexMigrationEnabled } from './js/migration-config.js';

export class CompositeNoteIndex1793155200000 {
	name = 'CompositeNoteIndex1793155200000';
	transaction = isConcurrentIndexMigrationEnabled() ? false : undefined;

	async up(queryRunner) {
		const concurrently = isConcurrentIndexMigrationEnabled();

		if (concurrently) {
			const indexState = await queryRunner.query(
				`SELECT indisvalid
				 FROM pg_index
				 INNER JOIN pg_class ON pg_index.indexrelid = pg_class.oid
				 WHERE pg_class.relname = 'IDX_724b311e6f883751f261ebe378'`,
			);

			if (indexState.length === 0 || indexState[0].indisvalid !== true) {
				await queryRunner.query(`DROP INDEX IF EXISTS "IDX_724b311e6f883751f261ebe378"`);
				await queryRunner.query(`CREATE INDEX CONCURRENTLY "IDX_724b311e6f883751f261ebe378" ON "note" ("userId", "id" DESC)`);
			}
		} else {
			await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_724b311e6f883751f261ebe378" ON "note" ("userId", "id" DESC)`);
		}

		if (concurrently) {
			await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_5b87d9d19127bd5d92026017a7"`);
		} else {
			await queryRunner.query(`DROP INDEX IF EXISTS "IDX_5b87d9d19127bd5d92026017a7"`);
		}
		await queryRunner.query(`ANALYZE "user", "note"`);
	}

	async down(queryRunner) {
		const concurrently = isConcurrentIndexMigrationEnabled();

		if (concurrently) {
			await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_724b311e6f883751f261ebe378"`);
			await queryRunner.query(`CREATE INDEX CONCURRENTLY "IDX_5b87d9d19127bd5d92026017a7" ON "note" ("userId")`);
		} else {
			await queryRunner.query(`DROP INDEX IF EXISTS "IDX_724b311e6f883751f261ebe378"`);
			await queryRunner.query(`CREATE INDEX "IDX_5b87d9d19127bd5d92026017a7" ON "note" ("userId")`);
		}

		await queryRunner.query(`ANALYZE "note"`);
	}
}
