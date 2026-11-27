import { toRef } from 'vue'
import type { Ref } from 'vue'
import type { FormCore } from './core'
import { getIn, isIndex, isPlainObject, joinPath, snapshot, toSegments } from './path'
import { isListShape, isObjectShape } from './shape'

const hidden = (key: string) => key.startsWith('__v_')

// Each view's data, read now: any form's view stored in values is stored as a copy of its data.
const reads = new WeakMap<object, () => unknown>()

// The array methods that change a list in place: each is one list change, as `field.push` is.
const MUTATOR = /^(push|pop|shift|unshift|splice|reverse|sort|fill|copyWithin)$/

/**
 * `form.model`: one ref per field of the form, to destructure for `v-model="email"`. A group or a
 * list is a ref to a writable view of it (`address.street = x`, `v-model="row.name"`). Reads follow
 * the form; every write is a `setValue`.
 */
export function createModel(core: FormCore): Record<string, Ref<unknown>> {
  const views = new Map<string, object>()

  /** What to store: a view (a row read from the model) becomes a copy of its data now. */
  const plain = (value: unknown): unknown => {
    const read = reads.get(value as object)
    if (read) return snapshot(read())
    if (!Array.isArray(value) && !isPlainObject(value)) return value
    let out: Record<string, unknown> | unknown[] | undefined
    for (const [key, item] of Object.entries(value)) {
      const next = plain(item)
      if (next !== item)
        ((out ??= Array.isArray(value) ? [...value] : { ...value }) as any)[key] = next
    }
    return out ?? value
  }

  /** `members.splice(1, 1)` and the like: run on a copy, then one list change; each row keeps its key. */
  const mutate = (path: string, list: object, method: string, args: unknown[]): unknown => {
    const current = getIn(core.latest, toSegments(path))
    const rows = Array.isArray(current) ? current : []
    const next = rows.slice()
    const items = args.map(plain)
    const result = (next as any)[method](...items)
    const splice = method === 'splice'
    let fill = splice ? items.slice(2) : items
    let order = [...rows.keys()]
    // These say which rows go, which equal values (`['a', 'a']`) can't: they run on the indexes.
    if (/^(p|u|sh|sp)/.test(method))
      (order as any)[method](...(splice ? items.slice(0, 2) : []), ...fill.map(() => -1))
    else {
      // Each row of the new list is the old row it is (a row there twice is new the second time).
      const used = new Set<number>()
      fill = []
      order = next.map((value) => {
        const from = rows.findIndex((row, i) => row === value && !used.has(i))
        if (from < 0) fill.push(value)
        else used.add(from)
        return from
      })
    }
    core.arrayOp(path, () => order, fill)
    return result === next ? list : result
  }

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
        if (list && MUTATOR.test(key)) return (...args: unknown[]) => mutate(path, made!, key, args)
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
        // A list's `length` is a path too: setting it truncates.
        if (typeof key === 'symbol') return false
        core.setValue(joinPath(path, key), plain(value))
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
    reads.set(made, () => getIn(core.latest, segments))
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
