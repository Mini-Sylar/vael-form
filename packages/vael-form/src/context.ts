import type { StandardSchemaV1 } from '@standard-schema/spec'
import { inject, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { FORM_KEY } from './constants'
import type { FieldFor, Form } from './types'

/**
 * The nearest `useForm` above this component, typed by the schema you name:
 * `useFormContext<typeof schema>().field('email')` completes its paths.
 */
export function useFormContext<S extends StandardSchemaV1 = StandardSchemaV1>(): Form<S> {
  const form = inject(FORM_KEY, undefined)
  if (!form) throw new Error('[vael-form] useFormContext() needs a useForm() in a parent component')
  return form as unknown as Form<S>
}

/**
 * A field of the nearest form by path, for a reusable input component. The path can be a ref or a
 * getter (`() => props.name`), and the field follows it.
 */
export function useField<T = unknown>(path: MaybeRefOrGetter<string>): FieldFor<T> {
  const form = useFormContext()
  const current = (): object => (form.field as (path: string) => object)(toValue(path))
  return new Proxy({} as object, {
    get(_, key) {
      if (typeof key === 'symbol') return undefined
      if (key.startsWith('__v_')) return key === '__v_skip' ? true : undefined
      return Reflect.get(current(), key)
    },
    set(_, key, value) {
      return Reflect.set(current(), key, value)
    },
  }) as FieldFor<T>
}
