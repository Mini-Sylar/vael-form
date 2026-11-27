import { effectScope, nextTick, shallowRef } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
import { type } from 'arktype'
import * as v from 'valibot'
import { z } from 'zod'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { useForm } from './use-form'

// The limits are a chunk of their own; warm it so a slow machine can't race the tests.
beforeAll(() => import('./limits'))

const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 5))
}

const schemas: Record<string, StandardSchemaV1> = {
  zod: z.object({
    name: z.string().min(2).max(20),
    nick: z.string().optional(),
    bio: z.string(),
    age: z.number().int().min(18).max(99),
    ok: z.boolean(),
    born: z.coerce.date(),
    address: z.object({ street: z.string().min(1) }),
    tags: z.array(z.string()),
  }),
  valibot: v.object({
    name: v.pipe(v.string(), v.minLength(2), v.maxLength(20)),
    nick: v.optional(v.string()),
    bio: v.string(),
    age: v.pipe(v.number(), v.integer(), v.minValue(18), v.maxValue(99)),
    ok: v.boolean(),
    born: v.date(),
    address: v.object({ street: v.pipe(v.string(), v.minLength(1)) }),
    tags: v.array(v.string()),
  }),
  arktype: type({
    name: '2 <= string <= 20',
    'nick?': 'string',
    bio: 'string',
    age: '18 <= number.integer <= 99',
    ok: 'boolean',
    born: 'Date',
    address: { street: 'string >= 1' },
    tags: 'string[]',
  }) as unknown as StandardSchemaV1,
}

describe.each(Object.entries(schemas))('%s', (_, schema) => {
  it('puts the schema’s limits on attrs', async () => {
    const form = effectScope().run(() => useForm({ schema: schema as never }))!
    const attrs = form.attrs as Record<string, any>
    void attrs.name
    await flush()
    expect(attrs.name).toMatchObject({ minlength: 2, maxlength: 20, 'aria-required': true })
    expect(attrs.nick['aria-required']).toBeUndefined() // optional
    expect(attrs.bio['aria-required']).toBeUndefined() // '' is a valid string
    expect(attrs.ok['aria-required']).toBeUndefined() // false is a value
    expect(attrs.age).toMatchObject({ min: 18, max: 99, 'aria-required': true })
    expect(attrs.address.street['aria-required']).toBe(true)
    expect(attrs.born.id).toBeTruthy() // a date has no limits, and nothing breaks
  })

  it('knows a group before the data has it, so nested v-model and errors work while loading', async () => {
    const data = shallowRef<Record<string, unknown>>()
    const form = effectScope().run(() =>
      useForm({ schema: schema as never, defaultValues: data as never, showErrors: 'input' }),
    )!
    const model = form.model as Record<string, any>
    const errors = form.errors as unknown as Record<string, any>
    expect(model.address.value.street).toBeUndefined() // a view, not a crash
    expect(errors.address.street).toBeUndefined()
    expect(Array.isArray(model.tags.value)).toBe(true)
    model.address.value.street = 'Main St' // writing makes the group
    expect((form.values.value as Record<string, any>).address).toEqual({ street: 'Main St' })

    data.value = { address: { street: 'Loaded' }, tags: ['a'] } // not dirty yet? it is: the user typed
    await flush()
    expect(model.address.value.street).toBe('Main St') // the user's edit wins
  })
})

it('keeps the limits of a value that may be null', async () => {
  const nullable = {
    zod: z.object({
      seats: z.number().int().min(1).max(50).nullable().pipe(z.number()),
      code: z.string().min(2).max(8).nullable(),
    }),
    valibot: v.object({
      seats: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50))),
      code: v.nullable(v.pipe(v.string(), v.minLength(2), v.maxLength(8))),
    }),
    arktype: type({ seats: '1 <= number.integer <= 50 | null', code: '2 <= string <= 8 | null' }),
  }
  for (const schema of Object.values(nullable)) {
    const form = effectScope().run(() => useForm({ schema: schema as never }))!
    const attrs = form.attrs as Record<string, any>
    void attrs.seats
    await flush()
    expect(attrs.seats).toMatchObject({ min: 1, max: 50 })
    expect(attrs.code).toMatchObject({ minlength: 2, maxlength: 8 })
  }
})

describe.each(
  Object.entries({
    zod: z.object({
      limit: z.number().nullable(),
      code: z.string().min(2).nullable(),
      seats: z.number().int().min(1).nullable().pipe(z.number()),
      later: z
        .number()
        .nullable()
        .transform((value) => value ?? 0),
    }),
    valibot: v.object({
      limit: v.nullable(v.number()),
      code: v.nullish(v.pipe(v.string(), v.minLength(2))),
      seats: v.pipe(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))), v.number()),
      later: v.pipe(
        v.nullable(v.number()),
        v.transform((value) => value ?? 0),
      ),
    }),
    arktype: type({
      limit: 'number | null',
      code: 'string >= 2 | null',
      seats: type('number.integer >= 1 | null').to('number'),
      later: type('number | null').pipe((value) => value ?? 0),
    }),
  }),
)('%s: a value that may be null', (_, schema) => {
  it('is not required, unless the schema turns null away', async () => {
    const form = effectScope().run(() => useForm({ schema: schema as never }))!
    const attrs = form.attrs as Record<string, any>
    void attrs.limit
    await flush()
    expect(attrs.limit['aria-required']).toBeUndefined()
    expect(attrs.code['aria-required']).toBeUndefined()
    expect(attrs.code.minlength).toBe(2)
    expect(attrs.seats).toMatchObject({ min: 1, 'aria-required': true })
    expect(attrs.later['aria-required']).toBeUndefined() // a transform can't say
  })
})

