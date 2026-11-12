import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
  computed,
  getCurrentScope,
  isRef,
  nextTick,
  onScopeDispose,
  shallowRef,
  toValue,
  unref,
  watch,
} from 'vue'
import type { ComputedRef, ShallowRef } from 'vue'
import { FieldImpl, createNode } from './field'
import { humanize, interpolate, parseMessage, translate } from './i18n'
import { toFormData } from './form-data'
import { EMPTY_ISSUES, groupIssues, joinIssues } from './issues'
import type { IssueMap, RawIssue } from './issues'
import type { RuleEngine } from './rules'
import { DEFAULT_PREFIX } from './constants'
import type { describeIssue } from './standard'
import {
  ancestors,
  getIn,
  isEqual,
  isIndex,
  isPlainObject,
  setIn,
  snapshot,
  toSegments,
} from './path'
import type { Segments } from './path'
import { isObjectShape, shapeAt, shapeOf, withGroups } from './shape'
import type { Shape } from './shape'
import type { limitsAt } from './limits'
import type {
  FieldChange,
  FieldWatchOptions,
  FormConfig,
  FormI18n,
  FormError,
  ShowErrors,
  ShowErrorsFor,
  SubmitContext,
  SubmittedContext,
  UseFormOptions,
} from './types'

interface Outcome {
  valid: boolean
  value?: unknown
  issues: readonly RawIssue[]
}

const EMPTY_SET: ReadonlySet<string> = new Set()

let counter = 0

function issuePath(issue: StandardSchemaV1.Issue): string {
  if (!issue.path?.length) return ''
  return issue.path.map((part) => String(typeof part === 'object' ? part.key : part)).join('.')
}

const isPromise = (value: unknown): value is PromiseLike<unknown> =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as PromiseLike<unknown>).then === 'function'

function remapKey(key: string, prefix: string, remap: (index: number) => number | null) {
  if (!key.startsWith(prefix)) return key
  const rest = key.slice(prefix.length)
  const dot = rest.indexOf('.')
  const head = dot === -1 ? rest : rest.slice(0, dot)
  if (!isIndex(head)) return key
  const to = remap(Number(head))
  return to === null ? null : prefix + to + (dot === -1 ? '' : rest.slice(dot))
}

function remapSet(
  set: ReadonlySet<string>,
  prefix: string,
  remap: (index: number) => number | null,
) {
  const next = new Set<string>()
  for (const key of set) {
    const moved = remapKey(key, prefix, remap)
    if (moved !== null) next.add(moved)
  }
  return next
}

type SubmitHandler = (values: any, context: SubmittedContext<StandardSchemaV1>) => unknown

interface Watcher {
  segments: Segments
  handler: (change: FieldChange<unknown>) => unknown
  debounce: number
  /** The value as the watcher last saw it. */
  last: unknown
  /** The value before a debounced burst began. */
  before?: unknown
  timer?: ReturnType<typeof setTimeout>
}

/** The state and the operations behind one `useForm`; `Form` and `Field` are views of it. */
export class FormCore {
  readonly id: string
  readonly values: ShallowRef<unknown>
  readonly initial: ShallowRef<unknown>
  readonly issueMap: ShallowRef<IssueMap> = shallowRef(EMPTY_ISSUES)
  readonly serverMap: ShallowRef<IssueMap> = shallowRef(EMPTY_ISSUES)
  readonly touchedSet: ShallowRef<ReadonlySet<string>> = shallowRef(EMPTY_SET)
  readonly revealedSet: ShallowRef<ReadonlySet<string>> = shallowRef(EMPTY_SET)
  /** Rows added since the last submit or step check: a submit that didn't include them shows nothing for them. */
  readonly freshSet: ShallowRef<ReadonlySet<string>> = shallowRef(EMPTY_SET)
  /** Paths the user changed (or `setValue` did): what `showErrors: 'edited'` waits for. */
  readonly editedSet: ShallowRef<ReadonlySet<string>> = shallowRef(EMPTY_SET)
  readonly submitCountRef = shallowRef(0)
  readonly submittingRef = shallowRef(false)
  readonly pendingRef = shallowRef(0)
  /** The errors of the checks a schema shouldn't hold, beside the schema's. */
  readonly ruleIssues: ShallowRef<IssueMap> = shallowRef(EMPTY_ISSUES)
  /** Where one of those checks is waiting or running. */
  readonly ruleBusy: ShallowRef<ReadonlySet<string>> = shallowRef(new Set())

