import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { shallowRef } from 'vue'
import { z } from 'zod'
import { formPlugin, msg } from '../src'
import type { FormI18n } from '../src'
import { $, blur, flush, text, type } from './utils/dom'
import { mount } from './utils/mount'
import type { Mounted } from './utils/mount'
import Signup from './fixtures/Signup.vue'

beforeAll(() => import('../src/standard'))

const messages = {
  en: {
    errors: {
      email: 'Invalid email',
      min: 'At least {min} characters',
      required: '{field} is required',
    },
    labels: { password: 'Password' },
  },
  fr: {
    errors: {
      email: 'Courriel invalide',
      min: 'Au moins {min} caractères',
      required: '{field} est requis',
    },
    labels: { password: 'Mot de passe' },
  },
}

const schema = z.object({
  email: z.email(msg('errors.email')),
  password: z.string().min(8, msg('errors.min', { min: 8 }, 'At least {min}')),
})

/** A catalog and a locale, nothing more: the smallest thing that fits `FormI18n`. */
function dictionary(locale = shallowRef<'en' | 'fr'>('en')) {
  const i18n: FormI18n & { locale: typeof locale } = {
    locale,
    t(key, params = {}) {
      const text = key
        .split('.')
        .reduce<unknown>((o, k) => (o as never)?.[k], messages[locale.value])
      return typeof text === 'string'
        ? text.replace(/\{(\w+)\}/g, (_, n) => String(params[n]))
        : key
    },
  }
  return i18n
}

let mounted: Mounted | undefined
afterEach(() => mounted?.unmount())
const input = (name: string) => $<HTMLInputElement>(mounted!.host, name)!
const shown = (name: string) => text(mounted!.host, name)

describe('i18n', () => {
  it('translates message keys with the i18n the app provided, no t on the form', async () => {
    const i18n = dictionary()
    mounted = mount(Signup, { schema }, (app) => app.use(formPlugin, { i18n }))
    await type(input('email'), 'nope')
    await blur(input('email'))
    await type(input('password'), 'short')
    await blur(input('password'))
    expect(shown('email-error')).toBe('Invalid email')
    expect(shown('password-error')).toBe('At least 8 characters')
  })

  it('shows a new locale at once, without validating again', async () => {
    const i18n = dictionary()
    mounted = mount(Signup, { schema }, (app) => app.use(formPlugin, { i18n }))
    await type(input('email'), 'nope')
    await blur(input('email'))
    expect(shown('email-error')).toBe('Invalid email')

    i18n.locale.value = 'fr'
    await flush()
    expect(shown('email-error')).toBe('Courriel invalide')
  })

  it('lets one form use its own i18n over the app one', async () => {
    mounted = mount(Signup, { schema, i18n: dictionary(shallowRef('fr')) }, (app) =>
      app.use(formPlugin, { i18n: dictionary() }),
    )
    await type(input('email'), 'nope')
    await blur(input('email'))
    expect(shown('email-error')).toBe('Courriel invalide')
  })

  it('fills {field} from the label, which is itself translated', async () => {
    const required = z.object({
      email: z.string().min(1, msg('errors.required')),
      password: z.string().min(1, msg('errors.required')),
    })
    mounted = mount(
      Signup,
      {
        schema: required,
        labels: { password: 'labels.password' },
        defaultValues: { email: '', password: '' },
        showErrors: 'blur',
      },
      (app) => app.use(formPlugin, { i18n: dictionary() }),
    )
    await blur(input('password'))
    expect(shown('password-error')).toBe('Password is required')
    await blur(input('email'))
    expect(shown('email-error')).toBe('Email is required')
  })

  it('uses the fallback, then the key, when nothing translates', async () => {
    mounted = mount(Signup, { schema })
    await type(input('email'), 'nope')
    await blur(input('email'))
    await type(input('password'), 'short')
    await blur(input('password'))
    expect(shown('email-error')).toBe('errors.email')
    expect(shown('password-error')).toBe('At least 8')
  })

  it('works with vue-i18n as it is', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages })
    mounted = mount(Signup, { schema }, (app) => {
      app.use(i18n)
      app.use(formPlugin, { i18n: i18n.global })
    })
    await type(input('password'), 'short')
    await blur(input('password'))
    expect(shown('password-error')).toBe('At least 8 characters')

    i18n.global.locale.value = 'fr'
    await flush()
    expect(shown('password-error')).toBe('Au moins 8 caractères')
  })

  it('leaves plain schema messages as the schema wrote them', async () => {
    const plain = z.object({ email: z.email('Please check your email'), password: z.string() })
    mounted = mount(Signup, { schema: plain }, (app) => app.use(formPlugin, { i18n: dictionary() }))
    await type(input('email'), 'nope')
    await blur(input('email'))
    expect(shown('email-error')).toBe('Please check your email')
  })
})
