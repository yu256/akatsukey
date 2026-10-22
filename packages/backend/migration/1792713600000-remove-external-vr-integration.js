/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RemoveExternalVrIntegration1792713600000 {
	name = 'RemoveExternalVrIntegration1792713600000'

	async up(queryRunner) {
		await queryRunner.query(`DELETE FROM "registry_item"
			WHERE "domain" IS NULL AND "scope" = ARRAY['client', 'base']::varchar[]
			AND "key" IN ('VRChatAuth', 'VRChatURL', 'VRChatId', 'VRChatStatusSets', 'VRChatPrioritizeUserIcon')`);
		await queryRunner.query(`UPDATE "registry_item"
			SET "value" = (
				SELECT COALESCE(jsonb_agg(widget ORDER BY position), '[]'::jsonb)
				FROM jsonb_array_elements("value") WITH ORDINALITY AS items(widget, position)
				WHERE widget->>'name' IS DISTINCT FROM 'vrcUserList'
				AND widget->>'name' IS DISTINCT FROM 'vrcProfile'
			)
			WHERE "domain" IS NULL AND "scope" = ARRAY['client', 'base']::varchar[]
			AND "key" = 'widgets' AND jsonb_typeof("value") = 'array'
			AND ("value" @> '[{"name":"vrcUserList"}]' OR "value" @> '[{"name":"vrcProfile"}]')`);
	}

	async down() {
		// Removed integration settings and credentials cannot be restored.
	}
}