  /** The form `useForm` returned, for the context a submit hands out. */
  owner?: unknown
  /** The values without reading the ref: for decisions that must not become a dependency. */
  latest: unknown
  private keys = new WeakMap<unknown[], string[]>()
  private keyCount = 0
  private fields = new Map<string, FieldImpl>()
  private nodes = new Map<string, unknown>()
  private active = false
  private run_ = 0
  private userEdits = 0
  private seenEdits = 0
  private readonly watchers = new Set<Watcher>()
  private stopWatching?: () => void
  private readonly hasRules: boolean
  private engine?: RuleEngine
  private describe?: typeof describeIssue
  private loadingReaders?: Promise<void>
  /** Turns true once the catalog readers (a chunk of their own) are loaded: errors read it, so they update. */
  private readonly readersReady = shallowRef(false)
  private loading?: Promise<RuleEngine>

  private readonly options: UseFormOptions<StandardSchemaV1>
  private readonly config: () => FormConfig | undefined

  private dirtyComputed?: ComputedRef<boolean>

  constructor(
    options: UseFormOptions<StandardSchemaV1>,
    config: () => FormConfig | undefined,
    id: string | undefined,
  ) {
    this.options = options
    this.config = config
    this.id = id ?? `vael-form-${++counter}`
    const initial = snapshot(toValue(options.defaultValues) ?? {})
    this.initial = shallowRef(initial)
    this.values = shallowRef(initial)
    this.latest = initial
    // Rules are async by nature, so their code is a chunk that only a form with rules loads.
    this.hasRules = Object.keys(options.rules ?? {}).length > 0
    if (this.hasRules) void this.loadRules()
    // The code that maps a schema library's errors to the app's catalog is only for apps with one.
    if (this.i18n()) this.loadReaders()
    if (getCurrentScope()) onScopeDispose(() => this.engine?.clear())

    // Before the render, so a sync schema's errors land in the same pass as the value.
    watch(this.values, () => (this.active ? this.run() : undefined), { flush: 'pre' })
    // A schema in a ref is for forms built at runtime: a new one validates the values again.
    if (isRef(options.schema))
      watch(options.schema, () => (this.active ? this.run() : undefined), { flush: 'pre' })
    watch(
      () => toValue(this.i18n()?.locale),
      () => (this.active ? this.run() : undefined),
      { flush: 'post' },
    )
    const source = options.defaultValues
    if (typeof source === 'function' || (source && typeof source === 'object' && 'value' in source))
      watch(
        () => snapshot(toValue(source)),
        (next) => {
          if (!this.dirty) this.reset(next ?? {})
        },
      )
  }

  get schema(): StandardSchemaV1 {
    return unref(this.options.schema)
  }

  private shapes = new WeakMap<object, Shape | null>()

  /** What the schema says is at `segments`, when its library can say (Zod, Valibot, ArkType). */
  shapeAt(segments: Segments): Shape | undefined {
    const schema = this.schema
    let root = this.shapes.get(schema)
    if (root === undefined) this.shapes.set(schema, (root = shapeOf(schema) ?? null))
    return root ? shapeAt(root, segments) : undefined
  }

  /** A group: an object now, or one the schema says belongs here before the data has it. */
  groupAt(segments: Segments, value: unknown): boolean {
    return isPlainObject(value) || (value === undefined && isObjectShape(this.shapeAt(segments)))
  }

  private limits?: typeof limitsAt
  private loadingLimits?: Promise<void>
  /** Turns true once the limits chunk is here: attrs read it, so they update. */
  private readonly limitsReady = shallowRef(false)

