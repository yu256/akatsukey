<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkSelect v-model="sortModeSelect">
		<template #label>{{ i18n.ts.sort }}</template>
		<option v-for="x in sortOptions" :key="x.value" :value="x.value">{{ x.displayName }}</option>
	</MkSelect>
	<div v-if="fetching">
		<MkLoading/>
	</div>
	<div v-else-if="error">
		<MkError @retry="reload"/>
	</div>
	<div v-else class="_gaps">
		<div
			v-for="file in files" :key="file.id"
			class="_button"
			@click="$event => onClick($event, file)"
			@contextmenu.stop="$event => onContextMenu($event, file)"
		>
			<div :class="$style.file">
				<div v-if="file.isSensitive" class="sensitive-label">{{ i18n.ts.sensitive }}</div>
				<MkDriveFileThumbnail :class="$style.fileThumbnail" :file="file" fit="contain"/>
				<div :class="$style.fileBody">
					<div style="margin-bottom: 4px;">
						{{ file.name }}
					</div>
					<div>
						<span style="margin-right: 1em;">{{ file.type }}</span>
						<span>{{ bytes(file.size) }}</span>
					</div>
					<div>
						<span>{{ i18n.ts.registeredDate }}: <MkTime :time="file.createdAt" mode="detail"/></span>
					</div>
					<div v-if="sortModeSelect === 'sizeDesc'">
						<div :class="$style.meter"><div :class="$style.meterValue" :style="genUsageBar(file.size)"></div></div>
					</div>
				</div>
			</div>
		</div>
		<div v-if="files.length === 0" class="_fullinfo">
			<div>{{ i18n.ts.nothing }}</div>
		</div>
		<div v-if="more" class="_margin">
			<MkButton v-if="!moreFetching" primary rounded @click="fetchMore">
				{{ i18n.ts.loadMore }}
			</MkButton>
			<MkLoading v-else/>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import * as Misskey from 'misskey-js';
import { ref, watch } from 'vue';
import tinycolor from 'tinycolor2';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import { i18n } from '@/i18n.js';
import bytes from '@/filters/bytes.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import MkSelect from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import { getDriveFileMenu } from '@/scripts/get-drive-file-menu.js';

const PAGE_LIMIT = 10;

const sortMode = ref<'+size' | '-createdAt'>('+size');
const files = ref<Misskey.entities.DriveFile[]>([]);
const more = ref(false);
const moreFetching = ref(false);
const error = ref(false);

const sortOptions = [
	{ value: 'sizeDesc', displayName: i18n.ts._drivecleaner.orderBySizeDesc },
	{ value: 'createdAtAsc', displayName: i18n.ts._drivecleaner.orderByCreatedAtAsc },
];

const capacity = ref<number>(0);
const usage = ref<number>(0);
const fetching = ref(true);
const sortModeSelect = ref('sizeDesc');

void reload();

watch(sortModeSelect, () => {
	switch (sortModeSelect.value) {
		case 'sizeDesc':
			sortMode.value = '+size';
			break;

		case 'createdAtAsc':
			sortMode.value = '-createdAt';
			break;
	}

	void reload();
});

async function reload(): Promise<void> {
	fetching.value = true;
	error.value = false;

	try {
		await Promise.all([
			fetchDriveInfo(),
			fetchFiles(true),
		]);
	} catch {
		error.value = true;
	} finally {
		fetching.value = false;
	}
}

async function fetchDriveInfo(): Promise<void> {
	const info = await misskeyApi('drive');
	capacity.value = info.capacity;
	usage.value = info.usage;
}

async function fetchFiles(reset: boolean): Promise<void> {
	const cursor = reset ? null : files.value.at(-1);
	const params: {
		sort: '+size' | '-createdAt';
		limit: number;
		cursorId?: string;
		cursorSize?: number;
	} = {
		sort: sortMode.value,
		limit: PAGE_LIMIT,
	};

	if (cursor) {
		params.cursorId = cursor.id;

		if (sortMode.value === '+size') {
			params.cursorSize = cursor.size;
		}
	}

	const res = await misskeyApi<Misskey.entities.DriveFile[]>('drive/cleaner/files' as any, params as any);

	files.value = reset ? res : [...files.value, ...res];
	more.value = res.length >= PAGE_LIMIT;
}

async function fetchMore(): Promise<void> {
	if (!more.value || moreFetching.value || fetching.value) return;

	moreFetching.value = true;
	try {
		await fetchFiles(false);
	} finally {
		moreFetching.value = false;
	}
}

function genUsageBar(fsize: number): object {
	const ratio = usage.value > 0 ? Math.min(1, fsize / usage.value) : 0;

	return {
		width: `${ratio * 100}%`,
		background: tinycolor({ h: 180 - (ratio * 180), s: 0.7, l: 0.5 }),
	};
}

function onClick(ev: MouseEvent, file: Misskey.entities.DriveFile): void {
	os.popupMenu(getDriveFileMenu(file), (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined);
}

function onContextMenu(ev: MouseEvent, file: Misskey.entities.DriveFile): void {
	os.contextMenu(getDriveFileMenu(file), ev);
}

definePageMetadata(() => ({
	title: i18n.ts.drivecleaner,
	icon: 'ti ti-trash',
}));
</script>

<style lang="scss" module>
.file {
	display: flex;
	width: 100%;
	box-sizing: border-box;
	text-align: left;
	align-items: center;

	&:hover {
		color: var(--accent);
	}
}

.fileThumbnail {
	width: 100px;
	height: 100px;
}

.fileBody {
	margin-left: 0.3em;
	padding: 8px;
	flex: 1;
}

.meter {
	margin-top: 8px;
	height: 12px;
	background: rgba(0, 0, 0, 0.1);
	overflow: clip;
	border-radius: 999px;
}

.meterValue {
	height: 100%;
}
</style>
