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
		<MkPullToRefresh ref="prComponent" :refresher="() => reloadTimeline()">
			<MkNotes
				v-if="paginationQuery"
				ref="tlComponent"
				:pagination="paginationQuery"
				:noGap="!defaultStore.state.showGapBetweenNotesInTimeline"
				@queue="emit('queue', $event)"
				@status="prComponent?.setDisabled($event)"
			/>
		</MkPullToRefresh>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, shallowRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkNotes from '@/components/MkNotes.vue';
import MkPullToRefresh from '@/components/MkPullToRefresh.vue';
import { defaultStore } from '@/store.js';
import { i18n } from '@/i18n.js';
import { Paging } from '@/components/MkPagination.vue';

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
const prComponent = shallowRef<InstanceType<typeof MkPullToRefresh>>();
const tlComponent = shallowRef<InstanceType<typeof MkNotes>>();

type TimelineQueryType = {
  withRenotes?: boolean,
  withReplies?: boolean,
  withFiles?: boolean,
  listId?: string,
  sinceDate?: number,
}

const paginationQuery = computed<Paging | null>(() => {
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
			limit: 10,
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
	} catch (error) {
		console.error('Failed to load timeline from specified time:', error);
	}
}

function formatDateTime(dateTimeStr: string): string {
	if (!dateTimeStr) return '';
	return new Date(dateTimeStr).toLocaleString();
}

function reloadTimeline() {
	return new Promise<void>((res) => {
		if (tlComponent.value == null) return;
		tlComponent.value.pagingComponent?.reload().then(() => {
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
}
</style>