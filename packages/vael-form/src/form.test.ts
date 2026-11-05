import { effectScope, nextTick, shallowRef } from 'vue'
import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { z } from 'zod'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { useForm } from './use-form'

const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 5))
}

/** Asking for errors is what starts validation; this asks and waits for it. */
async function warm(form: { valid: { value: boolean } }) {
  void form.valid.value
  await flush()
}

function make<S extends StandardSchemaV1>(options: Parameters<typeof useForm<S>>[0]) {
  return effectScope().run(() => useForm(options))!
}

const base = { tags: [], members: [] }
const schema = z.object({
  name: z.string().min(2, 'Too short'),
  tags: z.array(z.string()),
  members: z.array(z.object({ name: z.string().min(1, 'Required') })),
})

describe('values', () => {
  it('starts from initial, tracks dirty, and resets', () => {
    const form = make({ schema, defaultValues: { name: 'Ada' } })
    expect(form.field('name').value).toBe('Ada')
    expect(form.dirty.value).toBe(false)

    form.field('name').value = 'Grace'
    expect(form.values.value.name).toBe('Grace')
    expect(form.dirty.value).toBe(true)
    expect(form.field('name').dirty).toBe(true)

    form.reset()
    expect(form.field('name').value).toBe('Ada')
    expect(form.dirty.value).toBe(false)

    form.reset({ name: 'New' })
    expect(form.field('name').value).toBe('New')
    expect(form.dirty.value).toBe(false)
  })

  it('does not change the object it was given', () => {
    const initial = { name: 'Ada', tags: ['a'] }
    const form = make({ schema, defaultValues: initial })
    form.field('tags').push('b')
    form.field('name').value = 'x'
    expect(initial).toEqual({ name: 'Ada', tags: ['a'] })
  })

  it('sets by path, with the field and by path agreeing', () => {
    const form = make({ schema, defaultValues: { members: [{ name: 'a' }] } })
    form.setValue('members.0.name', 'b')
    expect(form.field('members').items[0]!.field.name.value).toBe('b')
    expect(form.field('members.0.name').value).toBe('b')
  })

  it('leaves a field called "value" or "id" to its group', () => {
    const odd = z.object({ user: z.object({ id: z.string(), value: z.string() }) })
    const form = make({ schema: odd, defaultValues: { user: { id: 'u1', value: 'v1' } } })
    expect(form.field('user.id').value).toBe('u1')
    expect(form.field('user.value').value).toBe('v1')
    expect(form.field('user').value).toEqual({ id: 'u1', value: 'v1' })
  })
})

describe('reactive initial', () => {
  it('resets to loaded data, unless the user already edited the form', async () => {
    const loaded = shallowRef<{ name?: string }>({})
    const form = make({ schema, defaultValues: loaded })
    loaded.value = { name: 'Ada' }
    await flush()
    expect(form.field('name').value).toBe('Ada')
    expect(form.dirty.value).toBe(false)

    form.field('name').value = 'Grace'
    loaded.value = { name: 'Refetched' }
    await flush()
    expect(form.field('name').value).toBe('Grace')
  })
})

describe('destructuring', () => {
  it('takes fields from form.fields and methods from the form', async () => {
    const form = make({ schema, defaultValues: { ...base, name: 'Ada' } })
    const name = form.field('name')
    const members = form.field('members')
    const { handleSubmit, reset } = form
    expect(name.value).toBe('Ada')
    members.push({ name: 'x' })
    name.value = 'Grace'
    expect(form.dirty.value).toBe(true)
    reset()
    expect(name.value).toBe('Ada')
    expect(await handleSubmit()).toBe(true)
  })

  it('has no clash between a schema key and the form API', () => {
    const clash = z.object({ values: z.string(), reset: z.string() })
    const form = make({ schema: clash, defaultValues: { values: 'a', reset: 'b' } })
    expect(typeof form.reset).toBe('function')
    expect(form.field('values').value).toBe('a')
    expect(form.field('reset').value).toBe('b')
    expect(form.values.value).toEqual({ values: 'a', reset: 'b' })
  })
})

