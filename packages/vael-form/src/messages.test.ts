import { createApp, effectScope, nextTick } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { type } from 'arktype'
import * as v from 'valibot'
import * as zm from 'zod/mini'
import * as z3 from 'zod/v3'
import { z } from 'zod'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { formPlugin } from './config'
import { useForm } from './use-form'
import { en, fr } from '../tests/utils/catalog'

// A form loads the catalog code as it is made; tests warm it so a slow machine can't race them.
beforeAll(() => import('./standard'))

type FieldLike = { error?: string; touch(): void }

const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 5))
}

function makeI18n(messages: object = { en, fr }) {
  return createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: structuredClone(messages) as never,
  })
}

/** The shown errors for `initial`, with nothing set up on the schema library. */
async function errorsFor(schema: StandardSchemaV1, initial: object, i18n = makeI18n()) {
  const form = effectScope().run(() =>
    useForm({
      schema: schema as never,
      defaultValues: initial as never,
      i18n: i18n.global as never,
      showErrors: 'input',
    }),
  )! as unknown as { field(path: string): FieldLike }
  const names = Object.keys(initial)
  void form.field(names[0]!).error // asking is what starts validation
  await flush()
  for (const name of names) form.field(name).touch()
  return {
    form,
    i18n,
    text: Object.fromEntries(names.map((name) => [name, form.field(name).error])),
  }
}

// One expectation per rule, written once and run for each library.
const rules = {
  tooShort: 'Name must be at least 3 characters',
  tooLong: 'Code must be at most 5 characters',
  email: 'Enter a valid email address',
  number: 'Age must be a number',
  missing: 'Nick is required',
  empty: 'Tags is required',
  tooSmallNumber: 'Qty must be at least 2',
  tooBigNumber: 'Cap must be at most 10',
  option: 'Choose one of the available options for Role',
}

const initial = {
  name: 'ab',
  code: 'abcdefg',
  email: 'nope',
  age: 'x',
  nick: undefined,
  tags: [],
  qty: 1,
  cap: 11,
  role: 'z',
}

const schemas: Record<string, StandardSchemaV1> = {
  zod: z.object({
    name: z.string().min(3),
    code: z.string().max(5),
    email: z.email(),
    age: z.number(),
    nick: z.string(),
    tags: z.array(z.string()).min(1),
    qty: z.number().min(2),
    cap: z.number().max(10),
    role: z.enum(['a', 'b']),
  }),
  zodMini: zm.object({
    name: zm.string().check(zm.minLength(3)),
    code: zm.string().check(zm.maxLength(5)),
    email: zm.email(),
    age: zm.number(),
    nick: zm.string(),
    tags: zm.array(zm.string()).check(zm.minLength(1)),
    qty: zm.number().check(zm.gte(2)),
    cap: zm.number().check(zm.lte(10)),
    role: zm.enum(['a', 'b']),
  }),
  zod3: z3.object({
    name: z3.string().min(3),
    code: z3.string().max(5),
    email: z3.string().email(),
    age: z3.number(),
    nick: z3.string(),
    tags: z3.array(z3.string()).min(1),
    qty: z3.number().min(2),
    cap: z3.number().max(10),
    role: z3.enum(['a', 'b']),
  }),
  valibot: v.object({
    name: v.pipe(v.string(), v.minLength(3)),
    code: v.pipe(v.string(), v.maxLength(5)),
    email: v.pipe(v.string(), v.email()),
    age: v.number(),
    nick: v.string(),
    tags: v.pipe(v.array(v.string()), v.minLength(1)),
    qty: v.pipe(v.number(), v.minValue(2)),
    cap: v.pipe(v.number(), v.maxValue(10)),
    role: v.picklist(['a', 'b']),
  }),
  arktype: type({
    name: 'string >= 3',
    code: 'string <= 5',
    email: 'string.email',
    age: 'number',
    nick: 'string',
    tags: 'string[] >= 1',
    qty: 'number >= 2',
    cap: 'number <= 10',
    role: "'a' | 'b'",
  }) as unknown as StandardSchemaV1,
}

