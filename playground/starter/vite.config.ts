import { dirname } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const mode = process.env.MODE === 'vapor' ? 'vapor' : 'vdom'
// vael-ui comes from npm. To try an unreleased build, point VAEL_UI_DIST at its `dist` folder.
const UI = process.env.VAEL_UI_DIST

// Reads the built package, as an app that installed it would.
export default defineConfig({
  plugins: [vue({ features: { vapor: mode === 'vapor' } })],
  define: { __MODE__: JSON.stringify(mode) },
  resolve: {
    dedupe: ['vue'],
    alias: UI
      ? [
          { find: /^vael-ui\/style\.css$/, replacement: `${UI}/style-entry.css` },
          { find: /^vael-ui$/, replacement: `${UI}/${mode === 'vapor' ? 'vapor/' : ''}index.js` },
        ]
      : mode === 'vapor'
        ? [{ find: /^vael-ui$/, replacement: 'vael-ui/vapor' }]
        : [],
  },
  server: UI ? { fs: { allow: ['.', dirname(UI)] } } : undefined,
  // Each mode keeps its own dependency cache, so two servers can run side by side.
  cacheDir: `node_modules/.vite-${mode}`,
})