describe('showErrors per path', () => {
  const people = z.object({
    name: z.string().min(2, 'Too short'),
    nick: z.string().min(2, 'Too short'),
    members: z.array(z.object({ name: z.string().min(1, 'Required') })),
  })
  const initial = { name: 'A', nick: 'B', members: [{ name: '' }, { name: '' }] }

  it('lets one field show as soon as it changes while the rest wait for blur', async () => {
    const form = make({
      schema: people,
      defaultValues: initial,
      showErrors: { default: 'blur', name: 'input' },
    })
    await warm(form)
    expect(form.field('name').error).toBeUndefined()
    form.field('name').value = 'B'
    form.field('nick').value = 'C'
    expect(form.field('name').error).toBe('Too short')
    expect(form.field('nick').error).toBeUndefined()
    form.field('nick').touch()
    expect(form.field('nick').error).toBe('Too short')
  })

  it('applies a group to what is under it, and the nearest path wins', async () => {
    const form = make({
      schema: people,
      defaultValues: initial,
      showErrors: { default: 'input', members: 'submit', 'members.1.name': 'blur' },
    })
    await warm(form)
    const [first, second] = form.field('members').items
    first!.field.name.touch()
    second!.field.name.touch()
    expect(first!.field.name.error).toBeUndefined()
    expect(second!.field.name.error).toBe('Required')
    await form.handleSubmit()
    expect(first!.field.name.error).toBe('Required')
  })

  it('keeps a plain mode working for every field', async () => {
    const form = make({ schema: people, defaultValues: initial, showErrors: 'submit' })
    await warm(form)
    form.field('name').touch()
    expect(form.field('name').error).toBeUndefined()
  })
})

describe('unions', () => {
  const pay = z.discriminatedUnion('type', [
    z.object({ type: z.literal('card'), number: z.string().min(3, 'Too short') }),
    z.object({ type: z.literal('bank'), iban: z.string().min(5, 'Bad iban') }),
  ])

  it('validates the active branch and submits only its fields', async () => {
    let output: unknown
    const form = make({
      schema: pay,
      defaultValues: { type: 'card', number: '' },
      onSubmit: (v) => void (output = v),
    })
    await warm(form)
    expect(form.allErrors.value.map((i) => i.path)).toEqual(['number'])

    form.field('number').value = 'abcd'
    form.field('type').value = 'bank'
    await flush()
    expect(form.allErrors.value.map((i) => i.path)).toEqual(['iban'])
    // the typed card number is kept for when the user switches back
    expect(form.values.value).toEqual({ type: 'bank', number: 'abcd' })

    form.field('iban').value = 'DE123456'
    expect(await form.handleSubmit()).toBe(true)
    expect(output).toEqual({ type: 'bank', iban: 'DE123456' })
  })

  it('keeps list items of different branches apart', async () => {
    const list = z.object({ payments: z.array(pay) })
    const form = make({ schema: list, defaultValues: { payments: [{ type: 'bank', iban: '' }] } })
    form.field('payments').push({ type: 'card', number: '1' })
    await warm(form)
    expect(form.allErrors.value.map((i) => i.path)).toEqual([
      'payments.0.iban',
      'payments.1.number',
    ])
  })
})

describe('schema in a ref', () => {
  it('validates the same values against the new schema', async () => {
    const schema = shallowRef(
      z.object({ name: z.string().min(2, 'Too short') }) as z.ZodType<{ name: string }>,
    )
    const form = make({ schema, defaultValues: { name: 'A' } })
    await warm(form)
    expect(form.allErrors.value.map((i) => i.message)).toEqual(['Too short'])

    schema.value = z.object({ name: z.string().min(1, 'Required') })
    await flush()
    expect(form.valid.value).toBe(true)
  })
})

