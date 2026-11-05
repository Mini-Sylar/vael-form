import type { ShallowRef } from 'vue'
import { groupIssues, messagesOf } from './issues'
import { isSchema, schemaRule } from './schema-rule'
import type { IssueMap, Message, RawIssue } from './issues'
import { expand, getIn, isEqual, toSegments } from './path'
import type { RuleContext, RuleInput, RuleResult } from './types'

type Run = (value: unknown, context: RuleContext<unknown>) => RuleResult | Promise<RuleResult>

interface Rule {
  segments: string[]
  run: Run
  on: 'change' | 'blur'
  debounce: number
}

type Status = 'idle' | 'scheduled' | 'running' | 'done' | 'failed'

/** One rule on one path (`members.*.email` is a state for each member). */
interface State {
  key: string
  rule: Rule
  path: string
  value: unknown
  status: Status
  /** The schema has an error here, or the value is the default one: nothing to check. */
  blocked: boolean
  messages: Message[]
  timer?: ReturnType<typeof setTimeout>
  abort?: AbortController
  /** Bumped when a run is superseded, so its answer is ignored. */
  run: number
  promise?: Promise<void>
  error?: unknown
}

/** What the engine needs from the form. */
export interface RuleHost {
  values: () => unknown
  defaults: () => unknown
}

const NONE = Symbol('none')

/**
 * The checks a schema shouldn't hold (an API call, the app's state). After each schema run it
 * decides, per path, whether a rule has to run, waits `debounce`, and keeps only the newest answer.
 */
export class RuleEngine {
  private readonly rules: Rule[]
  private readonly host: RuleHost
  private readonly states = new Map<string, State>()

  constructor(
    rules: Record<string, RuleInput<never, never>> | undefined,
    debounce: number,
    host: RuleHost,
    /** The rules' errors by path, and where a rule is waiting or running: the form owns them. */
    private readonly issues: ShallowRef<IssueMap>,
    private readonly busy: ShallowRef<ReadonlySet<string>>,
  ) {
    this.host = host
    this.rules = Object.entries(rules ?? {}).map(([key, input]) => {
      const long = typeof input === 'function' || isSchema(input) ? { run: input } : input
      return {
        segments: key.split('.'),
        run: (isSchema(long.run) ? schemaRule(long.run) : long.run) as unknown as Run,
        on: long.on ?? 'change',
        debounce: long.debounce ?? debounce,
      }
    })
  }

  get any(): boolean {
    return this.rules.length > 0
  }

  /** Whether a rule for `path`, or under it, is waiting or running. */
  pendingAt(path: string): boolean {
    for (const key of this.busy.value) {
      const at = key.slice(key.indexOf('|') + 1)
      if (path === '' || at === path || at.startsWith(`${path}.`)) return true
    }
    return false
  }

  /** After a schema run: starts the rules whose value changed and whose path has no error. */
  sync(schemaIssues: readonly RawIssue[]): void {
    const values = this.host.values()
    const defaults = this.host.defaults()
    const seen = new Set<string>()
    this.rules.forEach((rule, index) => {
      for (const path of expand(values, rule.segments)) {
        const key = `${index}|${path}`
        seen.add(key)
        let state = this.states.get(key)
        if (!state)
          this.states.set(
            key,
            (state = {
              key,
              rule,
              path,
              value: NONE,
              status: 'idle',
              blocked: false,
              messages: [],
              run: 0,
            }),
          )
        const segments = toSegments(path)
        const value = getIn(values, segments)
        const blocked =
          schemaIssues.some((issue) => issue.path === path || issue.path.startsWith(`${path}.`)) ||
          isEqual(value, getIn(defaults, segments))
        if (blocked) {
          if (!state.blocked || state.status !== 'idle' || state.messages.length) this.cancel(state)
          state.blocked = true
          state.value = value
          continue
        }
        state.blocked = false
        if (state.status !== 'idle' && isEqual(state.value, value)) continue
        this.cancel(state)
        state.value = value
        // a blur rule waits for the blur (or the submit)
        if (rule.on === 'blur') continue
        this.start(state, false)
      }
    })
    for (const [key, state] of this.states)
      if (!seen.has(key)) {
        this.cancel(state)
        this.states.delete(key)
      }
    this.publish()
  }

  /** A field was left: its `blur` rules run now. */
  blur(path: string): void {
    for (const state of this.states.values())
      if (
        state.path === path &&
        state.rule.on === 'blur' &&
        state.status === 'idle' &&
        !state.blocked
      )
        this.start(state, true)
  }

  /** Runs every rule under `path` (or all) now, waits for them, and throws what one threw. */
  async settle(path?: string): Promise<void> {
    const under = (at: string) => !path || at === path || at.startsWith(`${path}.`)
    const jobs: Promise<void>[] = []
    for (const state of this.states.values()) {
      if (!under(state.path) || state.blocked) continue
      if (state.status === 'scheduled') jobs.push(this.exec(state))
      else if (state.status === 'running') jobs.push(state.promise!)
      else if (state.status === 'idle' || state.status === 'failed') {
        this.setBusy(state, true)
        jobs.push(this.exec(state))
      }
    }
    await Promise.all(jobs)
    for (const state of this.states.values())
      if (under(state.path) && state.error !== undefined) throw state.error
  }

  /** Forgets every answer: the values were replaced. */
  clear(): void {
    for (const state of this.states.values()) this.cancel(state)
    this.states.clear()
    this.publish()
  }

  private start(state: State, immediate: boolean): void {
    this.setBusy(state, true)
    state.status = 'scheduled'
    if (immediate || !state.rule.debounce) void this.exec(state)
    else state.timer = setTimeout(() => void this.exec(state), state.rule.debounce)
  }

  private exec(state: State): Promise<void> {
    clearTimeout(state.timer)
    state.timer = undefined
    state.status = 'running'
    const run = ++state.run
    const abort = (state.abort = new AbortController())
    const { value, path } = state
    return (state.promise = Promise.resolve()
      .then(() =>
        state.rule.run(value, {
          values: this.host.values() as never,
          path,
          signal: abort.signal,
        }),
      )
      .then(
        (result) => {
          if (run !== state.run) return
          state.messages = messagesOf(result)
          state.status = 'done'
          this.setBusy(state, false)
          this.publish()
        },
        (error: unknown) => {
          if (run !== state.run) return
          state.error = error ?? new Error('A rule failed')
          state.status = 'failed'
          this.setBusy(state, false)
        },
      ))
  }

  private cancel(state: State): void {
    clearTimeout(state.timer)
    state.timer = undefined
    state.abort?.abort()
    state.abort = undefined
    state.run++
    state.status = 'idle'
    state.promise = undefined
    state.error = undefined
    state.messages = []
    this.setBusy(state, false)
  }

  private setBusy(state: State, on: boolean): void {
    const set = this.busy.value
    if (set.has(state.key) === on) return
    const next = new Set(set)
    if (on) next.add(state.key)
    else next.delete(state.key)
    this.busy.value = next
  }

  private publish(): void {
    const issues: RawIssue[] = []
    for (const state of this.states.values())
      for (const message of state.messages)
        issues.push(
          typeof message === 'string'
            ? { path: state.path, message }
            : { path: state.path, ...message },
        )
    this.issues.value = groupIssues(issues, this.issues.value)
  }
}
