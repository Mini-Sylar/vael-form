import type { FormCore } from './core'
import { joinPath, toSegments } from './path'

const NOT_A_KEY = new Set(['toString', 'valueOf', 'toJSON', 'constructor'])

/**
 * The shape of the form's values with something at each field: a group is a nested tree, anything
 * else (a list too) is a field, whose `leaf` is read when it is asked for. It follows the values, so
 * `errors.email` stays current when destructured.
 */
export function createTree(core: FormCore, leaf: (path: string) => unknown): object {
  const nodes = new Map<string, object>()
  const node = (path: string): object => {
    let made = nodes.get(path)
    if (!made) {
      made = new Proxy(
        {},
        {
          get(_, key) {
            if (typeof key === 'symbol' || NOT_A_KEY.has(key)) return undefined
            if (key.startsWith('__v_')) return key === '__v_skip' ? true : undefined
            const child = joinPath(path, key)
            const segments = toSegments(child)
            return core.groupAt(segments, core.read(segments)) ? node(child) : leaf(child)
          },
        },
      )
      nodes.set(path, made)
    }
    return made
  }
  return node('')
}