  /** The attributes the schema implies for the input at `segments` (`maxlength`, `aria-required`…). */
  schemaAttrs(segments: Segments): Record<string, string | number | boolean> {
    const root = this.shapeAt([])
    if (!root) return {}
    this.loadingLimits ??= import('./limits').then((module) => {
      this.limits = module.limitsAt
      this.limitsReady.value = true
    })
    return this.limitsReady.value ? this.limits!(root, segments) : {}
  }

  // ---- config

  i18n(): FormI18n | undefined {
    return this.options.i18n ?? this.config()?.i18n
  }

  /** The mode for `path`: its own entry, else the nearest group above it, else `default`. */
  showErrors(path: string): ShowErrors {
    const setting: ShowErrorsFor | undefined = this.options.showErrors ?? this.config()?.showErrors
    if (typeof setting !== 'object') return setting ?? 'edited'
    const above = ancestors(path)
    for (let i = above.length - 1; i > 0; i--) {
      const mode = (setting as Record<string, ShowErrors | undefined>)[above[i]!]
      if (mode) return mode
    }
    return setting.default ?? 'edited'
  }

  private label(path: string): string {
    const label = (this.options.labels as Record<string, string | undefined> | undefined)?.[path]
    if (label) return translate(this.i18n(), [label], {}) ?? label
    return humanize(path.slice(path.lastIndexOf('.') + 1))
  }

  private loadReaders(): void {
    this.loadingReaders ??= import('./standard').then((module) => {
      this.describe = module.describeIssue
      this.readersReady.value = true
    })
  }

  /** What the app's catalog says for an issue the schema library raised on its own. */
  private fromCatalog(issue: RawIssue): string {
    const i18n = this.i18n()
    if (!i18n || !issue.source) return issue.message
    this.loadReaders()
    // Until the readers are here the library's own text shows; reading this makes it update after.
    if (!this.readersReady.value) return issue.message
    const found = this.describe!(
      issue.vendor,
      issue.source,
      this.config()?.keyPrefix ?? DEFAULT_PREFIX,
      getIn(this.latest, toSegments(issue.path)),
    )
    if (!found) return issue.message
    const params = { field: this.label(issue.path), path: issue.path, ...found.params }
    return translate(i18n, found.keys, params) ?? issue.message
  }

  /** The text to show for an issue, in the current locale. */
  resolve = (issue: RawIssue): string => {
    const tagged = parseMessage(issue.message)
    if (!tagged) return this.fromCatalog(issue)
    const params = { field: this.label(issue.path), path: issue.path, ...tagged.params }
    return (
      translate(this.i18n(), tagged.keys, params) ??
      (tagged.fallback !== undefined ? interpolate(tagged.fallback, params) : tagged.keys[0]!)
    )
  }

  // ---- values

  private commit(next: unknown): void {
    this.latest = next
    this.values.value = next
  }

  private inheritKeys = (from: unknown[], to: unknown[]): void => {
    const keys = this.keys.get(from)
    if (keys) this.keys.set(to, keys)
  }

  keysOf(array: unknown[]): string[] {
    let keys = this.keys.get(array)
    if (!keys || keys.length !== array.length) {
      keys = array.map(() => `${this.id}-${++this.keyCount}`)
      this.keys.set(array, keys)
    }
    return keys
  }

  /** `user` is false for a change the form makes (a reset), which `field.watch` doesn't report. */
  setValue = (path: string, value: unknown, user = true): void => {
    const next = setIn(this.latest, toSegments(path), value, this.inheritKeys)
    if (user) {
      // A write that changes nothing is not an edit a watcher will be told about.
      if (next !== this.latest) this.userEdits++
      this.markEdited(path)
    }
    this.commit(next)
    this.dropServer(path)
  }

  setValues = (values: unknown): void => {
    this.seenEdits = this.userEdits // an edit made earlier in this tick is overwritten, not reported
    this.commit(snapshot(values))
    this.clearErrors()
  }

  read(segments: Segments): unknown {
    return getIn(this.values.value, segments)
  }

  isGroup(segments: Segments): boolean {
    return isPlainObject(getIn(this.latest, segments))
  }

  get dirty(): boolean {
    return (this.dirtyComputed ??= computed(() => !isEqual(this.values.value, this.initial.value)))
      .value
  }

