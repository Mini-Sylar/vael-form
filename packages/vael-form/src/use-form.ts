import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as vue from 'vue'
import {
  getCurrentInstance,
  hasInjectionContext,
  inject,
  markRaw,
  provide,
  toValue,
  useId,
} from 'vue'
import { computed } from 'vue'
import { CONFIG_KEY, FORM_KEY } from './constants'
import { FormCore } from './core'
import { createModel } from './model'
import { createTree } from './trees'
import type { PlainFormOptions, Form, UseFormOptions } from './types'

/**
 * Whether a component is being set up. `getCurrentInstance()` is null in a Vapor component, and
 * `hasInjectionContext()` is also true under `app.runWithContext` (a Pinia store): Vue 3.6 has a
 * quiet probe for exactly this, and `getCurrentInstance()` is exact before it.
 */
function inComponent(): boolean {
  const probe = (
    vue as { useInstanceOption?: (key: string, silent: boolean) => { hasInstance: boolean } }
  ).useInstanceOption
  return probe ? probe('uid', true).hasInstance : getCurrentInstance() !== null
}

/**
 * `validate` rules as a schema. The code that runs them is a chunk of its own, loaded as the form is
 * made, so a form with a schema library never pays for it; a validation that has to wait for it is
 * simply an async one.
 */
function validatorSchema(rules: unknown): StandardSchemaV1 {
  let loaded: StandardSchemaV1 | undefined
  const loading = import('./validator').then(
    (module) => (loaded = module.validator(rules as never)),
  )
  return {
    '~standard': {
      version: 1,
      vendor: 'vael-form',
      validate: (value) =>
        loaded
          ? loaded['~standard'].validate(value)
          : loading.then((schema) => schema['~standard'].validate(value)),
    },
  }
}

/** A form validated by plain `validate` rules, typed from `defaultValues` or from `useForm<Values>`... */
export function useForm<T extends object = Record<string, unknown>>(
  options: PlainFormOptions<T>,
): Form<StandardSchemaV1<T, T>>
/** ...or by a schema library (or any Standard Schema). */
export function useForm<S extends StandardSchemaV1>(options: UseFormOptions<S>): Form<S>
export function useForm(
  given: UseFormOptions<StandardSchemaV1> | PlainFormOptions<object>,
): Form<StandardSchemaV1> {
  const options = (
    'schema' in given ? given : { ...given, schema: validatorSchema(given.validate) }
  ) as UseFormOptions<StandardSchemaV1>
  const component = inComponent()
  // An app's config reaches a form made in a store too: Pinia sets stores up inside the app.
  const config = hasInjectionContext() ? inject(CONFIG_KEY, undefined) : undefined
  const core = new FormCore(
    options as unknown as UseFormOptions<StandardSchemaV1>,
    () => toValue(config),
    options.id ?? (component ? useId() : undefined),
  )

  // Each is made on first use: a form that doesn't read one never pays for it.
  const once = <T>(make: () => T) => {
    let made: T | undefined
    return () => (made ??= make())
  }
  const model = once(() => createModel(core))
  const errors = once(() => createTree(core, (path) => core.field(path).error))
  const attrs = once(() => createTree(core, (path) => core.field(path).attrs))
  const ref = <T>(read: () => T) => once(() => computed(read))
  const values = ref(() => core.values.value)
  const errorList = ref(() => core.shownErrors())
  const allErrors = ref(() => core.allErrors())
  const valid = ref(() => core.valid)
  const dirty = ref(() => core.dirty)
  const touched = ref(() => core.touchedSet.value.size > 0)
  const pending = ref(() => core.pending)
  const submitting = ref(() => core.submittingRef.value)
  const submitCount = ref(() => core.submitCountRef.value)

  const form = {
    get model() {
      return model()
    },
    get errors() {
      return errors()
    },
    get attrs() {
      return attrs()
    },
    field: (path: string) => core.field(path),
    watch: (path: string, handler: never, options?: never) =>
      core.watchField(path, handler, options),
    get values() {
      return values()
    },
    setValue: core.setValue,
    setValues: core.setValues,
    get errorList() {
      return errorList()
    },
    get allErrors() {
      return allErrors()
    },
    get valid() {
      return valid()
    },
    get dirty() {
      return dirty()
    },
    get touched() {
      return touched()
    },
    get pending() {
      return pending()
    },
    get submitting() {
      return submitting()
    },
    get submitCount() {
      return submitCount()
    },
    validate: core.validate,
    handleSubmit: core.handleSubmit,
    reset: core.reset,
    setErrors: core.setErrors,
    clearErrors: core.clearErrors,
  } as unknown as Form<StandardSchemaV1>
  core.owner = form

  if (component) provide(FORM_KEY, form as never)
  return markRaw(form)
}
