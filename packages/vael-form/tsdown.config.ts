import { defineConfig } from 'tsdown'

export default defineConfig({
  // `validator` is its own entry: the helper for validating without a schema library, and a chunk
  // that `useForm({ validate })` loads on demand.
  entry: {
    index: './src/index.ts',
    validator: './src/validator.ts',
    // The Nuxt module, and the plugin it adds to the app (built for Nuxt to compile, with `#app`).
    nuxt: './src/nuxt.ts',
    'runtime/plugin': './src/runtime/plugin.ts',
  },
  // The plugin imports the package by name, as the app does, so they share one copy.
  external: ['vael-form', '#app', /^@nuxt\//],
  format: ['esm'],
  platform: 'neutral',
  // The code uses ES2023 array methods (`toSpliced`), so say so instead of leaving it to chance.
  target: 'es2022',
  dts: true,
  // Shipped unminified on purpose: the app's bundler minifies, and a library that does it for them
  // only gets harder to debug and to tree-shake. `pnpm size` measures the minified build.
  exports: true,
  publint: true,
  attw: { profile: 'esm-only' },
})
