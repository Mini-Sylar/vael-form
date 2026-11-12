import type { MessageParams } from './types'

export interface Described {
  keys: string[]
  params: MessageParams
}

type Loose = Record<string, unknown>

/** Values a message can show: no bigint, Date or list. */
function plain(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(String).join(', ')
  return value
}

function pick(from: Loose, names: readonly string[]): MessageParams {
  const out: MessageParams = {}
  for (const name of names) if (from[name] !== undefined) out[name] = plain(from[name])
  return out
}

// Rules that come in kinds (a string too small, a number too small) are a group with a `default`.
const GROUPED = new Set(['invalid_type', 'too_small', 'too_big', 'invalid_format'])

const camel = (name: string): string =>
  name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())

/**
 * Most specific key first: `required`, then `tooSmall.string`, then `tooSmall.default`. A rule
 * without kinds is one key (`invalidUnion`). Nested, as in a JSON catalog, so a key is never both
 * a message and a group.
 */
function keysFor(prefix: string, code: string, detail?: string, required?: boolean): string[] {
  const name = camel(code)
  const keys: string[] = []
  if (required) keys.push(`${prefix}.required`)
  if (detail && /^\w+$/.test(detail)) keys.push(`${prefix}.${name}.${camel(detail)}`)
  keys.push(GROUPED.has(code) ? `${prefix}.${name}.default` : `${prefix}.${name}`)
  return keys
}

/** A size rule reads the same in every library: `too_small.string` with `minimum`. */
function size(
  prefix: string,
  small: boolean,
  origin: string,
  limit: unknown,
  extra: MessageParams = {},
): Described {
  const value = plain(limit)
  const params: MessageParams = { ...extra, origin, [small ? 'minimum' : 'maximum']: value }
  if (typeof value === 'number') params.count = value
  // An empty string or list is what "required" means to the person filling the form.
  const required = small && (origin === 'string' || origin === 'array') && Number(value) === 1
  return { keys: keysFor(prefix, small ? 'too_small' : 'too_big', origin, required), params }
}

function originOf(input: unknown): string {
  if (typeof input === 'string') return 'string'
  if (Array.isArray(input)) return 'array'
  if (input instanceof Set) return 'set'
  if (input instanceof Map) return 'map'
  if (input instanceof Date) return 'date'
  if (typeof input === 'bigint') return 'bigint'
  return 'number'
}

// ---- Zod

// What Zod says on its own (Zod 4, Zod Mini's `Invalid input`, Zod 3); a message the schema's author
// wrote is left alone.
const ZOD_DEFAULT =
  /^(Invalid |Too (small|big): |Unrecognized |Input not |Required$|Expected |(String|Number|Array|Set|Date|BigInt) must )/

// Zod 3 names some codes differently.
const ZOD3_CODES: Record<string, string> = {
  invalid_string: 'invalid_format',
  invalid_enum_value: 'invalid_value',
  invalid_literal: 'invalid_value',
}
const ZOD3_FORMATS: Record<string, string> = {
  startsWith: 'starts_with',
  endsWith: 'ends_with',
  includes: 'includes',
}

const ZOD_PARAMS = [
  'origin',
  'minimum',
  'maximum',
  'inclusive',
  'format',
  'expected',
  'divisor',
  'prefix',
  'suffix',
  'includes',
  'values',
  'keys',
] as const

/** A choice not made yet: nothing picked, or a cleared select. */
const unchosen = (value: unknown): boolean => value === undefined || value === null || value === ''

/** An empty text input where something else is expected is a value not given yet. */
const unfilled = (value: unknown, expected: string): boolean =>
  value === '' && expected !== 'string'

function zod(issue: Loose, prefix: string, value: unknown): Described | undefined {
  const message = String(issue.message)
  if (!ZOD_DEFAULT.test(message)) return undefined
  const code = ZOD3_CODES[String(issue.code)] ?? String(issue.code)
  const params = pick(issue, ZOD_PARAMS)
  // Zod 3 says `type` where Zod 4 says `origin`, and `validation` where it says `format`.
  const origin = String(issue.origin ?? issue.type)
  const validation = issue.validation
  if (issue.options) params.values = plain(issue.options)
  if (issue.multipleOf !== undefined) params.divisor = issue.multipleOf
  if (code === 'invalid_type') {
    // The value itself says what is missing; a message can't (Zod Mini's is just "Invalid input").
    const missing =
      value === undefined ||
      value === null ||
      issue.received === 'undefined' ||
      unfilled(value, String(issue.expected))
    return { keys: keysFor(prefix, code, String(issue.expected), missing), params }
  }
  if (code === 'too_small' || code === 'too_big')
    return size(
      prefix,
      code === 'too_small',
      origin,
      issue[code === 'too_small' ? 'minimum' : 'maximum'],
      params,
    )
  if (code === 'invalid_value')
    return { keys: keysFor(prefix, code, undefined, unchosen(value)), params }
  let format: string | undefined
  if (code === 'invalid_format') {
    if (typeof validation === 'object' && validation) {
      const [name] = Object.keys(validation)
      format = ZOD3_FORMATS[name!] ?? name
      params.format = format
      Object.assign(params, validation)
    } else format = String(validation ?? issue.format)
  }
  return { keys: keysFor(prefix, code, format), params }
}

