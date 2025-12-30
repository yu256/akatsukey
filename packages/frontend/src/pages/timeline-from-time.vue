<template>
<MkStickyContainer>
	<template #header>
		<MkPageHeader v-model:tab="src" :actions="headerActions" :tabs="headerTabs" :displayMyAvatar="true"/>
	</template>
	<MkSpacer :contentMax="800">
		<div ref="rootEl">
			<MkTimelineFromTime
				:key="src"
				:src="src.split(':')[0] as 'home' | 'local' | 'social' | 'global' | 'list'"
				:list="src.split(':')[1]"
				:withRenotes="withRenotes"
				:withReplies="withReplies"
				:onlyFiles="onlyFiles"
				@queue="queueUpdated"
			/>
		</div>
	</MkSpacer>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { computed, provide, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import MkTimelineFromTime from '@/components/MkTimelineFromTime.vue';
import MkSpacer from '@/components/global/MkSpacer.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { $i } from '@/account.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { defaultStore } from '@/store.js';
import * as os from '@/os.js';

provide('shouldOmitHeaderTitle', true);

const isLocalTimelineAvailable = (($i == null && instance.policies.ltlAvailable) || ($i != null && $i.policies.ltlAvailable));
const isGlobalTimelineAvailable = (($i == null && instance.policies.gtlAvailable) || ($i != null && $i.policies.gtlAvailable));

const src = ref<'home' | 'local' | 'social' | 'global' | `list:${string}`>('home');

const withRenotes = ref(true);
const withReplies = ref($i ? defaultStore.state.defaultWithReplies : false);
const onlyFiles = ref(false);

function queueUpdated(_q: number): void {
}

async function chooseList(ev: MouseEvent): Promise<void> {
	const lists = await misskeyApi('users/lists/list');
	const items = lists.map(list => ({
		text: list.name,
		action: () => {
			src.value = `list:${list.id}`;
		},
	}));
	os.popupMenu(items, ev.currentTarget ?? ev.target);
}

const headerActions = computed(() => [
	{
		icon: 'ti ti-list',
		text: i18n.ts.selectList,
		handler: chooseList,
	},
]);

const headerTabs = computed(() => [...(defaultStore.reactiveState.pinnedUserLists.value.map(l => ({
	key: 'list:' + l.id,
	title: l.name,
	icon: 'ti ti-star',
	iconOnly: true,
}))), {
	key: 'home',
	title: i18n.ts._timelines.home,
	icon: 'ti ti-home',
	iconOnly: true,
}, ...(isLocalTimelineAvailable ? [{
	key: 'local',
	title: i18n.ts._timelines.local,
	icon: 'ti ti-planet',
	iconOnly: true,
}] : []), ...(isLocalTimelineAvailable ? [{
	key: 'social',
	title: i18n.ts._timelines.social,
	icon: 'ti ti-universe',
	iconOnly: true,
}] : []), ...(isGlobalTimelineAvailable ? [{
	key: 'global',
	title: i18n.ts._timelines.global,
	icon: 'ti ti-whirl',
	iconOnly: true,
}] : [])]);

definePageMetadata(() => ({
	title: i18n.ts.timeline + ' - ' + i18n.ts.loadFromTime,
	icon: 'ti ti-clock',
}));
</script>