describe.each(
  Object.entries({
    zod: z.object({ count: z.number().int(), seats: z.number().int().min(1) }),
    valibot: v.object({
      count: v.pipe(v.number(), v.safeInteger()),
      seats: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(Infinity)),
    }),
    arktype: type({ count: 'number.safe', seats: 'number.safe >= 1' }),
  }),
)('%s: an integer', (_, schema) => {
  it('has no min or max for the safe-integer range, and keeps a real bound', async () => {
    const form = effectScope().run(() => useForm({ schema: schema as never }))!
    const attrs = form.attrs as Record<string, any>
    void attrs.count
    await flush()
    expect(attrs.count.min).toBeUndefined()
    expect(attrs.count.max).toBeUndefined()
    expect(attrs.seats.min).toBe(1)
    expect(attrs.seats.max).toBeUndefined()
  })
})

describe.each(
  Object.entries({
    zod: z.object({
      email: z.email(),
      site: z.url(),
      code: z.string().regex(/^[A-Z]*$/),
      seats: z.number().int().positive().lt(10),
    }),
    valibot: v.object({
      email: v.pipe(v.string(), v.email()),
      site: v.pipe(v.string(), v.url()),
      code: v.pipe(v.string(), v.regex(/^[A-Z]*$/)),
      seats: v.pipe(v.number(), v.safeInteger(), v.gtValue(0), v.ltValue(10)),
    }),
    arktype: type({
      email: 'string.email',
      site: 'string.url',
      code: /^[A-Z]*$/,
      seats: '0 < number.integer < 10',
    }),
  }),
)('%s: formats and exclusive bounds', (_, schema) => {
  it('requires a string whose format turns "" away, and moves an integer’s exclusive bounds in', async () => {
    const form = effectScope().run(() => useForm({ schema: schema as never }))!
    const attrs = form.attrs as Record<string, any>
    void attrs.email
    await flush()
    expect(attrs.email['aria-required']).toBe(true)
    expect(attrs.site['aria-required']).toBe(true)
    expect(attrs.code['aria-required']).toBeUndefined() // '' matches the pattern
    expect(attrs.seats).toMatchObject({ min: 1, max: 9 })
  })
})

it('reads the pattern before the format: Zod’s hex and base64 take ""', async () => {
  const form = effectScope().run(() =>
    useForm({ schema: z.object({ hex: z.hex(), data: z.base64(), id: z.uuid() }) }),
  )!
  const attrs = form.attrs as Record<string, any>
  void attrs.hex
  await flush()
  expect(attrs.hex['aria-required']).toBeUndefined()
  expect(attrs.data['aria-required']).toBeUndefined()
  expect(attrs.id['aria-required']).toBe(true)
})

it('keeps the tighter of an inclusive and an exclusive bound', async () => {
  const schema = v.object({
    seats: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.gtValue(3),
      v.ltValue(10),
      v.maxValue(20),
    ),
    tip: v.nonOptional(v.nullish(v.pipe(v.string(), v.minLength(1)))),
  })
  const form = effectScope().run(() => useForm({ schema }))!
  const attrs = form.attrs as Record<string, any>
  void attrs.seats
  await flush()
  expect(attrs.seats).toMatchObject({ min: 4, max: 9 })
  expect(attrs.tip['aria-required']).toBeUndefined() // `nonOptional` keeps the `null`
})

it('reads Valibot’s other wrappers and its exact length', async () => {
  const schema = v.object({
    nick: v.exactOptional(v.pipe(v.string(), v.minLength(2))),
    name: v.nonOptional(v.optional(v.pipe(v.string(), v.minLength(2), v.maxLength(9)))),
    city: v.nonNullable(v.nullable(v.pipe(v.string(), v.minLength(1)))),
    pin: v.pipe(v.string(), v.length(4)),
    pair: v.pipe(v.array(v.string()), v.length(2)),
  })
  const form = effectScope().run(() => useForm({ schema }))!
  const attrs = form.attrs as Record<string, any>
  void attrs.nick
  await flush()
  expect(attrs.nick['aria-required']).toBeUndefined()
  expect(attrs.nick.minlength).toBe(2)
  expect(attrs.name).toMatchObject({ minlength: 2, maxlength: 9, 'aria-required': true })
  expect(attrs.city).toMatchObject({ minlength: 1, 'aria-required': true })
  expect(attrs.pin).toMatchObject({ minlength: 4, maxlength: 4, 'aria-required': true })
  expect(attrs.pair['aria-required']).toBe(true)
})

it('doesn’t make a missing Valibot group that may be null', async () => {
  const schema = v.object({
    address: v.nullable(v.object({ street: v.pipe(v.string(), v.minLength(1)) })),
  })
  const form = effectScope().run(() => useForm({ schema, defaultValues: {} }))!
  void form.valid.value
  await flush()
  expect(form.allErrors.value.map((error) => error.path)).toEqual(['address'])
})

it('a plain form without a schema library just has no limits', () => {
  const form = effectScope().run(() =>
    useForm({ defaultValues: { name: '' }, validate: { name: (v) => !v && 'Required' } }),
  )!
  expect(Object.keys(form.attrs.name).sort()).toEqual([
    'aria-describedby',
    'aria-invalid',
    'id',
    'name',
    'onFocusout',
  ])
})