// ---- Valibot

const VALIBOT_DEFAULT = /^Invalid [^:]+: /
const VALIBOT_VALUES = new Set(['picklist', 'literal', 'enum', 'variant'])
const VALIBOT_CUSTOM = new Set(['check', 'raw_check', 'partial_check', 'forward_check', 'custom'])

function valibot(issue: Loose, prefix: string): Described | undefined {
  if (!VALIBOT_DEFAULT.test(String(issue.message))) return undefined
  const type = String(issue.type)
  const requirement = plain(issue.requirement)
  const params: MessageParams = {
    expected: issue.expected,
    received: issue.received,
    requirement,
  }
  if (VALIBOT_CUSTOM.has(type)) return { keys: keysFor(prefix, 'custom'), params }
  if (issue.kind === 'schema') {
    if (VALIBOT_VALUES.has(type))
      return { keys: keysFor(prefix, 'invalid_value', undefined, unchosen(issue.input)), params }
    const missing = issue.input === undefined || issue.input === null || unfilled(issue.input, type)
    return {
      keys: keysFor(prefix, 'invalid_type', type, missing),
      params: { ...params, expected: type },
    }
  }
  if (type === 'non_empty') return size(prefix, true, originOf(issue.input), 1, params)
  if (/^(min|max)_/.test(type))
    return size(prefix, type.startsWith('min_'), originOf(issue.input), requirement, params)
  if (type === 'multiple_of')
    return { keys: keysFor(prefix, 'not_multiple_of'), params: { ...params, divisor: requirement } }
  if (typeof requirement !== 'number')
    return { keys: keysFor(prefix, 'invalid_format', type), params: { ...params, format: type } }
  return { keys: keysFor(prefix, type), params }
}

// ---- ArkType

/** `a number` is `number`, `a Date` is `date`. */
function arkKind(expected: string): string {
  return expected.replace(/^an? /, '').toLowerCase()
}

/** The name of a string format, from how ArkType describes it. */
function arkFormat(expected: string): string {
  const text = expected.toLowerCase()
  for (const name of ['email', 'url', 'uuid']) if (text.includes(name)) return name
  return 'regex'
}

function arktype(issue: Loose, prefix: string): Described | undefined {
  const { propString, problem, message, code, rule, data } = issue as {
    propString: string
    problem: string
    message: string
    code: string
    rule: unknown
    data: unknown
  }
  const expected = String(issue.expected)
  // ArkType says `<property> <problem>` (a union's problem has the property in it); anything else was written by the schema's author.
  if (message !== problem && message !== `${propString} ${problem}`) return undefined
  switch (code) {
    case 'required':
      return { keys: keysFor(prefix, 'invalid_type', undefined, true), params: {} }
    case 'domain':
    case 'proto': {
      const kind = arkKind(expected)
      return {
        keys: keysFor(prefix, 'invalid_type', kind, data === undefined || unfilled(data, kind)),
        params: { expected: kind },
      }
    }
    case 'minLength':
    case 'min':
    case 'after':
      return size(prefix, true, originOf(data), rule)
    case 'maxLength':
    case 'max':
    case 'before':
      return size(prefix, false, originOf(data), rule)
    case 'divisor':
      return { keys: keysFor(prefix, 'not_multiple_of'), params: { divisor: plain(rule) } }
    case 'pattern': {
      const format = arkFormat(expected)
      return { keys: keysFor(prefix, 'invalid_format', format), params: { format } }
    }
    case 'unit':
      return { keys: keysFor(prefix, 'invalid_value', undefined, unchosen(data)), params: {} }
    case 'union': {
      // A choice between fixed values is an enum, as it is in the other libraries.
      const branches = ((issue as { errors?: unknown }).errors ?? []) as { code?: string }[]
      const fixed = branches.length > 0 && branches.every((branch) => branch.code === 'unit')
      return {
        keys: keysFor(
          prefix,
          fixed ? 'invalid_value' : 'invalid_union',
          undefined,
          fixed && unchosen(data),
        ),
        params: {},
      }
    }
    case 'predicate':
      return { keys: keysFor(prefix, 'custom'), params: {} }
    default:
      return { keys: keysFor(prefix, code), params: {} }
  }
}

const READERS: Record<
  string,
  (issue: Loose, prefix: string, value: unknown) => Described | undefined
> = {
  zod,
  valibot,
  arktype,
}

/**
 * The catalog keys for an issue a schema library raised on its own, most specific first, and the
 * values for the message. `undefined` for a library we don't know, or for a message the schema's
 * author wrote: that text is shown as written.
 */
export function describeIssue(
  vendor: string | undefined,
  issue: object,
  prefix: string,
  value: unknown,
): Described | undefined {
  const read = vendor ? READERS[vendor] : undefined
  return read?.(issue as Loose, prefix, value)
}