  // ---- watching

  watchField(
    path: string,
    handler: (change: FieldChange<unknown>) => unknown,
    options: FieldWatchOptions = {},
  ): () => void {
    const segments = toSegments(path)
    const watcher: Watcher = {
      segments,
      handler,
      debounce: options.debounce ?? 0,
      last: getIn(this.latest, segments),
    }
    this.watchers.add(watcher)
    // One watcher for all of them, made with the first: a form that never watches pays nothing.
    this.stopWatching ??= watch(this.values, () => this.notify(), { flush: 'pre' })
    if (options.immediate) handler({ value: watcher.last, oldValue: undefined })
    const stop = () => {
      clearTimeout(watcher.timer)
      this.watchers.delete(watcher)
      if (!this.watchers.size) {
        this.stopWatching?.()
        this.stopWatching = undefined
      }
    }
    if (getCurrentScope()) onScopeDispose(stop)
    return stop
  }

  private notify(): void {
    const user = this.userEdits !== this.seenEdits
    this.seenEdits = this.userEdits
    for (const watcher of this.watchers) {
      const value = getIn(this.latest, watcher.segments)
      if (isEqual(value, watcher.last)) continue
      const oldValue = watcher.before ?? watcher.last
      watcher.last = value
      if (!user) {
        // a reset or a load: the watcher follows the value without being told
        watcher.before = undefined
        clearTimeout(watcher.timer)
        continue
      }
      if (!watcher.debounce) {
        watcher.handler({ value, oldValue })
        // what the handler wrote to its own field is not a change to report
        watcher.last = getIn(this.latest, watcher.segments)
        continue
      }
      watcher.before ??= oldValue
      clearTimeout(watcher.timer)
      watcher.timer = setTimeout(() => {
        const old = watcher.before
        watcher.before = undefined
        const now = getIn(this.latest, watcher.segments)
        watcher.handler({ value: now, oldValue: old })
        watcher.last = getIn(this.latest, watcher.segments)
      }, watcher.debounce)
    }
  }

  // ---- arrays

  /**
   * Changes a list. `plan` gets its length and says, for each row of the new list, which old row it
   * is (-1 for a new row, whose value comes from `fill`): that is enough to move the keys, and the
   * touched/shown state with them.
   */
  arrayOp(
    path: string,
    plan: (size: number) => number[],
    fill: unknown[] = [],
    fresh = true,
  ): void {
    const segments = toSegments(path)
    const current = getIn(this.latest, segments)
    const array = Array.isArray(current) ? current : []
    const order = plan(array.length)
    if (order.length === array.length && order.every((from, to) => from === to)) return
    const keys = this.keysOf(array)
    const incoming = [...fill]
    const next = order.map((from) => (from < 0 ? incoming.shift() : array[from]))
    this.userEdits++
    this.keys.set(
      next,
      order.map((from) => (from < 0 ? this.newKey() : keys[from]!)),
    )
    this.commit(setIn(this.latest, segments, next, this.inheritKeys))

    // Where each old row went, for the state that follows it.
    const moved: (number | null)[] = array.map(() => null)
    order.forEach((from, to) => from >= 0 && (moved[from] = to))
    if (moved.some((to, from) => to !== from)) {
      const prefix = `${path}.`
      const remap = (i: number) => moved[i] ?? null
      this.touchedSet.value = remapSet(this.touchedSet.value, prefix, remap)
      this.revealedSet.value = remapSet(this.revealedSet.value, prefix, remap)
      this.editedSet.value = remapSet(this.editedSet.value, prefix, remap)
      this.freshSet.value = remapSet(this.freshSet.value, prefix, remap)
      if (this.serverMap.value.size) {
        const shifted = new Map<string, readonly RawIssue[]>()
        for (const [key, list] of this.serverMap.value) {
          const to = remapKey(key, prefix, remap)
          if (to !== null) shifted.set(to, list)
        }
        this.serverMap.value = shifted
      }
    }
    if (fresh) {
      const added = order.flatMap((from, to) => (from < 0 ? `${path}.${to}` : []))
      this.freshSet.value = new Set([...this.freshSet.value, ...added])
    }
    this.markEdited(path)
    this.touch(path)
  }

