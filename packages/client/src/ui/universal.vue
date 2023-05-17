<template>
<div class="dkgtipfy" :class="{ wallpaper }">
	<XSidebar v-if="!isMobile" class="sidebar"/>

	<MkStickyContainer class="contents">
		<template #header>
			<XStatusBars :class="$style.statusbars"/>
		</template>
		<main style="min-width: 0;" :style="{ background: pageMetadata?.value?.bg }" @contextmenu.stop="onContextmenu">
			<div :class="$style.content">
				<RouterView/>
			</div>
			<div :class="$style.spacer"></div>
		</main>
	</MkStickyContainer>

	<div v-if="isDesktop" ref="widgetsEl" class="widgets">
		<XWidgets @mounted="attachSticky"/>
	</div>

	<button v-if="!isDesktop && !isMobile" class="widgetButton _button" @click="openWidgets()"><i class="ti ti-apps"></i></button>

	<div v-if="isMobile" class="buttons">
		<div class="tabs_area">
			<button class="button nav _button" @click="drawerMenuShowing = true"><i class="ti ti-menu-2"></i><span v-if="menuIndicated" class="indicator navbar"><i class="_indicatorCircle"></i></span></button>
			<button class="button home _button" @click="mainRouter.currentRoute.value.name === 'index' ? top() : mainRouter.push('/')"><i class="ti ti-home"></i></button>
			<button class="button notifications _button" @click="mainRouter.push('/my/notifications')"><i class="ti ti-bell"></i><span v-if="$i?.hasUnreadNotification" class="indicator navbar"><i class="_indicatorCircle"></i></span></button>
			<button v-if="defaultStore.state.navBarChatIcon" class="button messaging _button" @click="mainRouter.push('/my/messaging')"><i class="ti ti-messages"></i><span v-if="$i?.hasUnreadMessagingMessage" class="indicator navbar"><i class="_indicatorCircle"></i></span></button>
			<button v-if="defaultStore.state.navBarWidgetIcon" class="button widget _button" @click="widgetsShowing = true"><i class="ti ti-apps"></i></button>
			<button v-if="defaultStore.state.navBarReloadIcon" class="button reload _button" @click="reloadPage()"><i class="ti ti-refresh"></i><span v-if="hasDisconnected" class="indicator navbar"><i class="_indicatorCircle"></i></span></button>
		</div>
		<div class="post_area">
			<div class="post_button">
				<!-- <button class="button post _button" @click="os.post()"><i class="ti ti-pencil"></i></button> -->
				<button class="button post _button" data-cy-open-post-form @click="os.post">
					<i class="icon ti ti-pencil ti-fw"></i>
				</button>
			</div>
		</div>
	</div>

	<Transition :name="defaultStore.state.animation ? 'menuDrawer-back' : ''">
		<div v-if="drawerMenuShowing" class="menuDrawer-back _modalBg" @click="closeDrawerMenu()" @touchstart.passive="closeDrawerMenu()"></div>
	</transition>

	<Transition :name="defaultStore.state.animation ? 'menuDrawer' : ''">
		<XDrawerMenu v-if="drawerMenuShowing" class="menuDrawer"/>
	</transition>

	<Transition :name="defaultStore.state.animation ? 'widgetsDrawer-back' : ''">
		<div v-if="widgetsShowing" class="widgetsDrawer-back _modalBg" @click="closeWidgets()" @touchstart.passive="closeWidgets()"></div>
	</transition>

	<Transition :name="defaultStore.state.animation ? 'widgetsDrawer' : ''">
		<XWidgets v-if="widgetsShowing" class="widgetsDrawer"/>
	</transition>

	<XCommon/>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, provide, onMounted, computed, ref, ComputedRef } from 'vue';
