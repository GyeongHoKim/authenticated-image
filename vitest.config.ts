import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { mockApi } from './dev/mock-api.ts';

type BrowserName = 'chromium' | 'firefox' | 'webkit';

const browsers = (process.env.BROWSERS ?? 'chromium').split(',') as BrowserName[];

export default defineConfig({
  plugins: [mockApi()],
  test: {
    include: ['src/**/*.test.ts', 'dev/**/*.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: browsers.map((browser) => ({ browser })),
    },
  },
});
