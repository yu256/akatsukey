/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import './init';
import MkWidgets from '@/components/MkWidgets.vue';

describe('saved widget layouts', () => {
	afterEach(cleanup);

	test('renders normal widgets while ignoring retired widgets', () => {
		const widgets = ['memo', 'aiscript', 'aiscriptApp', 'button', 'vrcUserList', 'vrcProfile'].map((name, index) => ({
			id: String(index), name, data: { script: 'should never run' },
		}));
		const { container, getByTestId } = render(MkWidgets, {
			props: { widgets, edit: false },
			global: {
				components: { WidgetMemo: { template: '<div data-testid="memo">memo</div>' } },
			},
		});

		expect(getByTestId('memo')).toBeTruthy();
		expect(container.firstElementChild?.children).toHaveLength(1);
		expect(container.textContent).not.toContain('should never run');
		expect(widgets).toHaveLength(6);
	});
});
