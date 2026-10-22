/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Escape a value as a PostgreSQL string literal.
 *
 * This assumes standard_conforming_strings, PostgreSQL's default since 9.1.
 */
export function sqlStringEscape(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}
