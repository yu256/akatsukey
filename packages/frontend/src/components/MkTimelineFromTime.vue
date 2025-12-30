<template>
<div class="timeline-from-time">
	<div class="controls">
		<MkInput v-model="targetDateTime" type="datetime-local" :label="i18n.ts.targetDateTime">
			<template #caption>{{ i18n.ts.targetDateTimeCaption }}</template>
		</MkInput>
		<MkButton primary @click="loadFromTime">{{ i18n.ts.loadFromTime }}</MkButton>
	</div>
	
	<div v-if="sinceDate" class="timeline-container">
		<div class="timeline-info">
			<i class="ti ti-clock"></i>
			{{ i18n.ts.showingNotesFrom }}: {{ formatDateTime(targetDateTime) }}
		</div>
		<MkPullToRefresh :refresher="() => reloadTimeline()">
			<div v-if="notes.length > 0" class="notes-container">
				<MkNote
					v-for="note in notes"
					:key="note.id"
					:note="note"
					class="note"
				/>
				<div v-if="hasMore" class="load-more">
					<MkButton v-if="!loading" @click="loadMore">{{ i18n.ts.loadMore }}</MkButton>
					<MkLoading v-else/>
				</div>
			</div>
			<div v-else-if="!loading" class="empty">
				<div class="_fullinfo">
					<img :src="infoImageUrl" class="_ghost"/>
					<div>{{ i18n.ts.nothing }}</div>
				</div>
			</div>
			<MkLoading v-if="loading"/>
		</MkPullToRefresh>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkNote from '@/components/MkNote.vue';
import MkPullToRefresh from '@/components/MkPullToRefresh.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { i18n } from '@/i18n.js';
import { infoImageUrl } from '@/instance.js';

const props = withDefaults(defineProps<{
	src: 'home' | 'local' | 'social' | 'global' | 'list';
	list?: string;
	withRenotes?: boolean;
	withReplies?: boolean;
	onlyFiles?: boolean;
}>(), {
	withRenotes: true,
	withReplies: false,
	onlyFiles: false,
});

const emit = defineEmits<{
	(ev: 'queue', count: number): void;
}>();

const targetDateTime = ref('');
const sinceDate = ref<number | null>(null);
const notes = ref<Misskey.entities.Note[]>([]);
const loading = ref(false);
const hasMore = ref(false);
const isInitialLoad = ref(true);

type TimelineQueryType = {
  withRenotes?: boolean,
  withReplies?: boolean,
  withFiles?: boolean,
  listId?: string,
  sinceDate?: number,
  untilId?: string,
}

const paginationQuery = computed<{endpoint: keyof Misskey.Endpoints, params: TimelineQueryType} | null>(() => {
	if (!sinceDate.value) return null;

	let endpoint: keyof Misskey.Endpoints | null;
	let query: TimelineQueryType | null;

	if (props.src === 'home') {
		endpoint = 'notes/timeline';
		query = {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			sinceDate: sinceDate.value,
		};
	} else if (props.src === 'local') {
		endpoint = 'notes/local-timeline';
		query = {
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			withFiles: props.onlyFiles ? true : undefined,
			sinceDate: sinceDate.value,
		};
	} else if (props.src === 'social') {
		endpoint = 'notes/hybrid-timeline';
		query = {
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			withFiles: props.onlyFiles ? true : undefined,
			sinceDate: sinceDate.value,
		};
	} else if (props.src === 'global') {
		endpoint = 'notes/global-timeline';
		query = {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			sinceDate: sinceDate.value,
		};
	} else if (props.src === 'list') {
		endpoint = 'notes/user-list-timeline';
		query = {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			listId: props.list,
			sinceDate: sinceDate.value,
		};
	} else {
		endpoint = null;
		query = null;
	}

	if (endpoint && query) {
		return {
			endpoint: endpoint,
			params: query,
		};
	} else {
		return null;
	}
});

async function loadFromTime() {
	if (!targetDateTime.value) return;

	try {
		const targetDate = new Date(targetDateTime.value);
		sinceDate.value = targetDate.getTime();
		notes.value = [];
		isInitialLoad.value = true;
		await loadNotes();
	} catch (error) {
		console.error('Failed to load timeline from specified time:', error);
	}
}

async function loadNotes() {
	if (!paginationQuery.value || loading.value) return;

	loading.value = true;
	try {
		const params = {
			...paginationQuery.value.params,
			limit: 10,
		};

		const response = await misskeyApi(paginationQuery.value.endpoint, params) satisfies Misskey.entities.Note[];

		if (isInitialLoad.value) {
			// 初回読み込み時は古い順にソート
			const sortedNotes = [...response].sort((a, b) => a.id.localeCompare(b.id));
			notes.value = sortedNotes;
			isInitialLoad.value = false;
		} else {
			// 追加読み込み時は通常通り
			notes.value.push(...response);
		}

		hasMore.value = response.length >= 10;
		emit('queue', 0);
	} catch (error) {
		console.error('Failed to load notes:', error);
	} finally {
		loading.value = false;
	}
}

async function loadMore() {
	if (!paginationQuery.value || loading.value || !hasMore.value) return;

	const lastNote = notes.value[notes.value.length - 1];
	if (!lastNote) return;

	loading.value = true;
	try {
		const params = {
			...paginationQuery.value.params,
			limit: 10,
			untilId: lastNote.id,
		};

		const response = await misskeyApi(paginationQuery.value.endpoint, params) satisfies Misskey.entities.Note[];
		notes.value.push(...response);
		hasMore.value = response.length >= 10;
	} catch (error) {
		console.error('Failed to load more notes:', error);
	} finally {
		loading.value = false;
	}
}

function formatDateTime(dateTimeStr: string): string {
	if (!dateTimeStr) return '';
	return new Date(dateTimeStr).toLocaleString();
}

function reloadTimeline() {
	return new Promise<void>((res) => {
		notes.value = [];
		isInitialLoad.value = true;
		loadNotes().then(() => {
			res();
		});
	});
}

defineExpose({
	reloadTimeline,
});
</script>

<style lang="scss" scoped>
.timeline-from-time {
	.controls {
		display: flex;
		gap: 12px;
		align-items: end;
		margin-bottom: 16px;
		padding: 16px;
		background: var(--panel);
		border-radius: var(--radius);
	}

	.timeline-info {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		background: var(--infoBg);
		color: var(--infoFg);
		border-radius: var(--radius);
		margin-bottom: 16px;
		font-size: 0.9em;

		i {
			opacity: 0.7;
		}
	}

	.timeline-container {
		margin-top: 16px;
	}

	.notes-container {
		.note {
			border-bottom: 1px solid var(--divider);
			
			&:last-child {
				border-bottom: none;
			}
		}
	}

	.load-more {
		text-align: center;
		padding: 16px;
	}

	.empty {
		text-align: center;
		padding: 32px;
	}
}
</style>