  newKey(): string {
    return `${this.id}-${++this.keyCount}`
  }

  // ---- touched, revealed, visible

  touch = (path: string): void => {
    if (!this.touchedSet.value.has(path))
      this.touchedSet.value = new Set(this.touchedSet.value).add(path)
    const fresh = this.freshSet.value
    if (fresh.size) {
      const held = ancestors(path).filter((above) => fresh.has(above))
      if (held.length)
        this.freshSet.value = new Set([...fresh].filter((key) => !held.includes(key)))
    }
    this.engine?.blur(path)
  }

  /** Counts resets, so a touch that waited for a click can tell the click reset the form. */
  resets = 0

  /** Forgets that `path` was touched (and shown); `edits` also forgets that it was changed. */
  untouch(path: string, edits = false): void {
    this.resets++
    const prefix = `${path}.`
    const drop = (set: ReadonlySet<string>) => {
      const next = new Set([...set].filter((key) => key !== path && !key.startsWith(prefix)))
      return next.size === set.size ? set : next
    }
    this.touchedSet.value = drop(this.touchedSet.value)
    this.revealedSet.value = drop(this.revealedSet.value)
    if (edits) this.editedSet.value = drop(this.editedSet.value)
  }

  /** A submit or step check includes the rows under `path` (all of them without one). */
  private include(path?: string): void {
    const fresh = this.freshSet.value
    if (!fresh.size) return
    const prefix = `${path}.`
    const next = new Set(
      [...fresh].filter((key) => path && key !== path && !key.startsWith(prefix)),
    )
    this.freshSet.value = next.size === fresh.size ? fresh : next
  }

  private markEdited(path: string): void {
    if (!this.editedSet.value.has(path))
      this.editedSet.value = new Set(this.editedSet.value).add(path)
  }

  private reveal(path: string): void {
    if (!this.revealedSet.value.has(path))
      this.revealedSet.value = new Set(this.revealedSet.value).add(path)
  }

  /** Whether the schema's issues at `path` are to be shown. Server issues always are. */
  isVisible(path: string): boolean {
    const fresh = this.freshSet.value
    // A row added after the submit wasn't part of it: it earns its errors like any other.
    if (!fresh.size || !ancestors(path).some((key) => fresh.has(key))) {
      if (this.submitCountRef.value > 0) return true
      const revealed = this.revealedSet.value
      if (revealed.size) for (const above of ancestors(path)) if (revealed.has(above)) return true
    }
    const mode = this.showErrors(path)
    if (mode === 'submit') return false
    const prefix = `${path}.`
    const under = (set: ReadonlySet<string>) => {
      for (const key of set) if (key === path || key.startsWith(prefix)) return true
      return false
    }
    const touched = under(this.touchedSet.value)
    if (mode === 'blur') return touched
    if (mode === 'edited') return touched && under(this.editedSet.value)
    return (
      touched ||
      !isEqual(
        getIn(this.values.value, toSegments(path)),
        getIn(this.initial.value, toSegments(path)),
      )
    )
  }

  // ---- issues

  rawIssuesAt(path: string): readonly RawIssue[] {
    this.activate()
    return joinIssues(
      this.issueMap.value.get(path),
      this.ruleIssues.value.get(path),
      this.serverMap.value.get(path),
    )
  }

  /** Any error at `path` or under it, shown or not. */
  hasIssuesUnder(path: string): boolean {
    this.activate()
    const prefix = `${path}.`
    for (const map of [this.issueMap.value, this.ruleIssues.value, this.serverMap.value])
      for (const key of map.keys()) if (!path || key === path || key.startsWith(prefix)) return true
    return false
  }

  /** The errors to show at `path`: the schema's and the rules' once visible, the server's always. */
  shownAt(path: string): readonly RawIssue[] {
    this.activate()
    const visible = this.isVisible(path)
    return joinIssues(
      visible ? this.issueMap.value.get(path) : undefined,
      visible ? this.ruleIssues.value.get(path) : undefined,
      this.serverMap.value.get(path),
    )
  }

