import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run dev -- --port 4173 --strictPort',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	},
	testMatch: '**/*.e2e.{ts,js}',
	use: { baseURL: 'http://localhost:4173' }
});
