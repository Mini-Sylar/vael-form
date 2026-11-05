import { toRef } from 'vue'
import type { Ref } from 'vue'
import type { FormCore } from './core'
import { getIn, isIndex, isPlainObject, joinPath, toSegments } from './path'
import { isListShape, isObjectShape } from './shape'

const hidden = (key: string) => key.startsWith('__v_')

/**
 * `form.model`: one ref per field of the form, to destructure for `v-model="email"`. A group or a
 * list is a ref to a writable view of it (`address.street = x`, `v-model="row.name"`). Reads follow
 * the form; every write is a `setValue`.
 */
export function createModel(core: FormCore): Record<string, Ref<unknown>> {
  const views = new Map<string, object>()

  // A group or a list the schema promises is a view before the data has it, so `address.street` works.
  const wrap = (path: string, value: unknown): unknown => {
    if (Array.isArray(value) || isPlainObject(value)) return view(path, Array.isArray(value))
    if (value !== undefined) return value
    const shape = core.shapeAt(toSegments(path))
    return isObjectShape(shape) ? view(path, false) : isListShape(shape) ? view(path, true) : value
  }

  const view = (path: string, list: boolean): object => {
    const id = `${list ? '[]' : '{}'}${path}`
    let made = views.get(id)
    if (made) return made
    const segments = toSegments(path)
    const current = () => getIn(core.values.value, segments)
    const keysOf = (): string[] => {
      const value = current()
      return Array.isArray(value)
        ? value.map((_, index) => String(index))
        : isPlainObject(value)
          ? Object.keys(value)
          : []
    }
    made = new Proxy(list ? [] : {}, {
      get(target, key) {
        if (typeof key === 'symbol') return Reflect.get(target, key)
        if (hidden(key)) return key === '__v_skip' ? true : undefined
        const value = current()
        if (list && key === 'length') return Array.isArray(value) ? value.length : 0
        const own = list
          ? isIndex(key)
          : (isPlainObject(value) && Object.hasOwn(value, key)) ||
            !!core.shapeAt(toSegments(joinPath(path, key)))
        if (!own) return Reflect.get(target, key)
        return wrap(joinPath(path, key), (value as Record<string, unknown>)?.[key])
      },
      set(_, key, value) {
        // A list's `length` is a path too: setting it truncates (and `push` sets it after the index).
        if (typeof key === 'symbol') return false
        core.setValue(joinPath(path, key), value)
        return true
      },
      // `map`, `forEach` and `in` ask whether an index exists.
      has: (target, key) =>
        typeof key === 'string' && (keysOf().includes(key) || Reflect.has(target, key)),
      ownKeys: () => (list ? [...keysOf(), 'length'] : keysOf()),
      getOwnPropertyDescriptor(target, key) {
        if (typeof key !== 'string') return undefined
        if (list && key === 'length')
          return { value: keysOf().length, writable: true, enumerable: false, configurable: false }
        if (!keysOf().includes(key)) return undefined
        return {
          value: wrap(joinPath(path, key), (current() as Record<string, unknown>)[key]),
          writable: true,
          enumerable: true,
          configurable: true,
        }
      },
    })
    views.set(id, made)
    return made
  }

  const root = view('', false)
  const refs = new Map<string, Ref<unknown>>()
  return new Proxy({} as Record<string, Ref<unknown>>, {
    get(_, key) {
      if (typeof key === 'symbol' || hidden(key)) return key === '__v_skip' ? true : undefined
      let made = refs.get(key)
      if (!made) {
        made = toRef(root as Record<string, unknown>, key)
        // Script only: in a template the ref is unwrapped to its value.
        Object.defineProperty(made, 'watch', {
          value: (handler: never, options?: never) => core.watchField(key, handler, options),
        })
        refs.set(key, made)
      }
      return made
    },
  })
}