import XCommon from './_common_/common.vue';
import { instanceName } from '@/config';
import { StickySidebar } from '@/scripts/sticky-sidebar';
import XDrawerMenu from '@/ui/_common_/navbar-for-mobile.vue';
import * as os from '@/os';
import { defaultStore } from '@/store';
import { navbarItemDef } from '@/navbar';
import { i18n } from '@/i18n';
import { $i } from '@/account';
import { mainRouter } from '@/router';
import { PageMetadata, provideMetadataReceiver } from '@/scripts/page-metadata';
import { deviceKind } from '@/scripts/device-kind';
import { disableContextmenu } from '@/scripts/touch';
import { pushHash, trimHash } from '@/scripts/tms/url-hash';

import { stream } from '@/stream';
const XWidgets = defineAsyncComponent(() => import('./universal.widgets.vue'));
const XSidebar = defineAsyncComponent(() => import('@/ui/_common_/navbar.vue'));
const XStatusBars = defineAsyncComponent(() => import('@/ui/_common_/statusbars.vue'));

const DESKTOP_THRESHOLD = 1100;
const MOBILE_THRESHOLD = 500;

// デスクトップでウィンドウを狭くしたときモバイルUIが表示されて欲しいことはあるので deviceKind === 'desktop' の判定は行わない
const isDesktop = ref(window.innerWidth >= DESKTOP_THRESHOLD);
const isMobile = ref(deviceKind === 'smartphone' || window.innerWidth <= MOBILE_THRESHOLD);
window.addEventListener('resize', () => {
	isMobile.value = deviceKind === 'smartphone' || window.innerWidth <= MOBILE_THRESHOLD;
});

let pageMetadata = $ref<null | ComputedRef<PageMetadata>>();
const widgetsEl = $shallowRef<HTMLElement>();
let widgetsShowing = $ref(false);
let drawerMenuShowing = $ref(false);

provide('router', mainRouter);
provideMetadataReceiver((info) => {
	pageMetadata = info;
	if (pageMetadata.value) {
		document.title = `${pageMetadata.value.title} | ${instanceName}`;
	}
});

const menuIndicated = computed(() => {
	for (const def in navbarItemDef) {
		if (def === 'notifications') continue; // 通知は下にボタンとして表示されてるから
		if (navbarItemDef[def].indicated) return true;
	}
	return false;
});

