// @env isomorphic
export type Segments = readonly string[]

export const toSegments = (path: string): Segments => (path === '' ? [] : path.split('.'))

export const joinPath = (parent: string, key: string): string => (parent ? `${parent}.${key}` : key)

const INDEX = /^(0|[1-9]\d*)$/
export const isIndex = (key: string): boolean => INDEX.test(key)

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** `'a.b'` -> `['', 'a', 'a.b']`: the path and everything above it. */
export function ancestors(path: string): string[] {
  const out = ['']
  if (path === '') return out
  let at = -1
  while ((at = path.indexOf('.', at + 1)) !== -1) out.push(path.slice(0, at))
  out.push(path)
  return out
}

export function getIn(root: unknown, segments: Segments): unknown {
  let current = root
  for (const key of segments) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/**
 * A copy of `root` with `value` at `segments`, sharing everything else. `onCopyArray` sees each
 * array that was copied along the way, so its identity-keyed data can follow.
 */
export function setIn(
  root: unknown,
  segments: Segments,
  value: unknown,
  onCopyArray?: (from: unknown[], to: unknown[]) => void,
  at = 0,
): unknown {
  if (at === segments.length) return value
  const key = segments[at]!
  const container: Record<string, unknown> | unknown[] =
    Array.isArray(root) || isPlainObject(root) ? root : isIndex(key) ? [] : {}
  const child = (container as Record<string, unknown>)[key]
  const next = setIn(child, segments, value, onCopyArray, at + 1)
  if (Object.is(child, next) && container === root) return root

  let copy: Record<string, unknown> | unknown[]
  if (Array.isArray(container)) {
    copy = container.slice()
    onCopyArray?.(container, copy)
  } else copy = { ...container }
  ;(copy as Record<string, unknown>)[key] = next
  return copy
}

/** A deep copy of plain objects and arrays; anything else (Date, File, a class) is shared. */
export function snapshot<T>(value: T): T {
  if (Array.isArray(value)) return value.map(snapshot) as T
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) out[key] = snapshot(value[key])
    return out as T
  }
  return value
}

export function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => isEqual(item, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every((key) => key in b && isEqual(a[key], b[key]))
  }
  return false
}

/** `members.*.email` against the values: every path it stands for now. */
export function expand(values: unknown, segments: readonly string[]): string[] {
  let paths = ['']
  let nodes: unknown[] = [values]
  for (const segment of segments) {
    const nextPaths: string[] = []
    const nextNodes: unknown[] = []
    paths.forEach((path, i) => {
      const node = nodes[i]
      if (segment === '*') {
        if (Array.isArray(node))
          node.forEach((child, index) => {
            nextPaths.push(joinPath(path, String(index)))
            nextNodes.push(child)
          })
      } else {
        nextPaths.push(joinPath(path, segment))
        nextNodes.push(
          node !== null && typeof node === 'object'
            ? (node as Record<string, unknown>)[segment]
            : undefined,
        )
      }
    })
    paths = nextPaths
    nodes = nextNodes
  }
  return paths
}
