import { createApp, effectScope, isReactive, nextTick, watchEffect } from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { z } from 'zod'
import { formPlugin } from './config'
import { useForm } from './use-form'
import { en } from '../tests/utils/catalog'

const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 5))
}

beforeAll(() => import('./standard'))

const schema = z.object({ email: z.email() })
const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
afterEach(() => warnings.mockClear())

function makeStore(id = 'signup', formId?: string) {
  return defineStore(id, () => {
    const form = useForm({ schema, defaultValues: { email: '' }, showErrors: 'input', id: formId })
    return { form }
  })
}

describe('a form in a Pinia store', () => {
  function setup() {
    const app = createApp({})
    const pinia = createPinia()
    app.use(pinia)
    setActivePinia(pinia)
    return { app }
  }

  it('keeps its reactivity for whoever reads it', async () => {
    const { app } = setup()
    const store = app.runWithContext(() => makeStore()())
    const seen: unknown[] = []
    effectScope().run(() =>
      watchEffect(() =>
        seen.push([store.form.field('email').value, store.form.field('email').error]),
      ),
    )
    await flush()
    store.form.field('email').value = 'nope'
    await flush()
    expect(seen.at(-1)).toEqual(['nope', 'Invalid email address'])
  })

  it('makes no Vue warnings and gives usable ids', async () => {
    const { app } = setup()
    const first = app.runWithContext(() => makeStore('a')())
    const second = app.runWithContext(() => makeStore('b')())
    expect(warnings).not.toHaveBeenCalled()
    expect(first.form.field('email').id).not.toBe(second.form.field('email').id)
    expect(first.form.field('email').id).toMatch(/^vael-form-\d+-email$/)
  })

  it('takes a stable id, for a server render and the browser to agree on', () => {
    const { app } = setup()
    const store = app.runWithContext(() => makeStore('c', 'signup')())
    expect(store.form.field('email').id).toBe('signup-email')
  })

  it('stays out of Vue’s reactive wrapping, so the values can’t be changed by accident', () => {
    const { app } = setup()
    const store = app.runWithContext(() => makeStore('d')())
    expect(isReactive(store.form.values.value)).toBe(false)
    expect(isReactive(store.form.field('email'))).toBe(false)
  })

  it('reads the app’s i18n, because a store is set up inside the app', async () => {
    const app = createApp({})
    const pinia = createPinia()
    app.use(pinia)
    setActivePinia(pinia)
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    app.use(formPlugin, { i18n: i18n.global as never })
    const store = app.runWithContext(() => makeStore('e')())
    void store.form.field('email').error
    await flush()
    store.form.field('email').value = 'nope'
    await flush()
    expect(store.form.field('email').error).toBe('Enter a valid email address')
  })
})

describe('a form outside a component', () => {
  it('works in a module, with no app and no scope', async () => {
    const form = useForm({ schema, defaultValues: { email: 'a@b.co' }, showErrors: 'input' })
    expect(warnings).not.toHaveBeenCalled()
    const seen: unknown[] = []
    effectScope().run(() => watchEffect(() => seen.push(form.dirty.value)))
    form.field('email').value = 'c@d.co'
    await flush()
    expect(seen).toEqual([false, true])
  })

  it('is one object that any part of the app can hold', async () => {
    const form = useForm({ schema, defaultValues: { email: '' }, showErrors: 'input' })
    const aSees: unknown[] = []
    const bSees: unknown[] = []
    effectScope().run(() => watchEffect(() => aSees.push(form.field('email').value)))
    effectScope().run(() => watchEffect(() => bSees.push(form.values.value.email)))
    form.field('email').value = 'x'
    await flush()
    expect(aSees.at(-1)).toBe('x')
    expect(bSees.at(-1)).toBe('x')
  })
})
