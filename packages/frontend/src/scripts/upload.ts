/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { reactive, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { compressTypes, shouldBeCompressed, compressImage } from './upload/compress.js';
import { defaultStore } from '@/store.js';
import { apiUrl } from '@/config.js';
import { $i } from '@/account.js';
import { alert } from '@/os.js';
import { i18n } from '@/i18n.js';

type Uploading = {
	id: string;
	name: string;
	progressMax: number | undefined;
	progressValue: number | undefined;
	img: string;
};
export const uploads = ref<Uploading[]>([]);

export function uploadFile(
	file: File,
	folder?: any,
	name?: string,
	keepOriginal: boolean = defaultStore.state.keepOriginalUploading,
): Promise<Misskey.entities.DriveFile> {
	if ($i == null) throw new Error('Not logged in');

	if (folder && typeof folder === 'object') folder = folder.id;

	return new Promise((resolve, reject) => {
		const id = Math.random().toString();

		const reader = new FileReader();
		reader.onload = async (): Promise<void> => {
			const ctx = reactive<Uploading>({
				id: id,
				name: name ?? file.name ?? 'untitled',
				progressMax: undefined,
				progressValue: undefined,
				img: window.URL.createObjectURL(file),
			});

			uploads.value.push(ctx);

			let resizedImage: Blob | undefined;
			if (!keepOriginal && await shouldBeCompressed(file)) {
				try {
					const compressed = await compressImage(file, {
						targetSize: defaultStore.state.compressToTargetSize,
						quality: 80,
						minQuality: 60
					});

					if (compressed) {
						resizedImage = compressed;
						if (_DEV_) {
							const saved = ((1 - compressed.size / file.size) * 100).toFixed(2);
							const method = defaultStore.state.compressToTargetSize ? 'target size' : 'fixed quality';
							console.log(`Image compression (${method}): before ${file.size} bytes, after ${compressed.size} bytes, saved ${saved}%`);
						}
						ctx.name = ctx.name.replace(compressTypes[file.type], 'webp');
					}
				} catch (err) {
					console.error('Failed to compress image', err);
				}
			}

			const formData = new FormData();
			formData.append('i', $i.token);
			formData.append('force', 'true');
			formData.append('file', resizedImage ?? file);
			formData.append('name', ctx.name);
			if (folder) formData.append('folderId', folder);

			const xhr = new XMLHttpRequest();
			xhr.open('POST', apiUrl + '/drive/files/create', true);
			xhr.onload = ((ev: ProgressEvent<XMLHttpRequest>) => {
				if (xhr.status !== 200 || ev.target == null || ev.target.response == null) {
					// TODO: 消すのではなくて(ネットワーク的なエラーなら)再送できるようにしたい
					uploads.value = uploads.value.filter(x => x.id !== id);

					if (xhr.status === 413) {
						alert({
							type: 'error',
							title: i18n.ts.failedToUpload,
							text: i18n.ts.cannotUploadBecauseExceedsFileSizeLimit,
						});
					} else if (ev.target?.response) {
						const res = JSON.parse(ev.target.response);
						if (res.error?.id === 'bec5bd69-fba3-43c9-b4fb-2894b66ad5d2') {
							alert({
								type: 'error',
								title: i18n.ts.failedToUpload,
								text: i18n.ts.cannotUploadBecauseInappropriate,
							});
						} else if (res.error?.id === 'd08dbc37-a6a9-463a-8c47-96c32ab5f064') {
							alert({
								type: 'error',
								title: i18n.ts.failedToUpload,
								text: i18n.ts.cannotUploadBecauseNoFreeSpace,
							});
						} else {
							alert({
								type: 'error',
								title: i18n.ts.failedToUpload,
								text: `${res.error?.message}\n${res.error?.code}\n${res.error?.id}`,
							});
						}
					} else {
						alert({
							type: 'error',
							title: 'Failed to upload',
							text: `${JSON.stringify(ev.target?.response)}, ${JSON.stringify(xhr.response)}`,
						});
					}

					reject();
					return;
				}

				const driveFile = JSON.parse(ev.target.response);

				resolve(driveFile);

				uploads.value = uploads.value.filter(x => x.id !== id);
			}) as (ev: ProgressEvent<EventTarget>) => any;

			xhr.upload.onprogress = ev => {
				if (ev.lengthComputable) {
					ctx.progressMax = ev.total;
					ctx.progressValue = ev.loaded;
				}
			};

			xhr.send(formData);
		};
		reader.readAsArrayBuffer(file);
	});
}
