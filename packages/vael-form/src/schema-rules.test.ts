import { effectScope, nextTick } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import * as v from 'valibot'
import { z } from 'zod'
import { useForm } from './use-form'
import { en } from '../tests/utils/catalog'

beforeAll(() => Promise.all([import('./rules'), import('./validator'), import('./standard')]))

const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 10))
}

describe('a schema as a rule', () => {
  it('checks one field in `validate`, alone or with functions, and the first to fail wins', async () => {
    const form = effectScope().run(() =>
      useForm({
        defaultValues: { email: 'nope', age: 5 },
        validate: {
          email: z.email('Not an email'),
          age: [
            (v: number) => v > 0 || 'Positive',
            v.pipe(v.number(), v.minValue(18, 'Adults only')),
          ],
        },
        showErrors: 'input',
      }),
    )!
    void form.valid.value
    await flush()
    form.field('email').touch()
    form.field('age').touch()
    expect(form.errors.email).toBe('Not an email')
    expect(form.errors.age).toBe('Adults only')
    form.model.email.value = 'me@example.com'
    form.model.age.value = 30
    await flush()
    expect(form.errors.email).toBeUndefined()
    expect(form.valid.value).toBe(true)
  })

  it('works as a `rules` entry beside the form’s schema, after the schema passes', async () => {
    const form = effectScope().run(() =>
      useForm({
        schema: z.object({ code: z.string().min(1) }),
        defaultValues: { code: '' },
        rules: { code: z.string().regex(/^[A-Z]{3}$/, 'Three capitals') },
        showErrors: 'input',
      }),
    )!
    void form.valid.value
    await flush()
    form.model.code.value = 'ab'
    form.field('code').touch()
    await flush()
    expect(form.errors.code).toBe('Three capitals')
    form.model.code.value = 'ABC'
    await flush()
    expect(form.errors.code).toBeUndefined()
  })

  it('is translated by the app’s catalog like any schema error', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } as never })
    const form = effectScope().run(() =>
      useForm({
        defaultValues: { email: 'nope' },
        validate: { email: z.email() },
        showErrors: 'input',
        i18n: i18n.global as never,
      }),
    )!
    void form.valid.value
    await flush()
    form.field('email').touch()
    await flush()
    expect(form.errors.email).toBe('Enter a valid email address')
  })
})
