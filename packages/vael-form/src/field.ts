import { computed, markRaw } from 'vue'
import type { ComputedRef } from 'vue'
import type { FormCore } from './core'
import type { RawIssue } from './issues'
import { FIELD_KEYS } from './constants'
import { getIn, isEqual, joinPath, snapshot, toSegments } from './path'
import { isAutofilled } from './autofill'
import { afterPointer, trackPointer } from './pointer'
import type { Segments } from './path'
import type { ArrayItem, FieldAttrs, FieldChange, FieldWatchOptions, FormError } from './types'

const NO_ITEMS: readonly ArrayItem<unknown>[] = []
const NOT_A_KEY = new Set(['toString', 'valueOf', 'toJSON', 'constructor'])

function lazy<T>(make: () => ComputedRef<T>): () => T {
  let made: ComputedRef<T> | undefined
  return () => (made ??= make()).value
}

/** One field's view of the form: reads and writes the value at its path. */
export class FieldImpl {
  readonly path: string
  readonly id: string
  readonly errorId: string
  readonly segments: Segments

  readonly touch: () => void
  readonly untouch: () => void
  readonly watch: (
    handler: (change: FieldChange<unknown>) => unknown,
    options?: FieldWatchOptions,
  ) => () => void
  readonly validate: () => Promise<boolean>
  readonly reset: (...value: unknown[]) => void
  readonly push: (value: unknown) => void
  readonly insert: (index: number, value: unknown) => void
  readonly remove: (index: number) => void
  readonly move: (from: number, to: number) => void
  readonly swap: (a: number, b: number) => void
  readonly replace: (values: unknown[]) => void
  readonly clear: () => void

  private readonly core: FormCore
  private readonly valueOf_: () => unknown
  private readonly touchedOf: () => boolean
  private readonly dirtyOf: () => boolean
  private readonly invalidOf: () => boolean
  private readonly attrsOf: () => FieldAttrs
  private readonly itemsOf: () => readonly ArrayItem<unknown>[]

  constructor(core: FormCore, path: string) {
    const segments = toSegments(path)
    this.core = core
    this.path = path
    this.segments = segments
    this.id = `${core.id}-${path.replaceAll('.', '-')}`
    this.errorId = `${this.id}-error`
    // Vue must not wrap a field (in a store, a reactive object): it reads its own state.
    markRaw(this)

    this.valueOf_ = lazy(() => computed(() => core.read(segments)))
    this.touchedOf = lazy(() => computed(() => core.touchedSet.value.has(path)))
    this.dirtyOf = lazy(() =>
      computed(() => !isEqual(core.read(segments), getIn(core.initial.value, segments))),
    )
    this.invalidOf = lazy(() => computed(() => this.shown().length > 0))

    const touch = () => core.touch(path)
    // Leaving the element the attrs are on: an input, or a whole fieldset or component (`focusout`
    // bubbles, `blur` doesn't), so moving between its own parts is not leaving it.
    // Leaving with a mouse press waits for the release, so the click isn't lost to its error.
    // A browser's autofill sends one too; a field still holding what it filled wasn't left by the user.
    // If that click resets the form, the field has not been left since.
    const onFocusout = (event?: FocusEvent) => {
      const from = event?.currentTarget as Element | null | undefined
      const to = event?.relatedTarget
      if (to instanceof Node && from?.contains?.(to)) return
      if (isAutofilled(event?.target)) return
      const resets = core.resets
      afterPointer(() => resets === core.resets && touch())
    }
    this.attrsOf = lazy(() =>
      computed(() => {
        trackPointer()
        const invalid = this.invalidOf()
        const attrs = {
          ...core.schemaAttrs(segments),
          id: this.id,
          name: path,
          'aria-invalid': invalid ? true : undefined,
          'aria-describedby': invalid ? this.errorId : undefined,
          onFocusout,
        }
        // Not an attribute: the id for the error's own element, so it isn't spread onto the input.
        return Object.defineProperty(attrs, 'errorId', { value: this.errorId }) as FieldAttrs
      }),
    )

    let items: readonly ArrayItem<unknown>[] = NO_ITEMS
    this.itemsOf = lazy(() =>
      computed(() => {
        const array = core.read(segments)
        if (!Array.isArray(array)) return NO_ITEMS
        const keys = core.keysOf(array)
        if (items.length === keys.length && items.every((item, i) => item.key === keys[i]))
          return items
        return (items = keys.map((key, index) => ({
          key,
          index,
          field: core.node(`${path}.${index}`) as never,
        })))
      }),
    )

    this.touch = touch
    this.untouch = () => core.untouch(path)
    this.watch = (handler, options) => core.watchField(path, handler, options)
    this.validate = () => core.validate(path)
    this.reset = (...value) => {
      core.setValue(
        path,
        value.length ? value[0] : snapshot(getIn(core.initial.value, segments)),
        false,
      )
      core.untouch(path, true)
    }

    // A list change says which old row each new row is (-1 for a new one).
    const rows = (size: number) => Array.from({ length: size }, (_, i) => i)
    this.push = (value) => core.arrayOp(path, (size) => [...rows(size), -1], [value])
    this.insert = (index, value) =>
      core.arrayOp(
        path,
        (size) => rows(size).toSpliced(Math.max(0, Math.min(index, size)), 0, -1),
        [value],
      )
    this.remove = (index) => core.arrayOp(path, (size) => rows(size).filter((i) => i !== index))
    this.move = (from, to) =>
      core.arrayOp(path, (size) => {
        const order = rows(size)
        if (from in order)
          order.splice(Math.max(0, Math.min(to, size - 1)), 0, ...order.splice(from, 1))
        return order
      })
    this.swap = (a, b) =>
      core.arrayOp(path, (size) => {
        const order = rows(size)
        if (a in order && b in order) [order[a], order[b]] = [b, a]
        return order
      })
    this.clear = () => core.arrayOp(path, () => [])
    this.replace = (values) =>
      core.arrayOp(path, () => values.map(() => -1), snapshot(values), false)
  }