describe.each(Object.entries(schemas))('%s, with the app’s own catalog', (_, schema) => {
  it('turns every rule into the catalog text, with nothing wired', async () => {
    const { text } = await errorsFor(schema, initial)
    expect(text.name).toBe(rules.tooShort)
    expect(text.code).toBe(rules.tooLong)
    expect(text.email).toBe(rules.email)
    expect(text.age).toBe(rules.number)
    expect(text.nick).toBe(rules.missing)
    expect(text.tags).toBe(rules.empty)
    expect(text.qty).toBe(rules.tooSmallNumber)
    expect(text.cap).toBe(rules.tooBigNumber)
    expect(text.role).toBe(rules.option)
  })

  it('counts a choice not made, or a cleared select, as not given', async () => {
    for (const role of [undefined, '']) {
      const { text } = await errorsFor(schema, { ...initial, role })
      expect(text.role).toBe('Role is required')
    }
  })

  it('counts an empty text input under a number as not given', async () => {
    const { text } = await errorsFor(schema, { ...initial, age: '' })
    expect(text.age).toBe('Age is required')
  })

  it('follows the locale', async () => {
    const { form, i18n } = await errorsFor(schema, initial)
    i18n.global.locale.value = 'fr'
    await flush()
    expect(form.field('email')!.error).toBe('Saisissez une adresse e-mail valide')
    expect(form.field('name')!.error).toBe('Name doit contenir au moins 3 caractères')
    expect(form.field('nick')!.error).toBe('Nick est obligatoire')
  })

  it('shows the library’s own text for a key the catalog lacks', async () => {
    const { text } = await errorsFor(schema, initial, makeI18n({ en: { formKit: {} } }))
    expect(text.name).not.toBe(rules.tooShort)
    expect(text.name).toMatch(/\w/)
  })
})

describe('what the schema’s author wrote', () => {
  it('is shown as written', async () => {
    const zodOne = z.object({ name: z.string().min(3, 'Pick a longer name') })
    const valibotOne = v.object({ name: v.pipe(v.string(), v.minLength(3, 'Pick a longer name')) })
    const arkOne = type({ name: type('string >= 3').configure({ message: 'Pick a longer name' }) })
    for (const schema of [zodOne, valibotOne, arkOne]) {
      const { text } = await errorsFor(schema as unknown as StandardSchemaV1, { name: 'a' })
      expect(text.name).toBe('Pick a longer name')
    }
  })
})

describe('the app', () => {
  it('can keep its messages under another prefix', async () => {
    const app = createApp({})
    const i18n = makeI18n({ en: { myForms: en.formKit } })
    app.use(formPlugin, { i18n: i18n.global as never, keyPrefix: 'myForms' })
    const form = app.runWithContext(() =>
      useForm({
        schema: z.object({ email: z.email() }),
        defaultValues: { email: 'x' },
        showErrors: 'input',
      }),
    ) as unknown as { field(path: string): FieldLike }
    void form.field('email')!.error
    await flush()
    form.field('email')!.touch()
    expect(form.field('email')!.error).toBe('Enter a valid email address')
  })

  it('can translate a whole group with one default', async () => {
    const i18n = makeI18n({ en: { formKit: { tooSmall: { default: 'Too small: {minimum}' } } } })
    const { text } = await errorsFor(z.object({ n: z.string().min(3) }), { n: 'a' }, i18n)
    expect(text.n).toBe('Too small: 3')
  })

  it('needs no i18n at all', async () => {
    const form = effectScope().run(() =>
      useForm({
        schema: z.object({ n: z.string().min(3) }),
        defaultValues: { n: 'a' },
        showErrors: 'input',
      }),
    )! as unknown as { field(path: string): FieldLike }
    void form.field('n')!.error
    await flush()
    form.field('n')!.touch()
    expect(form.field('n')!.error).toBe('Too small: expected string to have >=3 characters')
  })
})
