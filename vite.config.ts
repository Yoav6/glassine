import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	ssr: {
		external: ['better-sqlite3'],
		noExternal: ['@handlewithcare/prosemirror-suggest-changes']
	},
	server: {
		host: true
	},
	test: {
		expect: { requireAssertions: true },
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
		pool: 'forks',
		fileParallelism: false
	}
});
