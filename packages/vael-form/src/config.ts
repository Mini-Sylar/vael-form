import { provide } from 'vue'
import type { MaybeRefOrGetter, ObjectPlugin } from 'vue'
import { CONFIG_KEY } from './constants'
import type { FormConfig } from './types'

/**
 * Defaults for every form in the app: `app.use(formPlugin, { i18n })`. Give it your i18n once and
 * no form needs a `t`.
 */
export const formPlugin: ObjectPlugin<[config?: FormConfig]> = {
  install(app, config = {}) {
    app.provide(CONFIG_KEY, config)
  },
}

/** The same for the forms under one component, like a provider that has your i18n. */
export function provideFormConfig(config: MaybeRefOrGetter<FormConfig>): void {
  provide(CONFIG_KEY, config)
}