describe('errors', () => {
  it('validates on demand and shows only what the mode allows', async () => {
    const form = make({ schema, defaultValues: { name: 'A' } })
    await warm(form)
    expect(form.valid.value).toBe(false)
    expect(form.field('name').allErrors.map((i) => i.message)).toEqual(['Too short'])
    expect(form.field('name').error).toBeUndefined()
    expect(form.errorList.value).toEqual([])

    form.field('name').touch()
    expect(form.field('name').error).toBeUndefined() // left, but never changed
    form.field('name').value = 'B'
    form.field('name').touch()
    expect(form.field('name').error).toBe('Too short')
    expect(form.errorList.value).toEqual([{ path: 'name', message: 'Too short' }])
  })

  it('validate(path) shows that path and reports it', async () => {
    const form = make({ schema, defaultValues: { name: 'A', members: [{ name: '' }] } })
    expect(await form.validate('name')).toBe(false)
    expect(form.field('name').error).toBe('Too short')
    expect(form.field('members').items[0]!.field.name.error).toBeUndefined()

    form.field('name').value = 'Ada'
    expect(await form.validate('name')).toBe(true)
  })

  it('keeps issues current as values change, without a new array when nothing changed', async () => {
    const form = make({ schema, defaultValues: { name: 'A' }, showErrors: 'input' })
    await warm(form)
    const before = form.field('name').allErrors
    form.field('tags').push('x')
    await flush()
    expect(form.field('name').allErrors).toEqual(before)
    form.field('name').value = 'Ada'
    await flush()
    expect(form.field('name').valid).toBe(true)
  })
})

describe('handleSubmit', () => {
  it('gives onSubmit the schema output, not the input', async () => {
    const coerce = z.object({ age: z.coerce.number() })
    let got: unknown
    const form = make({
      schema: coerce,
      defaultValues: { age: '42' as never },
      onSubmit: (values) => void (got = values),
    })
    expect(await form.handleSubmit()).toBe(true)
    expect(got).toEqual({ age: 42 })
  })

  it('calls onInvalid, not onSubmit, when invalid; ignores a second submit while one runs', async () => {
    let valid = 0
    let invalid = 0
    let release = () => {}
    const form = make({
      schema,
      defaultValues: { ...base, name: 'A' },
      onSubmit: () => (valid++, new Promise<void>((resolve) => (release = resolve))),
      onInvalid: () => void invalid++,
    })
    expect(await form.handleSubmit()).toBe(false)
    expect([valid, invalid, form.submitCount.value]).toEqual([0, 1, 1])
    expect(form.field('name').error).toBe('Too short')

    form.field('name').value = 'Ada'
    const first = form.handleSubmit()
    await flush()
    expect(form.submitting.value).toBe(true)
    expect(await form.handleSubmit()).toBe(false)
    release()
    expect(await first).toBe(true)
    expect(form.submitting.value).toBe(false)
  })

  it('tells onSubmit which button submitted', async () => {
    let seen: string | undefined
    const form = make({
      schema,
      defaultValues: { ...base, name: 'Ada' },
      onSubmit: (_, { submitter }) => void (seen = (submitter as HTMLButtonElement | null)?.value),
    })
    const submitter = { value: 'draft' } as HTMLButtonElement
    await form.handleSubmit({ preventDefault() {}, submitter } as unknown as SubmitEvent)
    expect(seen).toBe('draft')
  })

  it('lets onSubmit fail without leaving the form stuck', async () => {
    const form = make({
      schema,
      defaultValues: { ...base, name: 'Ada' },
      onSubmit: () => {
        throw new Error('boom')
      },
    })
    await expect(form.handleSubmit()).rejects.toThrow('boom')
    expect(form.submitting.value).toBe(false)
  })
})