  /** Issues to show, resolved, in order. `path` limits them to one path. */
  // Submitted from code, with no <form> to search: the first invalid input on the page, by its id
  // or, where a component library gives it its own id, by the error id it is described by.
  private focusFirstInvalid(): void {
    if (typeof document === 'undefined') return
    let first: HTMLElement | null = null
    for (const { path } of this.shownErrors()) {
      if (!path) continue
      const id = `${this.id}-${path.replaceAll('.', '-')}`
      const el =
        document.getElementById(id) ??
        document.querySelector<HTMLElement>(`[aria-describedby~="${CSS.escape(`${id}-error`)}"]`)
      if (el && (!first || el.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING))
        first = el
    }
    first?.focus()
  }

  shownErrors(path?: string): FormError[] {
    this.activate()
    const out: FormError[] = []
    const take = (map: IssueMap, gated: boolean) => {
      for (const [key, list] of map) {
        if (path !== undefined && key !== path) continue
        if (gated && !this.isVisible(key)) continue
        for (const issue of list) out.push({ path: key, message: this.resolve(issue) })
      }
    }
    take(this.issueMap.value, true)
    take(this.ruleIssues.value, true)
    take(this.serverMap.value, false)
    return out
  }

  allErrors(): FormError[] {
    this.activate()
    const out: FormError[] = []
    for (const map of [this.issueMap.value, this.ruleIssues.value, this.serverMap.value])
      for (const list of map.values())
        for (const issue of list) out.push({ path: issue.path, message: this.resolve(issue) })
    return out
  }

  get valid(): boolean {
    return !this.hasIssuesUnder('')
  }

  /** An async schema or a rule is still running. */
  get pending(): boolean {
    return this.pendingRef.value > 0 || this.ruleBusy.value.size > 0
  }

  /** Whether a rule for `path`, or under it, is waiting or running. */
  pendingAt(path: string): boolean {
    for (const key of this.ruleBusy.value) {
      const at = key.slice(key.indexOf('|') + 1)
      if (!path || at === path || at.startsWith(`${path}.`)) return true
    }
    return false
  }

  private loadRules(): Promise<RuleEngine> {
    return (this.loading ??= import('./rules').then(({ RuleEngine }) => {
      return (this.engine = new RuleEngine(
        this.options.rules as never,
        this.options.debounce ?? 0,
        { values: () => this.latest, defaults: () => this.initial.value },
        this.ruleIssues,
        this.ruleBusy,
      ))
    }))
  }

  setErrors = (input: unknown): void => {
    const list: RawIssue[] = []
    if (Array.isArray(input)) {
      for (const item of input as { path?: string; message: string }[])
        list.push({ path: item.path ?? '', message: item.message })
    } else
      for (const [path, value] of Object.entries(
        input as Record<string, string | string[] | undefined>,
      ))
        for (const message of value === undefined ? [] : Array.isArray(value) ? value : [value])
          list.push({ path, message })
    this.serverMap.value = groupIssues(
      [...this.flatten(this.serverMap.value), ...list],
      this.serverMap.value,
    )
  }

  clearErrors = (): void => {
    if (this.serverMap.value.size) this.serverMap.value = EMPTY_ISSUES
  }

  private flatten(map: IssueMap): RawIssue[] {
    return [...map.values()].flat()
  }

  private dropServer(path: string): void {
    const map = this.serverMap.value
    if (!map.size) return
    const prefix = `${path}.`
    let next: Map<string, readonly RawIssue[]> | undefined
    for (const key of map.keys())
      if (key === path || key.startsWith(prefix)) (next ??= new Map(map)).delete(key)
    if (next) this.serverMap.value = next
  }

  // ---- validation

  /** Starts keeping the issues current. Reading issues is what asks for them. */
  activate(): void {
    if (this.active) return
    this.active = true
    queueMicrotask(() => {
      if (this.issueMap.value === EMPTY_ISSUES) void this.run()
    })
  }

