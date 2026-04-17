import type { WhereExpressionBuilder } from 'typeorm';
import type { MiNote } from '@/models/Note.js';

export function isPureRenote(note: MiNote): note is MiNote & { renoteId: NonNullable<MiNote['renoteId']> } {
	if (!note.renoteId) return false;

	if (note.text) return false; // it's quoted with text
	if (note.fileIds.length !== 0) return false; // it's quoted with files
	if (note.hasPoll) return false; // it's quoted with poll
	return true;
}

// isPureRenote と同じ意味論で pure renote を除外する条件を Brackets の中で構築する
export function excludePureRenotes(qb: WhereExpressionBuilder): void {
	qb.orWhere('note.renoteId IS NULL');
	qb.orWhere('note.text IS NOT NULL');
	qb.orWhere('note.fileIds != \'{}\'');
	qb.orWhere('note.hasPoll');
}
