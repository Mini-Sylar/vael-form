import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: ['vue'],
    // The library's source, so an edit shows without a build.
    alias: {
      'vael-form': fileURLToPath(new URL('../../packages/vael-form/src/index.ts', import.meta.url)),
    },
  },
})
