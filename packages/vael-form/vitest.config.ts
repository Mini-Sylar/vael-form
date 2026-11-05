import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

type Mode = 'vdom' | 'vapor' | 'interop'

// tests/ run once per mode: VDOM, pure Vapor, and Vapor components inside a VDOM app. One mode per
// process, since projects that compile the same .vue files differently leak into each other.
const mode = (process.env.MODE ?? 'vdom') as Mode

export default defineConfig({
  plugins: [vue({ features: { vapor: mode !== 'vdom' } })],
  resolve: { dedupe: ['vue'] },
  // Prebundled up front, so Vite doesn't reload the page mid-run when a test first imports them.
  optimizeDeps: {
    include: ['vue-i18n', 'vue/server-renderer', 'zod', 'valibot', 'arktype'],
  },
  test: {
    // A shared CI runner can be slow enough to miss a frame; a real bug fails all three runs.
    retry: process.env.CI ? 2 : 0,
    provide: { mode },
    projects: [
      {
        extends: true,
        test: {
          name: mode,
          include: ['tests/**/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
          },
        },
      },
      // Pure logic and SSR, no browser: once, in the VDOM run.
      ...(mode === 'vdom'
        ? [
            {
              extends: true as const,
              test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' as const },
            },
          ]
        : []),
    ],
  },
})
