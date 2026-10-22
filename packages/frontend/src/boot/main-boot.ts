/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createApp, defineAsyncComponent, markRaw } from 'vue';
import { common } from './common.js';
import { ui } from '@/config.js';
import { i18n } from '@/i18n.js';
import { alert, confirm, popup, post, toast } from '@/os.js';
import { useStream } from '@/stream.js';
import * as sound from '@/scripts/sound.js';
import { $i, signout, updateAccount } from '@/account.js';
import { fetchInstance, instance } from '@/instance.js';
import { defaultStore } from '@/store.js';
import { makeHotkey } from '@/scripts/hotkey.js';
import { reactionPicker } from '@/scripts/reaction-picker.js';
import { miLocalStorage } from '@/local-storage.js';
import { initializeSw } from '@/scripts/initialize-sw.js';
import { deckStore } from '@/ui/deck/deck-store.js';
import { emojiPicker } from '@/scripts/emoji-picker.js';
import { mainRouter } from '@/router/main.js';

export async function mainBoot() {
	const { isClientUpdated } = await common(() => createApp(
		new URLSearchParams(window.location.search).has('zen') || (ui === 'deck' && deckStore.state.useSimpleUiForNonRootPages && location.pathname !== '/') ? defineAsyncComponent(() => import('@/ui/zen.vue')) :
		!$i ? defineAsyncComponent(() => import('@/ui/visitor.vue')) :
		ui === 'deck' ? defineAsyncComponent(() => import('@/ui/deck.vue')) :
		ui === 'classic' ? defineAsyncComponent(() => import('@/ui/classic.vue')) :
		defineAsyncComponent(() => import('@/ui/universal.vue')),
	));

	reactionPicker.init();
	emojiPicker.init();

	if (isClientUpdated && $i) {
		popup(defineAsyncComponent(() => import('@/components/MkUpdated.vue')), {}, {}, 'closed');
	}

	const stream = useStream();

	let reloadDialogShowing = false;
	stream.on('_disconnected_', async () => {
		if (defaultStore.state.serverDisconnectedBehavior === 'reload') {
			location.reload();
		} else if (defaultStore.state.serverDisconnectedBehavior === 'dialog') {
			if (reloadDialogShowing) return;
			reloadDialogShowing = true;
			const { canceled } = await confirm({
				type: 'warning',
				title: i18n.ts.disconnectedFromServer,
				text: i18n.ts.reloadConfirm,
			});
			reloadDialogShowing = false;
			if (!canceled) {
				location.reload();
			}
		}
	});

	const hotkeys = {
		'd': (): void => {
			defaultStore.set('darkMode', !defaultStore.state.darkMode);
		},
		's': (): void => {
			mainRouter.push('/search');
		},
	};

	if (defaultStore.state.enableSeasonalScreenEffect) {
		const month = new Date().getMonth() + 1;
		if (defaultStore.state.hemisphere === 'S') {
			// ▼南半球
			if (month === 7 || month === 8) {
				const SnowfallEffect = (await import('@/scripts/snowfall-effect.js')).SnowfallEffect;
				new SnowfallEffect({}).render();
			}
		} else {
			// ▼北半球
			if (month === 12 || month === 1) {
				const SnowfallEffect = (await import('@/scripts/snowfall-effect.js')).SnowfallEffect;
				new SnowfallEffect({}).render();
			} else if (month === 3 || month === 4) {
				const SakuraEffect = (await import('@/scripts/snowfall-effect.js')).SnowfallEffect;
				new SakuraEffect({
					sakura: true,
				}).render();
			}
		}
	}

	if ($i) {
		// only add post shortcuts if logged in
		hotkeys['p|n'] = post;

		defaultStore.loaded.then(() => {
			if (defaultStore.state.accountSetupWizard !== -1) {
				popup(defineAsyncComponent(() => import('@/components/MkUserSetupDialog.vue')), {}, {}, 'closed');
			}
		});

		for (const announcement of ($i.unreadAnnouncements ?? []).filter(x => x.display === 'dialog')) {
			popup(defineAsyncComponent(() => import('@/components/MkAnnouncementDialog.vue')), {
				announcement,
			}, {}, 'closed');
		}

		stream.on('announcementCreated', (ev) => {
			const announcement = ev.announcement;
			if (announcement.display === 'dialog') {
				popup(defineAsyncComponent(() => import('@/components/MkAnnouncementDialog.vue')), {
					announcement,
				}, {}, 'closed');
			}
		});

		if ($i.isDeleted) {
			alert({
				type: 'warning',
				text: i18n.ts.accountDeletionInProgress,
			});
		}

		const lastUsed = miLocalStorage.getItem('lastUsed');
		if (lastUsed) {
			const lastUsedDate = parseInt(lastUsed, 10);
			// 二時間以上前なら
			if (Date.now() - lastUsedDate > 1000 * 60 * 60 * 2) {
				toast(i18n.tsx.welcomeBackWithName({
					name: $i.name || $i.username,
				}));
			}
		}
		miLocalStorage.setItem('lastUsed', Date.now().toString());

		const latestDonationInfoShownAt = miLocalStorage.getItem('latestDonationInfoShownAt');
		const neverShowDonationInfo = miLocalStorage.getItem('neverShowDonationInfo');
		if (neverShowDonationInfo !== 'true' && (new Date($i.createdAt).getTime() < (Date.now() - (1000 * 60 * 60 * 24 * 3))) && !location.pathname.startsWith('/miauth')) {
			if (latestDonationInfoShownAt == null || (new Date(latestDonationInfoShownAt).getTime() < (Date.now() - (1000 * 60 * 60 * 24 * 30)))) {
				popup(defineAsyncComponent(() => import('@/components/MkDonation.vue')), {}, {}, 'closed');
			}
		}

		fetchInstance().then(() => {
			const modifiedVersionMustProminentlyOfferInAgplV3Section13Read = miLocalStorage.getItem('modifiedVersionMustProminentlyOfferInAgplV3Section13Read');
			if (modifiedVersionMustProminentlyOfferInAgplV3Section13Read !== 'true' && instance.repositoryUrl !== 'https://github.com/misskey-dev/misskey') {
				popup(defineAsyncComponent(() => import('@/components/MkSourceCodeAvailablePopup.vue')), {}, {}, 'closed');
			}
		});

		if ('Notification' in window) {
			// 許可を得ていなかったらリクエスト
			if (Notification.permission === 'default') {
				Notification.requestPermission();
			}
		}

		const main = markRaw(stream.useChannel('main', null, 'System'));

		// 自分の情報が更新されたとき
		main.on('meUpdated', i => {
			updateAccount(i);
		});

		main.on('readAllNotifications', () => {
			updateAccount({
				hasUnreadNotification: false,
				unreadNotificationsCount: 0,
			});
		});

		main.on('unreadNotification', () => {
			const unreadNotificationsCount = ($i?.unreadNotificationsCount ?? 0) + 1;
			updateAccount({
				hasUnreadNotification: true,
				unreadNotificationsCount,
			});
		});

		main.on('unreadMention', () => {
			updateAccount({ hasUnreadMentions: true });
		});

		main.on('readAllUnreadMentions', () => {
			updateAccount({ hasUnreadMentions: false });
		});

		main.on('unreadSpecifiedNote', () => {
			updateAccount({ hasUnreadSpecifiedNotes: true });
		});

		main.on('readAllUnreadSpecifiedNotes', () => {
			updateAccount({ hasUnreadSpecifiedNotes: false });
		});

		main.on('readAllAntennas', () => {
			updateAccount({ hasUnreadAntenna: false });
		});

		main.on('unreadAntenna', () => {
			updateAccount({ hasUnreadAntenna: true });
			sound.playMisskeySfx('antenna');
		});

		main.on('readAllAnnouncements', () => {
			updateAccount({ hasUnreadAnnouncement: false });
		});

		// トークンが再生成されたとき
		// このままではMisskeyが利用できないので強制的にサインアウトさせる
		main.on('myTokenRegenerated', () => {
			signout();
		});
	}

	// shortcut
	document.addEventListener('keydown', makeHotkey(hotkeys));

	initializeSw();
}
