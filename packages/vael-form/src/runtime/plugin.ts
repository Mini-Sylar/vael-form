// @ts-expect-error `#app` exists in the Nuxt app that runs this plugin, not here.
import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import { formPlugin } from 'vael-form'
import type { FormConfig, FormI18n } from 'vael-form'

export default defineNuxtPlugin((nuxtApp: { vueApp: { use: Function }; $i18n?: FormI18n }) => {
  const options = (useRuntimeConfig().public.vaelForm ?? {}) as FormConfig & { i18n?: boolean }
  const config: FormConfig = {
    // Nuxt's runtime config turns an option left out into '', which would be a real value here.
    showErrors: options.showErrors || undefined,
    keyPrefix: options.keyPrefix || undefined,
    // Read when a message is shown, so it doesn't matter whether `@nuxtjs/i18n` was set up first.
    get i18n() {
      return options.i18n === false ? undefined : nuxtApp.$i18n
    },
  }
  nuxtApp.vueApp.use(formPlugin, config)
})
