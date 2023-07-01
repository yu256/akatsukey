<template>
<button
	ref="buttonEl"
	v-ripple="canToggle"
	class="_button"
	:class="[$style.root, { [$style.reacted]: note.myReaction == reaction, [$style.canToggle]: (canToggle || alternative), [$style.large]: defaultStore.state.largeNoteReactions }]"
	@click="toggleReaction()"
>
	<MkReactionIcon :class="$style.icon" :reaction="reaction" :emojiUrl="(note as unknown as Note).reactionEmojis[reaction.substring(1, reaction.length - 1)]"/>
	<span :class="$style.count">{{ count }}</span>
</button>
</template>

<script lang="ts" setup>
import { ComputedRef, computed, onMounted, shallowRef, watch } from 'vue';
import * as misskey from 'misskey-js';
import XDetails from '@/components/MkReactionsViewer.details.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import * as os from '@/os';
import { useTooltip } from '@/scripts/use-tooltip';
import { $i } from '@/account';
import MkReactionEffect from '@/components/MkReactionEffect.vue';
import { defaultStore } from '@/store';
import { i18n } from '@/i18n';
import { customEmojis, fetchCustomEmojis } from '@/custom-emojis';

interface Note {
	reactionEmojis: Map<string, string>;
}

const props = defineProps<{
	reaction: string;
	count: number;
	isInitial: boolean;
	note: misskey.entities.Note;
}>();

const buttonEl = shallowRef<HTMLElement>();

const reactionName = computed(() => {
	const r = props.reaction.replace(':', '');
	return r.slice(0, r.indexOf('@'));
});

const alternative: ComputedRef<string | undefined> = computed(() => $i ? customEmojis.value.find(it => it.name === reactionName.value)?.name : undefined);

const canToggle = computed(() => (props.reaction[props.reaction.length - 2] === '.' || !props.reaction.startsWith(':')) && $i);

async function toggleReaction(): Promise<void> {
	if (!canToggle.value) {
		reactAlternative();
		return;
	}

	const oldReaction = props.note.myReaction;
	if (oldReaction) {
		const confirm = await os.confirm({
			type: 'warning',
			text: oldReaction !== props.reaction ? i18n.ts.changeReactionConfirm : i18n.ts.cancelReactionConfirm,
		});
		if (confirm.canceled) return;

		os.api('notes/reactions/delete', {
			noteId: props.note.id,
		}).then(() => {
			if (oldReaction !== props.reaction) {
				os.api('notes/reactions/create', {
					noteId: props.note.id,
					reaction: props.reaction,
				});
			}
		});
	} else {
		os.api('notes/reactions/create', {
			noteId: props.note.id,
			reaction: props.reaction,
		});
	}
}

function anime(): void {
	if (document.hidden) return;
	if (!defaultStore.state.animation) return;
	if (!buttonEl.value) return;

	const rect = buttonEl.value.getBoundingClientRect();
	const x = rect.left + 16;
	const y = rect.top + (buttonEl.value.offsetHeight / 2);
	os.popup(MkReactionEffect, { reaction: props.reaction, x, y }, {}, 'end');
}

function reactAlternative(): void {
	if (!alternative.value) {
		importAndReact();
		return;
	}
	os.api('notes/reactions/create', {
		noteId: props.note.id,
		reaction: `:${alternative.value}:`,
	});
}

async function importAndReact(): Promise<void> {
	if (!($i?.isAdmin || $i?.isModerator)) return;
	const confirm = await os.confirm({
		type: 'info',
		text: 'インポートしてリアクションしますか？',
	});
	if (confirm.canceled) return;
	await importEmoji().then(() =>
		setTimeout(() => {
			fetchCustomEmojis(true);
		}, 2000),
	).then(() => {
		os.api('notes/reactions/create', {
			noteId: props.note.id,
			reaction: `:${reactionName.value}:`,
		});
	});
}

async function importEmoji(): Promise<void> {
	const emojiId = await getEmojiId();
	if (!emojiId) return;
	os.api('admin/emoji/copy', {
		emojiId: emojiId,
	});
}

async function getEmojiId(): Promise<string | null> {
	const host = (): string => {
		const r = props.reaction.replace(':', '');
		return r.slice(r.indexOf('@') + 1, r.length - 1);
	};

	const res = await os.api('admin/emoji/list-remote', {
		host,
		query: reactionName.value,
	});

	if (!res) return null;

	return await res.find((emoji: { name: string; }) => emoji.name === reactionName.value).id;
}

watch(() => props.count, (newCount, oldCount) => {
	if (oldCount < newCount) anime();
});

onMounted(() => {
	if (!props.isInitial) anime();
});

useTooltip(buttonEl, async (showing) => {
	const reactions = await os.apiGet('notes/reactions', {
		noteId: props.note.id,
		type: props.reaction,
		limit: 11,
		_cacheKey_: props.count,
	});

	const users = reactions.map(x => x.user);

	os.popup(XDetails, {
		showing,
		reaction: props.reaction,
		users,
		count: props.count,
		targetElement: buttonEl.value,
	}, {}, 'closed');
}, 100);
</script>

<style lang="scss" module>
.root {
	display: inline-block;
	height: 32px;
	margin: 2px;
	padding: 0 6px;
	border-radius: 4px;

	&.canToggle {
		background: var(--buttonBg);

		&:hover {
			background: rgba(0, 0, 0, 0.1);
		}
	}

	&:not(.canToggle) {
		cursor: default;
	}

	&.large {
		height: 42px;
		font-size: 1.5em;
		border-radius: 6px;

		> .count {
			font-size: 0.7em;
			line-height: 42px;
		}
	}

	&.reacted {
		background: var(--accent);

		&:hover {
			background: var(--accent);
		}

		> .count {
			color: var(--fgOnAccent);
		}
	}
}

.count {
	font-size: 0.9em;
	line-height: 32px;
	margin: 0 0 0 4px;
}
</style>
