import { defineAsyncComponent } from 'vue';
import * as os from '@/os';

export async function followReact(reaction: string, noteId: string): Promise<void> {
	if (!reaction) return;

	const host = reaction.match(/(?<=@).*\.*(?=:)/g)?.[0];
	const name = reaction.match(/(?<=:).*(?=@.*\.*(?=:))/g)?.[0];
	const isLocal = (host === null || host === '.');
	const isCustom = reaction.startsWith(':');

	const getEmojiObject = (emojiId): Promise<Record<string, any> | null> => new Promise<Record<string, any> | null>(async resolve => {
		const sinceId = await os.api('admin/emoji/list', {
			limit: 1,
			untilId: emojiId.id,
		});

		if (!sinceId || !sinceId[0] || !sinceId[0].id) {
			resolve(null);
			return;
		}

		const id = await os.api('admin/emoji/list', {
			limit: 1,
			sinceId: sinceId[0].id,
		});

		if (!id || !id[0]) {
			resolve(null);
			return;
		}

		resolve(id[0]);
	});

	const getEmojiId = async (): Promise<string | null> => {
		if (isLocal) return null;
		if (!host || !name) return null;

		const resList: Record<string, any>[] = await os.api('admin/emoji/list-remote', {
			host,
			query: name,
			limit: 100,
		});

		const emojiId = await resList.find(emoji => emoji.name === name && emoji.host === host)?.id;

		return emojiId;
	};

	const importEmoji = async (skip: boolean): Promise<void> => {
		const emojiId = await getEmojiId();
		if (!emojiId) return;
		os.api('admin/emoji/copy', {
			emojiId: emojiId,
		}).then(async emoji => {
			if (skip) return;
			os.popup(defineAsyncComponent(() => import('@/pages/admin/emoji-edit-dialog.vue')), {
				emoji: await getEmojiObject(emoji),
			});
		});
	};

	const duplication: boolean = await os.api('meta').then(meta => {
		const emojis = meta.emojis;
		return emojis.some((emoji) => {
			return (emoji.name === name);
		});
	});

	const emojiId = await getEmojiId() ? await getEmojiId() : reaction;

	const isForbidden = name?.includes('misskeyio');

	const fallbackemoji = (emoji: string): string => {
		switch (emoji) {
			case 'ai_acid_misskeyio':
				return 'hinata_acid';
			case 'ai_panic_misskeyio':
				return 'senko_stop';
			case 'ai_embarrased_misskeyio':
				return 'senko_stop';
			case 'ai_sign_misskeyio':
				return 'blobgo';
		}
		return emoji;
	};

	if (
		isCustom &&
		emojiId &&
		!isLocal &&
		duplication
	) 	{
		os.api('notes/reactions/create', {
			noteId: noteId,
			reaction: `:${name}:`,
		});
	} else if (
		isCustom &&
		emojiId &&
		!isLocal &&
		!isForbidden
	)	{
		await importEmoji(true).then(() => {
			setTimeout(() => {
				os.api('notes/reactions/create', {
					noteId: noteId,
					reaction: `:${name}:`,
				});
			}, 2000);
		});
	} else {
		os.api('notes/reactions/create', {
			noteId: noteId,
			reaction: `:${fallbackemoji(name!)}:`,
		});
	}
}
