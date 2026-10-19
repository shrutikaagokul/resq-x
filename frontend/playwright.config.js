import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: { baseURL: 'http://127.0.0.1:15173', viewport: { width: 1440, height: 1100 },
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    launchOptions: { args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  outputDir: '../artifacts/browser',
  webServer: [
    { command: '../.venv/bin/uvicorn backend.main:app --app-dir .. --host 127.0.0.1 --port 18000',
      url: 'http://127.0.0.1:18000/health', reuseExistingServer: false,
      env: { RESQ_DB: '/tmp/resqx-browser-test.sqlite3' } },
    { command: 'npm run dev -- --port 15173 --strictPort', url: 'http://127.0.0.1:15173', reuseExistingServer: false, env: { RESQ_API_TARGET: 'http://127.0.0.1:18000' } },
  ],
})
