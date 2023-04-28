import { defineAsyncComponent } from 'vue';
import { $i } from '@/account';
import { i18n } from '@/i18n';
import * as os from '@/os';
import { copyText } from '@/scripts/tms/clipboard';
import { MenuItem } from '@/types/menu';

export const openReactionImportMenu = async (ev: MouseEvent, reaction: string, noteId: string): Promise<void> => {
	if (!reaction) return;

	const host = reaction.match(/(?<=@).*\.*(?=:)/g)?.[0];
	const name = reaction.match(/(?<=:).*(?=@.*\.*(?=:))/g)?.[0];
	const isLocal = (host === null || host === '.');
	const isCustom = reaction.startsWith(':');

	const getEmojiObject = (emojiId): Promise<Record<string, any> | null> => new Promise<Record<string, any> | null>(async resolve => {
		if (!($i?.isAdmin || $i?.isModerator)) {
			resolve(null);
			return;
		}

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
		if (!($i?.isAdmin || $i?.isModerator)) return null;

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
		if (!await emojiId) return;
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

	const menuItems: MenuItem[] = [{
		type: 'label',
		text: reaction,
	}, {
		type: 'button',
		icon: 'ti ti-copy',
		text: i18n.ts.copy,
		action: (): void => {
			copyText(isCustom ? `:${name}:` : reaction);
		},
	}];

	const emojiId = await getEmojiId() ? await getEmojiId() : reaction;

	if (
		isCustom &&
		emojiId &&
		!isLocal &&
		duplication
	) {
		menuItems.push({
			type: 'button',
			icon: 'ti ti-check',
			text: 'リアクションする',
			action: (): void => {
				os.api('notes/reactions/create', {
					noteId: noteId,
					reaction: `:${name}:`,
				});
			} });
	}	else if (
		isCustom &&
		emojiId &&
		($i?.isAdmin || $i?.isModerator) &&
		!isLocal
	)	{
		menuItems.push({
			type: 'button',
			icon: 'ti ti-check',
			text: 'リアクションする',
			action: async () =>	{	
				await importEmoji(true).then(() => {
					setTimeout(() => {
						os.api('notes/reactions/create', {
							noteId: noteId,
							reaction: `:${name}:`,
						});
					}, 2000); // インポートしてからバックエンドに浸透するのが遅いので2秒待つ
				});},
		}, {
			type: 'button',
			icon: 'ti ti-download',
			text: i18n.ts.import,
			action: () => {
				importEmoji(false);
			},
		});
	}

	os.contextMenu(menuItems, ev);
};