  /** Validates the current values. Only the newest run writes the issues. */
  run(): Promise<Outcome> | Outcome {
    const id = ++this.run_
    const snapshotOfValues = this.latest
    const done = (result: StandardSchemaV1.Result<unknown>): Outcome => {
      const vendor = this.schema['~standard'].vendor
      const issues: RawIssue[] = (result.issues ?? []).map((issue) => ({
        path: issuePath(issue),
        message: issue.message,
        source: issue,
        // A rule's own schema (in `validate`) says which library raised it.
        vendor: (issue as { vendor?: string }).vendor ?? vendor,
      }))
      if (id === this.run_) {
        this.issueMap.value = groupIssues(issues, this.issueMap.value)
        if (this.hasRules)
          void this.loadRules().then((engine) => id === this.run_ && engine.sync(issues))
      }
      return result.issues ? { valid: false, issues } : { valid: true, value: result.value, issues }
    }
    const result = this.schema['~standard'].validate(withGroups(this.shapeAt([]), snapshotOfValues))
    if (!isPromise(result)) return done(result)
    this.pendingRef.value++
    return Promise.resolve(result).then(
      (r) => {
        this.pendingRef.value--
        return done(r as StandardSchemaV1.Result<unknown>)
      },
      (error) => {
        this.pendingRef.value--
        throw error
      },
    )
  }

  validate = async (path?: string): Promise<boolean> => {
    this.active = true
    this.include(path)
    const outcome = await this.run()
    if (this.hasRules) await (await this.loadRules()).settle(path)
    this.reveal(path ?? '')
    const prefix = `${path}.`
    const under = (at: string) => path === undefined || at === path || at.startsWith(prefix)
    return (
      !outcome.issues.some((issue) => under(issue.path)) &&
      ![...this.ruleIssues.value.keys()].some(under)
    )
  }

  /** `handleSubmit(event)` submits now; `handleSubmit(fn)` returns the handler for `@submit`. */
  handleSubmit = (arg?: Event | SubmitHandler): any =>
    typeof arg === 'function'
      ? (event?: Event) => this.submit(event, arg)
      : this.submit(arg, this.options.onSubmit as SubmitHandler | undefined)

  private submit = async (event: Event | undefined, onSubmit?: SubmitHandler): Promise<boolean> => {
    event?.preventDefault?.()
    if (this.submittingRef.value) return false
    const target = event?.currentTarget as ParentNode | null | undefined
    const host = typeof target?.querySelector === 'function' ? target : undefined
    const context: SubmitContext<StandardSchemaV1> = {
      form: this.owner as never,
      event,
      element: (host as HTMLFormElement | undefined) ?? null,
      submitter: (event as SubmitEvent | undefined)?.submitter ?? null,
    }
    this.submittingRef.value = true
    try {
      this.submitCountRef.value++
      this.include()
      this.clearErrors()
      this.active = true
      const outcome = await this.run()
      if (this.hasRules) await (await this.loadRules()).settle()
      if (!outcome.valid || this.ruleIssues.value.size) {
        await nextTick()
        if (host) host.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
        else this.focusFirstInvalid()
        await this.options.onInvalid?.(this.shownErrors(), context)
        return false
      }
      await onSubmit?.(outcome.value, {
        ...context,
        get formData() {
          return toFormData(outcome.value, context.submitter)
        },
      })
      return true
    } finally {
      this.submittingRef.value = false
    }
  }

  reset = (values?: unknown): void => {
    if (values !== undefined) this.initial.value = snapshot(values)
    this.resets++
    this.seenEdits = this.userEdits
    this.commit(this.initial.value)
    this.touchedSet.value = EMPTY_SET
    this.revealedSet.value = EMPTY_SET
    this.editedSet.value = EMPTY_SET
    this.freshSet.value = EMPTY_SET
    this.submitCountRef.value = 0
    this.clearErrors()
    this.engine?.clear()
  }

  // ---- fields

  field(path: string): FieldImpl {
    let field = this.fields.get(path)
    if (!field) this.fields.set(path, (field = new FieldImpl(this, path)))
    return field
  }

  node(path: string): unknown {
    let node = this.nodes.get(path)
    if (!node) this.nodes.set(path, (node = createNode(this, path)))
    return node
  }
}
