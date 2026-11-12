import { effectScope, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { type } from 'arktype'
import * as v from 'valibot'
import { z } from 'zod'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { useForm } from './use-form'

const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 5))
}

function make<S extends StandardSchemaV1>(options: Parameters<typeof useForm<S>>[0]) {
  return effectScope().run(() => useForm(options))!
}

describe('steps in one form', () => {
  const schema = z.object({
    account: z.object({ email: z.email(), password: z.string().min(8) }),
    profile: z.object({ name: z.string().min(2), age: z.number().min(18) }),
    agree: z.literal(true),
  })

  it('validates one step at a time, and shows only that step’s errors', async () => {
    const form = make({ schema, defaultValues: { account: { email: '', password: '' } } })
    void form.valid.value
    await flush()

    expect(await form.validate('account')).toBe(false)
    expect(form.errorList.value.map((e) => e.path).toSorted()).toEqual([
      'account.email',
      'account.password',
    ])

    form.field('account.email').value = 'me@example.com'
    form.field('account.password').value = 'long enough'
    expect(await form.validate('account')).toBe(true)
    expect(form.errorList.value).toEqual([]) // step 2 is not shown before the user gets there
    expect(form.field('profile').valid).toBe(false) // but the form knows
    expect(form.field('account').valid).toBe(true)
  })

  it('keeps a step’s values when its inputs are not on the page', async () => {
    const form = make({
      schema,
      defaultValues: { account: { email: 'me@example.com', password: 'long enough' } },
    })
    form.field('profile.name').value = 'Ada'
    // nothing registers or unregisters: the values live in the form, not in the inputs
    expect(form.values.value).toMatchObject({
      account: { email: 'me@example.com' },
      profile: { name: 'Ada' },
    })
  })

  it('submits only when every step is valid', async () => {
    let submitted: unknown
    const form = make({
      schema,
      defaultValues: {
        account: { email: 'me@example.com', password: 'long enough' },
        profile: { name: 'Ada', age: 30 },
        agree: true,
      },
      onSubmit: (values) => void (submitted = values),
    })
    expect(await form.handleSubmit()).toBe(true)
    expect(submitted).toMatchObject({ profile: { name: 'Ada' } })
  })
})

describe('dependent fields, in each schema library', () => {
  const MATCH = 'Passwords do not match'
  const schemas: Record<string, StandardSchemaV1> = {
    zod: z
      .object({ password: z.string().min(8), confirm: z.string() })
      .refine((d) => d.password === d.confirm, { path: ['confirm'], message: MATCH }),
    valibot: v.pipe(
      v.object({ password: v.pipe(v.string(), v.minLength(8)), confirm: v.string() }),
      v.forward(
        v.partialCheck([['password'], ['confirm']], (i) => i.password === i.confirm, MATCH),
        ['confirm'],
      ),
    ),
    arktype: type({ password: 'string >= 8', confirm: 'string' }).narrow(
      (data, ctx) =>
        data.password === data.confirm ||
        ctx.reject({
          expected: 'identical to password',
          actual: '',
          path: ['confirm'],
          message: MATCH,
        }),
    ) as unknown as StandardSchemaV1,
  }

  describe.each(Object.entries(schemas))('%s', (_, schema) => {
    it('puts the cross-field error on the field it names, and clears it when either side changes', async () => {
      const form = make({
        schema: schema as never,
        defaultValues: { password: 'long enough', confirm: 'nope' } as never,
        showErrors: 'input',
      }) as unknown as { field(path: string): { value: string; error?: string } }
      void form.field('confirm')!.error
      await flush()
      form.field('confirm')!.value = 'still nope'
      await flush()
      expect(form.field('confirm')!.error).toBe(MATCH)

      form.field('password')!.value = 'still nope'
      await flush()
      expect(form.field('confirm')!.error).toBeUndefined()
    })
  })

  it('zod: a cross-field rule still runs when another field is invalid', async () => {
    const form = make({
      schema: schemas.zod as never,
      defaultValues: { password: 'short', confirm: 'different' } as never,
      showErrors: 'input',
    }) as unknown as {
      fields: Record<string, { value: string; error?: string }>
      allErrors: { value: { path: string }[] }
    }
    void form.allErrors.value
    await flush()
    expect(form.allErrors.value.map((e) => e.path).toSorted()).toEqual(['confirm', 'password'])
  })
})

describe('a field that only exists for some answers', () => {
  const schema = z
    .object({ hasCompany: z.boolean(), company: z.string().optional() })
    .superRefine((d, ctx) => {
      if (d.hasCompany && !d.company)
        ctx.addIssue({ code: 'custom', path: ['company'], message: 'Company is required' })
    })

  it('is required only while the answer says so', async () => {
    const form = make({ schema, defaultValues: { hasCompany: false }, showErrors: 'input' })
    void form.valid.value
    await flush()
    expect(form.valid.value).toBe(true)

    form.field('hasCompany').value = true
    await flush()
    expect(form.field('company').valid).toBe(false)

    form.field('company').value = 'Acme'
    await flush()
    expect(form.valid.value).toBe(true)
  })
})

describe('a step whose group has no defaults yet', () => {
  const schemas = {
    zod: z.object({ account: z.object({ email: z.email(), password: z.string().min(8) }) }),
    valibot: v.object({
      account: v.object({
        email: v.pipe(v.string(), v.email()),
        password: v.pipe(v.string(), v.minLength(8)),
      }),
    }),
    arktype: type({ account: { email: 'string.email', password: 'string >= 8' } }),
  }
  for (const [name, schema] of Object.entries(schemas))
    it(`shows the step’s field errors (${name})`, async () => {
      const form = make({ schema: schema as StandardSchemaV1 })
      expect(await form.validate('account')).toBe(false)
      expect(form.errorList.value.map((e) => e.path).toSorted()).toEqual([
        'account.email',
        'account.password',
      ])
    })

  it('leaves an optional group out, and the values as they are', async () => {
    const form = make({
      schema: z.object({ name: z.string(), extra: z.object({ note: z.string() }).optional() }),
      defaultValues: { name: 'Ada' },
    })
    expect(await form.validate()).toBe(true)
    expect(form.values.value).toEqual({ name: 'Ada' })
    expect(form.dirty.value).toBe(false)
  })
})
