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
