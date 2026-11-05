import { addImports, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'
import type { ShowErrorsFor } from './types'

export interface ModuleOptions {
  /** When errors appear, for every form: `'edited'` (default), `'blur'`, `'input'` or `'submit'`. */
  showErrors?: ShowErrorsFor
  /** Where the form's messages sit in your catalog. Default `formKit`. */
  keyPrefix?: string
  /** Use `@nuxtjs/i18n` (or any `$i18n` on the app) for the messages. Default `true`. */
  i18n?: boolean
  /** Auto-import `useForm`, `useFormContext`, `useField` and `msg`. Default `true`. */
  autoImports?: boolean
}

/** `modules: ['vael-form/nuxt']`: the plugin is installed, with the app's i18n, and the composables imported. */
const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: { name: 'vael-form', configKey: 'vaelForm' },
  defaults: { i18n: true, autoImports: true },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    const { showErrors, keyPrefix, i18n } = options
    nuxt.options.runtimeConfig.public.vaelForm = JSON.parse(
      JSON.stringify({ showErrors, keyPrefix, i18n }), // without the options left out
    )
    addPlugin(resolve('./runtime/plugin'))
    if (options.autoImports)
      addImports(
        ['useForm', 'useFormContext', 'useField', 'msg'].map((name) => ({
          name,
          from: 'vael-form',
        })),
      )
  },
})

export default module
