import { effectScope, nextTick, shallowRef, watchEffect } from 'vue'
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

it.each(
  Object.entries({
    zod: z.object({ address: z.object({ street: z.string().min(1) }).nullable() }),
    valibot: v.object({
      address: v.nullable(v.object({ street: v.pipe(v.string(), v.minLength(1)) })),
    }),
    arktype: type({ address: type({ street: 'string >= 1' }).or('null') }),
  }),
)('%s: doesn’t make a missing group that may be null', async (_, schema) => {
  const form = effectScope().run(() =>
    useForm({ schema: schema as StandardSchemaV1, defaultValues: {} }),
  )!
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

describe.each(
  Object.entries({
    zod: z.object({
      pay: z.discriminatedUnion('type', [
        z.object({ type: z.literal('card'), amount: z.number().min(1) }),
        z.object({ type: z.literal('cash'), amount: z.number().nullable() }),
      ]),
    }),
    valibot: v.object({
      pay: v.variant('type', [
        v.object({ type: v.literal('card'), amount: v.pipe(v.number(), v.minValue(1)) }),
        v.object({ type: v.literal('cash'), amount: v.nullable(v.number()) }),
      ]),
    }),
    arktype: type({
      pay: type({ type: "'card'", amount: 'number >= 1' }).or({
        type: "'cash'",
        amount: 'number | null',
      }),
    }) as unknown as StandardSchemaV1,
  }),
)('%s: a union whose branches share a key', (_, schema) => {
  it('reads the active branch, and requires a key no branch is picked for only if all do', async () => {
    const form = effectScope().run(() =>
      useForm({ schema: schema as never, defaultValues: { pay: { type: 'card' } } as never }),
    )!
    const pay = form.field('pay.type' as never) as { value: unknown }
    const attrs = form.attrs as Record<string, any>
    void attrs.pay.amount
    await flush()
    expect(attrs.pay.amount).toMatchObject({ min: 1, 'aria-required': true })
    pay.value = 'cash'
    await flush()
    expect(attrs.pay.amount['aria-required']).toBeUndefined() // `cash` takes null
    expect(attrs.pay.amount.min).toBeUndefined()
    pay.value = undefined
    await flush()
    expect(attrs.pay.amount['aria-required']).toBeUndefined() // one branch takes null
  })
})

it('requires a key that only one branch has and that turns null away, with no branch picked', async () => {
  const schema = z.object({
    pay: z.discriminatedUnion('type', [
      z.object({ type: z.literal('card'), number: z.number().nullable().pipe(z.number()) }),
      z.object({ type: z.literal('cash') }),
    ]),
  })
  const form = effectScope().run(() => useForm({ schema, defaultValues: { pay: {} } as never }))!
  const attrs = form.attrs as Record<string, any>
  void attrs.pay.number
  await flush()
  expect(attrs.pay.number['aria-required']).toBe(true) // as it is once `card` is picked
})

it('keeps a wide union’s attrs about as quick as a plain form’s on each keystroke', async () => {
  const wide = Object.fromEntries(
    Array.from({ length: 300 }, (_, i) => [`f${i}`, z.string().min(1)]),
  )
  const plain = z.object({ type: z.literal('a'), ...wide })
  const union = z.discriminatedUnion('type', [plain, z.object({ type: z.literal('b') })])
  const time = async (schema: StandardSchemaV1) => {
    const scope = effectScope()
    const form = scope.run(() => useForm({ schema, defaultValues: { type: 'a' } as never }))!
    const attrs = form.attrs as Record<string, any>
    scope.run(() => Object.keys(wide).forEach((key) => watchEffect(() => void attrs[key])))
    await flush()
    const start = performance.now()
    for (let i = 0; i < 20; i++) {
      form.setValue('f0' as never, 'x'.repeat(i) as never)
      await nextTick()
    }
    scope.stop()
    return performance.now() - start
  }
  await time(plain) // warm up
  const [one, many] = [await time(plain), await time(union)]
  expect(many).toBeLessThan(one * 1.5) // attrs once read every branch, then followed every value
})

describe.each(
  Object.entries({
    zod: z.object({
      pay: z.discriminatedUnion('type', [
        z.object({ type: z.literal('card'), name: z.string(), amount: z.number().min(1) }),
        z.object({ type: z.literal('cash'), name: z.string(), amount: z.number().nullable() }),
      ]),
    }),
    valibot: v.object({
      pay: v.variant('type', [
        v.object({
          type: v.literal('card'),
          name: v.string(),
          amount: v.pipe(v.number(), v.minValue(1)),
        }),
        v.object({ type: v.literal('cash'), name: v.string(), amount: v.nullable(v.number()) }),
      ]),
    }),
  }),
)('%s: a union’s attrs', (_, schema) => {
  it('follow only the discriminator, not every keystroke in the form', async () => {
    const scope = effectScope()
    const form = scope.run(() =>
      useForm({ schema: schema as never, defaultValues: { pay: { type: 'card' } } as never }),
    )!
    const field = (path: string) => form.field(path as never) as { attrs: any; value: unknown }
    let runs = 0
    scope.run(() => watchEffect(() => void (runs++, field('pay.amount').attrs)))
    await flush()
    const before = runs
    for (const name of ['a', 'ab', 'abc']) {
      field('pay.name').value = name
      await flush()
    }
    expect(runs).toBe(before) // another field's value doesn't pick the branch
    field('pay.type').value = 'cash'
    await flush()
    expect(runs).toBeGreaterThan(before)
    expect(field('pay.amount').attrs.min).toBeUndefined()
    scope.stop()
  })
})

it('does not look at a list’s rows again when an edit is elsewhere', async () => {
  let reads = 0
  const row = {
    type: 'object',
    required: ['note'],
    get properties() {
      reads++
      return { note: { type: 'object', properties: { text: { type: 'string' } } } }
    },
  }
  const shape = {
    type: 'object',
    properties: { name: { type: 'string' }, rows: { type: 'array', items: row } },
  }
  const schema: StandardSchemaV1 = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value: unknown) => ({ value }),
      jsonSchema: { input: () => shape, output: () => shape },
    } as never,
  }
  const form = effectScope().run(() =>
    useForm({ schema, defaultValues: { name: '', rows: Array.from({ length: 20 }, () => ({})) } }),
  )!
  void form.valid.value
  await flush()
  const before = reads
  for (const name of ['a', 'ab', 'abc']) {
    form.setValue('name' as never, name as never)
    await flush()
  }
  expect(reads - before).toBe(0)
})