  /** The errors to show for this path: the schema's and the rules' once visible, the server's always. */
  private shown(): readonly RawIssue[] {
    return this.core.shownAt(this.path)
  }

  get value(): unknown {
    return this.valueOf_()
  }
  set value(value: unknown) {
    this.core.setValue(this.path, value)
  }

  get error(): string | undefined {
    const first = this.shown()[0]
    return first && this.core.resolve(first)
  }

  get errors(): string[] {
    return this.shown().map(this.core.resolve)
  }

  get allErrors(): FormError[] {
    return this.core.rawIssuesAt(this.path).map((issue) => ({
      path: issue.path,
      message: this.core.resolve(issue),
    }))
  }

  get touched(): boolean {
    return this.touchedOf()
  }
  get dirty(): boolean {
    return this.dirtyOf()
  }
  get valid(): boolean {
    return !this.core.hasIssuesUnder(this.path)
  }
  get pending(): boolean {
    return this.core.pendingAt(this.path)
  }
  get attrs(): FieldAttrs {
    return this.attrsOf()
  }
  get items(): readonly ArrayItem<unknown>[] {
    return this.itemsOf()
  }
}

/**
 * The object behind `form.fields.a.b`: a Field for a value, children for a group. What a key
 * means is decided by the value at that moment (a group never answers to `value`), so a schema
 * can have a field called `value` or `id`.
 */
export function createNode(core: FormCore, path: string): unknown {
  const field = path === '' ? undefined : core.field(path)
  const segments = toSegments(path)
  const isField = (key: string) =>
    field !== undefined && FIELD_KEYS.has(key) && !core.isGroup(segments)

  return new Proxy(field ?? {}, {
    get(target, key) {
      if (typeof key === 'symbol') return undefined
      // Vue's flags (`__v_isRef`...): this is not a ref, and must never be made reactive.
      if (key.startsWith('__v_')) return key === '__v_skip' ? true : undefined
      if (isField(key)) return Reflect.get(target, key, target)
      if (NOT_A_KEY.has(key)) return undefined
      return core.node(joinPath(path, key))
    },
    set(target, key, value) {
      if (key !== 'value' || !isField(key)) return false
      ;(target as FieldImpl).value = value
      return true
    },
    has: (_, key) => typeof key === 'string' && !key.startsWith('__v_'),
  })
}
