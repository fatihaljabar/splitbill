import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT) || 3997;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // the suite walks one bill through the whole flow, in order
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  // The Vite dev server does not proxy /api/*, so the E2E run has to go through
  // the real production server — one Node process serving dist/ and the API,
  // exactly like Hostinger does. Requires a reachable MySQL from DATABASE_URL.
  webServer: {
    command: `npm run build && PORT=${PORT} node --env-file-if-exists=.env server/index.ts`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