mainRouter.on('change', (ctx) => {
	const prevURL = ctx.beforePath.replace(/[#\?].*$/, '');
	const newURL = ctx.path.replace(/[#\?].*$/, '');

	if (prevURL !== newURL) {
		if (!(ctx.path.endsWith('widgets') || ctx.path.endsWith('menu'))) {
			drawerMenuShowing = false;
		} else {
			closeDrawerMenu();
		}
	}
});

document.documentElement.style.overflowY = 'scroll';

if (defaultStore.state.widgets.length === 0) {
	defaultStore.set('widgets', [{
		name: 'calendar',
		id: 'a', place: 'right', data: {},
	}, {
		name: 'notifications',
		id: 'b', place: 'right', data: {},
	}, {
		name: 'trends',
		id: 'c', place: 'right', data: {},
	}]);
}

onMounted(() => {
	if (!isDesktop.value) {
		window.addEventListener('resize', () => {
			if (window.innerWidth >= DESKTOP_THRESHOLD) isDesktop.value = true;
		}, { passive: true });
	}
});

const openWidgets = (): void => {
	window.addEventListener('popstate', () => {
		if (!window.location.hash.endsWith('widgets')) {
			widgetsShowing = false;
			return;
		}
	});

	widgetsShowing = true;

	history.pushState(null, '', pushHash(window.location.hash, 'widgets'));
};

const closeWidgets = (): void => {
	if (window.location.hash.endsWith('widgets')) {
		trimHash();
	}

	widgetsShowing = false;
};

const closeDrawerMenu = (): void => {
	if (window.location.hash.endsWith('menu')) {
		trimHash();
	}

	drawerMenuShowing = false;
};

const onContextmenu = (ev: MouseEvent): void => {
	if (disableContextmenu) return;
	const isLink = (el: HTMLElement): void | boolean => {
		if (el.tagName === 'A') return true;
		if (el.parentElement) {
			return isLink(el.parentElement);
		}
	};

	if (isLink(ev.target)) return;
	if (['INPUT', 'TEXTAREA', 'IMG', 'VIDEO', 'CANVAS'].includes(ev.target?.tagName) || ev.target?.attributes['contenteditable']) return;
	if (window.getSelection()?.toString() !== '') return;

	const path = mainRouter.getCurrentPath();
	os.contextMenu([{
		type: 'label',
		text: path,
	}, {
		icon: 'ti ti-window-maximize',
		text: i18n.ts.openInWindow,
		action: (): void => {
			os.pageWindow(path);
		},
	}], ev);
};

const attachSticky = (): void => {
	const sticky = new StickySidebar(widgetsEl);
	window.addEventListener('scroll', () => {
		sticky.calc(window.scrollY);
	}, { passive: true });
};

const top = (): void => window.scroll({ top: 0, behavior: 'smooth' });

const wallpaper = localStorage.getItem('wallpaper') != null;

const reloadPage = (): void => window.location.reload();

const hasDisconnected = ref(false);

stream.on('_disconnected_', async () => {
	hasDisconnected.value = true;
});

</script>

<style lang="scss" scoped>
.widgetsDrawer-enter-active,
.widgetsDrawer-leave-active {
	opacity: 1;
	transform: translateX(0);
	transition: transform 300ms cubic-bezier(0.23, 1, 0.32, 1), opacity 300ms cubic-bezier(0.23, 1, 0.32, 1);
}

.widgetsDrawer-enter-from,
.widgetsDrawer-leave-active {
	opacity: 0;
	transform: translateX(240px);
}

.widgetsDrawer-back-enter-active,
.widgetsDrawer-back-leave-active {
	opacity: 1;
	transition: opacity 300ms cubic-bezier(0.23, 1, 0.32, 1);
}

.widgetsDrawer-back-enter-from,
.widgetsDrawer-back-leave-active {
	opacity: 0;
}

.menuDrawer-enter-active,
.menuDrawer-leave-active {
	opacity: 1;
	transform: translateX(0);
	transition: transform 300ms cubic-bezier(0.23, 1, 0.32, 1), opacity 300ms cubic-bezier(0.23, 1, 0.32, 1);
}

.menuDrawer-enter-from,
.menuDrawer-leave-active {
	opacity: 0;
	transform: translateX(-240px);
}

.menuDrawer-back-enter-active,
.menuDrawer-back-leave-active {
	opacity: 1;
	transition: opacity 300ms cubic-bezier(0.23, 1, 0.32, 1);
}

.menuDrawer-back-enter-from,
.menuDrawer-back-leave-active {
	opacity: 0;
}

.dkgtipfy {
	$ui-font-size: 1em; // TODO: どこかに集約したい
	$widgets-hide-threshold: 1090px;

	// ほんとは単に 100vh と書きたいところだが... https://css-tricks.com/the-trick-to-viewport-units-on-mobile/
	min-height: calc(var(--vh, 1vh) * 100);
	box-sizing: border-box;
	display: flex;

	&.wallpaper {
		background: var(--wallpaperOverlay);
		//backdrop-filter: var(--blur, blur(4px));
	}

	> .sidebar {
		border-right: solid 0.5px var(--divider);
	}

	> .contents {
		width: 100%;
		min-width: 0;
		background: var(--bg);
	}

	> .widgets {
		padding: 0 var(--margin);
		border-left: solid 0.5px var(--divider);
		background: var(--bg);

		@media (max-width: $widgets-hide-threshold) {
			display: none;
		}
	}

	> .widgetButton {
		display: block;
		position: fixed;
		z-index: 1000;
		bottom: 32px;
		right: 32px;
		width: 64px;
		height: 64px;
		border-radius: 100%;
		box-shadow: 0 3px 5px -1px rgba(0, 0, 0, 0.2), 0 6px 10px 0 rgba(0, 0, 0, 0.14), 0 1px 18px 0 rgba(0, 0, 0, 0.12);
		font-size: 22px;
		background: var(--panel);
	}

	> .widgetsDrawer-back {
		z-index: 1001;
	}

	> .widgetsDrawer {
		position: fixed;
		top: 0;
		right: 0;
		z-index: 1001;
		// ほんとは単に 100vh と書きたいところだが... https://css-tricks.com/the-trick-to-viewport-units-on-mobile/
		height: calc(var(--vh, 1vh) * 100);
		padding: var(--margin);
		box-sizing: border-box;
		overflow: auto;
		overscroll-behavior: contain;
		background: var(--bg);
	}

	> .buttons {
		position: fixed;
		z-index: 1000;
		bottom: 0;
		left: 0;
		padding: 4px 4px max(4px, env(safe-area-inset-bottom, 0px)) 4px;
		display: flex;
		width: 100%;
		box-sizing: border-box;
		-webkit-backdrop-filter: var(--blur, blur(32px));
		backdrop-filter: var(--blur, blur(32px));
		background-color: var(--header);
		border-top: solid 0.5px var(--divider);

		> .tabs_area {
			width: 85%;
			display: flex;
			justify-content: space-around;
			padding-right: 12px;
		}

		> .post_area {
			width: 15%;
			padding-right: 16px;
			margin-bottom: env(safe-area-inset-bottom);
		
			> .post_button {
				width: 64px;
				background: linear-gradient(90deg,var(--buttonGradateA),var(--buttonGradateB));
				border-radius: 999px;
				height: 64px;
				position: absolute;
				bottom: calc( env(safe-area-inset-bottom) + 12px);
			}
		}
		.fa-pencil-alt {
			margin-left: 12px;
			margin-right: 12px;
		}

		.button.post {
			height: 100%;
			color: var(--bg);
			width: 100%;
			text-align: center;
			background-color: transparent;
		}

		.button {
			background-color: var(--bg);
			border-radius: 3em;
			&.nav {
				padding: 12px;
				font-size: 1.2em;
			}
			&.home {
				padding: 12px;
				font-size: 1.2em;
			}
			&.notifications {
				padding: 12px;
				font-size: 1.2em;
			}
			&.messaging {
				padding: 12px;
				font-size: 1.2em;
			}
			&.widget {
				padding: 12px;
				font-size: 1.2em;
			}
			&.reload {
				padding: 12px;
				font-size: 1.2em;
			}
		}

		.indicator {
			&.navbar {
				font-size: 8px;
				position: relative;
				bottom: 40%;
			}
		}

		> .button {
			position: relative;
			padding: 0;
			aspect-ratio: 1;
			width: 100%;
			max-width: 60px;
			margin: auto;
			border-radius: 100%;
			background: var(--panel);
			color: var(--fg);

			&:hover {
				background: var(--panelHighlight);
			}

			&:active {
				background: var(--X2);
			}

			&.post {
				background: linear-gradient(90deg, var(--buttonGradateA), var(--buttonGradateB));
				color: var(--fgOnAccent);

				&:hover {
					background: linear-gradient(90deg, var(--X8), var(--X8));
				}

				&:active {
					background: linear-gradient(90deg, var(--X8), var(--X8));
				}
			}

			> .indicator {
				position: absolute;
				top: 0;
				left: 0;
				color: var(--indicator);
				font-size: 16px;
				animation: blink 1s infinite;
			}

			> .icon {
				font-size: 18px;
				vertical-align: middle;
			}
		}
	}

	> .menuDrawer-back {
		z-index: 1001;
	}

	> .menuDrawer {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 1001;
		// ほんとは単に 100vh と書きたいところだが... https://css-tricks.com/the-trick-to-viewport-units-on-mobile/
		height: calc(var(--vh, 1vh) * 100);
		width: 240px;
		box-sizing: border-box;
		contain: strict;
		overflow: auto;
		overscroll-behavior: contain;
		background: var(--navBg);
	}
}
</style>

<style lang="scss" module>
.statusbars {
	position: sticky;
	top: 0;
	left: 0;
}

.spacer {
	height: calc(var(--minBottomSpacing));
}
</style>
