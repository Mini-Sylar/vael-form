import { MESSAGE_TAG } from './constants'
import type { FormI18n, MessageKey, MessageParams } from './types'

interface Tagged {
  keys: string[]
  params?: MessageParams
  fallback?: string
}

/**
 * A schema message that is an i18n key, with its values:
 * `z.string().min(3, msg('errors.min', { min: 3 }, 'At least {min} characters'))`.
 * It is still a string, so any Standard Schema library takes it. The form translates it when the
 * error is read, so a new locale shows at once. A list of keys is tried in order: the first the
 * app's catalog has wins.
 */
export function msg(
  key: MessageKey | readonly MessageKey[],
  params?: MessageParams,
  fallback?: string,
): string {
  const keys = typeof key === 'string' ? key : key.join(KEY_SEPARATOR)
  if (!params && fallback === undefined) return MESSAGE_TAG + keys
  return `${MESSAGE_TAG}${keys} ${JSON.stringify({ p: params, d: fallback })}`
}

export function parseMessage(message: string): Tagged | undefined {
  if (!message.startsWith(MESSAGE_TAG)) return undefined
  const rest = message.slice(MESSAGE_TAG.length)
  const space = rest.indexOf(' ')
  const keys = (space === -1 ? rest : rest.slice(0, space)).split(KEY_SEPARATOR)
  if (space === -1) return { keys }
  try {
    const { p, d } = JSON.parse(rest.slice(space + 1)) as { p?: MessageParams; d?: string }
    return { keys, params: p, fallback: d }
  } catch {
    return { keys }
  }
}

const KEY_SEPARATOR = '|'

const PLACEHOLDER = /\{(\w+)\}/g

export function interpolate(text: string, params: MessageParams): string {
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  )
}

// vue-i18n reads this and skips its missing-key warning; a missing key just means the fallback.
const QUIET = { missingWarn: false, fallbackWarn: false }

/** The first of `keys` the app's catalog has, or `undefined` when it has none. */
export function translate(
  i18n: FormI18n | undefined,
  keys: readonly string[],
  params: MessageParams,
): string | undefined {
  if (!i18n) return undefined
  // A `count` picks the plural form ("1 character | {count} characters") in libraries that have them.
  const options = typeof params.count === 'number' ? { ...QUIET, plural: params.count } : QUIET
  for (const key of keys) {
    const text = i18n.t(key, params, options)
    if (text !== key) return interpolate(text, params)
  }
  return undefined
}

/** `firstName` and `first_name` are both "First name": the label when the form has none. */
export function humanize(name: string): string {
  const words = name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
