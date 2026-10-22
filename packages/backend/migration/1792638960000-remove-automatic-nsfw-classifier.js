/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RemoveAutomaticNsfwClassifier1792638960000 {
	name = 'RemoveAutomaticNsfwClassifier1792638960000'

	async up(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_8bdcd3dd2bddb78014999a16ce"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_3b33dff77bb64b23c88151d23e"`);
		await queryRunner.query(`ALTER TABLE "drive_file" DROP COLUMN "maybePorn"`);
		await queryRunner.query(`ALTER TABLE "drive_file" DROP COLUMN "maybeSensitive"`);
		await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "autoSensitive"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableSensitiveMediaDetectionForVideos"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "setSensitiveFlagAutomatically"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "sensitiveMediaDetectionSensitivity"`);
		await queryRunner.query(`DROP TYPE "public"."meta_sensitivemediadetectionsensitivity_enum"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "sensitiveMediaDetection"`);
		await queryRunner.query(`DROP TYPE "public"."meta_sensitivemediadetection_enum"`);
	}

	async down(queryRunner) {
		await queryRunner.query(`CREATE TYPE "public"."meta_sensitivemediadetection_enum" AS ENUM('none', 'all', 'local', 'remote')`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "sensitiveMediaDetection" "public"."meta_sensitivemediadetection_enum" NOT NULL DEFAULT 'none'`);
		await queryRunner.query(`CREATE TYPE "public"."meta_sensitivemediadetectionsensitivity_enum" AS ENUM('medium', 'low', 'high', 'veryLow', 'veryHigh')`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "sensitiveMediaDetectionSensitivity" "public"."meta_sensitivemediadetectionsensitivity_enum" NOT NULL DEFAULT 'medium'`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "setSensitiveFlagAutomatically" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "enableSensitiveMediaDetectionForVideos" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "user_profile" ADD "autoSensitive" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "drive_file" ADD "maybeSensitive" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`COMMENT ON COLUMN "drive_file"."maybeSensitive" IS 'Whether the DriveFile is NSFW. (predict)'`);
		await queryRunner.query(`ALTER TABLE "drive_file" ADD "maybePorn" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`CREATE INDEX "IDX_3b33dff77bb64b23c88151d23e" ON "drive_file" ("maybeSensitive")`);
		await queryRunner.query(`CREATE INDEX "IDX_8bdcd3dd2bddb78014999a16ce" ON "drive_file" ("maybePorn")`);
	}
}
