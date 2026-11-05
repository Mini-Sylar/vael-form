import type { InjectionKey, MaybeRefOrGetter } from 'vue'
import type { FormConfig, FormContext } from './types'

// `Symbol.for`, so two copies of the package (or another package providing the config) still meet.
export const CONFIG_KEY: InjectionKey<MaybeRefOrGetter<FormConfig>> = Symbol.for('vael-form:config')
export const FORM_KEY: InjectionKey<FormContext> = Symbol.for('vael-form:form')

/** Where the form's messages sit in the app's catalog unless it says otherwise: `formKit.tooSmall.string`. */
export const DEFAULT_PREFIX = 'formKit'

/** Marks a schema message as an i18n key (see `msg`). */
export const MESSAGE_TAG = '$t:'

/** What a Field object answers to; every other key on a group is a child field. */
export const FIELD_KEY_LIST = [
  'path',
  'id',
  'errorId',
  'value',
  'error',
  'errors',
  'allErrors',
  'touched',
  'dirty',
  'valid',
  'pending',
  'attrs',
  'validate',
  'touch',
  'untouch',
  'watch',
  'reset',
  'items',
  'push',
  'insert',
  'remove',
  'move',
  'swap',
  'replace',
  'clear',
] as const

export const FIELD_KEYS: ReadonlySet<string> = new Set(FIELD_KEY_LIST)