describe('server issues', () => {
  it('shows at once, and clears when that field changes', async () => {
    const form = make({ schema, defaultValues: { name: 'Ada' } })
    form.setErrors({ name: 'Taken' })
    expect(form.field('name').error).toBe('Taken')
    expect(form.valid.value).toBe(false)

    form.field('name').value = 'Grace'
    expect(form.field('name').error).toBeUndefined()
  })

  it('takes standard issue lists, and clears on a submit', async () => {
    const form = make({ schema, defaultValues: { ...base, name: 'Ada' } })
    form.setErrors([{ path: 'name', message: 'Nope' }, { message: 'Form-wide' }])
    expect(form.errorList.value.map((e) => e.message)).toEqual(['Nope', 'Form-wide'])
    await form.handleSubmit()
    expect(form.errorList.value).toEqual([])
  })
})

describe('async schemas', () => {
  const slow: StandardSchemaV1<{ name: string }> = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) => {
        const { name } = value as { name: string }
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                name === 'slow' ? { issues: [{ message: 'Stale' }] } : { value: value as never },
              ),
            name === 'slow' ? 30 : 0,
          ),
        )
      },
    },
  }

  it('is pending while it runs, and an older run never overwrites a newer one', async () => {
    const form = make({ schema: slow, defaultValues: { name: 'a' } })
    await warm(form)
    form.field('name').value = 'slow'
    await nextTick()
    form.field('name').value = 'fast'
    await nextTick()
    expect(form.pending.value).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(form.pending.value).toBe(false)
    expect(form.valid.value).toBe(true)
  })
})

describe('arrays', () => {
  it('keeps item keys through edits, moves and removals', () => {
    const form = make({
      schema,
      defaultValues: { members: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] },
    })
    const members = form.field('members')
    const [a, b, c] = members.items.map((item) => item.key)

    members.items[1]!.field.name.value = 'B'
    expect(members.items.map((item) => item.key)).toEqual([a, b, c])
    expect(members.items).toBe(members.items)

    members.move(0, 2)
    expect(members.items.map((item) => item.key)).toEqual([b, c, a])
    expect(members.items.map((item) => item.field.name.value)).toEqual(['B', 'c', 'a'])

    members.remove(1)
    expect(members.items.map((item) => item.key)).toEqual([b, a])

    members.insert(1, { name: 'x' })
    expect(members.items.map((item) => item.field.name.value)).toEqual(['B', 'x', 'a'])

    members.swap(0, 2)
    expect(members.items.map((item) => item.field.name.value)).toEqual(['a', 'x', 'B'])

    members.replace([{ name: 'z' }])
    expect(members.items.map((item) => item.field.name.value)).toEqual(['z'])
  })

  it('moves touched state with the item, and drops it with a removed one', async () => {
    const form = make({
      schema,
      defaultValues: { members: [{ name: '' }, { name: '' }] },
      showErrors: 'blur',
    })
    await warm(form)
    const members = form.field('members')
    members.items[1]!.field.name.touch()
    expect(members.items[0]!.field.name.error).toBeUndefined()
    expect(members.items[1]!.field.name.error).toBe('Required')

    members.remove(0)
    expect(members.items).toHaveLength(1)
    expect(members.items[0]!.field.name.error).toBe('Required')

    members.push({ name: '' })
    expect(members.items[1]!.field.name.error).toBeUndefined()
  })

  it('shows a list-level error once an item is touched', async () => {
    const listed = z.object({ tags: z.array(z.string()).min(2, 'Two tags') })
    const form = make({ schema: listed, defaultValues: { tags: ['a'] }, showErrors: 'blur' })
    await warm(form)
    expect(form.field('tags').error).toBeUndefined()
    form.field('tags').items[0]!.field.touch()
    expect(form.field('tags').error).toBe('Two tags')
  })
})

describe('other libraries', () => {
  it('works with Valibot output and nested paths', async () => {
    const form = make({
      schema: v.object({ a: v.object({ n: v.pipe(v.string(), v.minLength(2, 'Short')) }) }),
      defaultValues: { a: { n: 'x' } },
    })
    expect(await form.validate('a.n')).toBe(false)
    expect(form.field('a.n').error).toBe('Short')
  })
})
