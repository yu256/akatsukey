import { defineConfig, mergeConfig } from 'vitest/config';
import { getConfig } from './vite.config.js';

export default mergeConfig(getConfig(), defineConfig({
	test: {
		environment: 'happy-dom',
		environmentOptions: {
			happyDOM: {
				settings: {
					enableJavaScriptEvaluation: false,
					disableIframePageLoading: true,
					disableCSSFileLoading: true,
				},
			},
		},
	},
}));
