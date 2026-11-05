import { effectScope, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { Schema } from 'effect'
import Joi from 'joi'
import * as yup from 'yup'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { msg } from './i18n'
import { useForm } from './use-form'

const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 5))
}

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: { errors: { name: 'Pick a name' } },
    fr: { errors: { name: 'Choisissez un nom' } },
  },
})

async function formFor(schema: StandardSchemaV1, defaultValues: object) {
  const form = effectScope().run(() =>
    useForm({
      schema,
      defaultValues: defaultValues as never,
      showErrors: 'input',
      i18n: i18n.global as never,
    }),
  )! as unknown as {
    field(path: string): any
    valid: { value: boolean }
    allErrors: { value: { path: string }[] }
  }
  void form.valid.value // asking is what starts validation
  await flush()
  return form
}

const initial = { email: 'nope', age: 5, tags: [], members: [{ name: '' }] }

const schemas: Record<string, StandardSchemaV1> = {
  yup: yup.object({
    email: yup.string().email().required(),
    age: yup.number().required(),
    tags: yup.array(yup.string().required()).min(1),
    members: yup.array(yup.object({ name: yup.string().required() })),
  }) as never,
  // Joi stops at the first problem unless told not to.
  joi: Joi.object({
    email: Joi.string().email({ tlds: false }).required(),
    age: Joi.number().required(),
    tags: Joi.array().items(Joi.string()).min(1),
    members: Joi.array().items(Joi.object({ name: Joi.string().required() })),
  }).prefs({ abortEarly: false }) as never,
  effect: Schema.toStandardSchemaV1(
    Schema.Struct({
      email: Schema.String.check(Schema.isPattern(/^\S+@\S+$/)),
      age: Schema.Number,
      tags: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
      members: Schema.Array(Schema.Struct({ name: Schema.String.check(Schema.isMinLength(1)) })),
    }),
  ) as never,
}

describe.each(Object.entries(schemas))('%s', (_name, schema) => {
  it('puts each error on its own field, list rows included, in the library’s own words', async () => {
    const form = await formFor(schema, initial)
    form.field('email').touch()
    form.field('tags').touch()
    expect(form.field('email').error).toBeTruthy()
    expect(form.field('tags').error).toBeTruthy()
    expect(form.field('age').error).toBeUndefined()
    const row = form.field('members').items[0].field.name
    row.touch()
    expect(row.error).toBeTruthy()
    expect(form.allErrors.value.map((error) => error.path).sort()).toEqual([
      'email',
      'members.0.name',
      'tags',
    ])
  })

  it('clears an error when the value is fixed, and a list row moves its error with it', async () => {
    const form = await formFor(schema, { ...initial, members: [{ name: '' }, { name: 'ok' }] })
    form.field('email').value = 'me@example.com'
    form.field('members').move(0, 1)
    await flush()
    expect(form.field('email').error).toBeUndefined()
    expect(form.allErrors.value.map((error) => error.path)).toContain('members.1.name')
    expect(form.allErrors.value.map((error) => error.path)).not.toContain('members.0.name')
  })

  it('submits the schema’s output when valid', async () => {
    let received: unknown
    const form = effectScope().run(() =>
      useForm({
        schema,
        defaultValues: {
          email: 'me@example.com',
          age: 5,
          tags: ['a'],
          members: [{ name: 'Ada' }],
        } as never,
        onSubmit: (values) => (received = values),
      }),
    )!
    expect(await form.handleSubmit()).toBe(true)
    expect(received).toMatchObject({ email: 'me@example.com', age: 5, tags: ['a'] })
  })
})

describe('a message written for the app', () => {
  it('translates through msg() in Yup and in Joi', async () => {
    const yupSchema = yup.object({ name: yup.string().required(msg('errors.name')) }) as never
    const joiSchema = Joi.object({
      name: Joi.string()
        .required()
        .messages({ '*': msg('errors.name') }),
    }) as never
    for (const schema of [yupSchema, joiSchema]) {
      const form = await formFor(schema, { name: '' })
      form.field('name').touch()
      expect(form.field('name').error).toBe('Pick a name')
      i18n.global.locale.value = 'fr'
      await flush()
      expect(form.field('name').error).toBe('Choisissez un nom')
      i18n.global.locale.value = 'en'
    }
  })
})
