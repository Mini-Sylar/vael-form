import { effectScope, isRef, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { useForm } from './use-form'

const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 5))
}

const schema = z.object({
  name: z.string().min(3, 'Too short'),
  age: z.number(),
  address: z.object({ street: z.string(), zip: z.string() }),
  tags: z.array(z.string()),
  members: z.array(z.object({ name: z.string().min(1, 'Required') })),
})
const defaults = {
  name: '',
  age: 1,
  address: { street: '', zip: '' },
  tags: ['a'],
  members: [{ name: 'Ada' }],
}

function make() {
  return effectScope().run(() => useForm({ schema, defaultValues: defaults }))!
}

describe('form.model', () => {
  it('hands out one ref per field to destructure, and v-model="name" is a write to it', async () => {
    const form = make()
    const { name, age } = form.model
    expect(isRef(name) && isRef(age)).toBe(true)
    expect(form.model.name).toBe(name) // the same ref every time
    name.value = 'Ada'
    expect(form.values.value.name).toBe('Ada')
    expect(form.field('name').value).toBe('Ada')
    form.field('name').value = 'Grace'
    expect(name.value).toBe('Grace')
    expect(form.dirty.value).toBe(true)
  })

  it('writes count like any edit: dirty, edited, errors once left, watch', async () => {
    const form = make()
    void form.valid.value // asking is what starts validation
    await flush()
    const seen: unknown[] = []
    form.field('name').watch(({ value }) => seen.push(value))
    form.model.name.value = 'a'
    await flush()
    expect(seen).toEqual(['a'])
    expect(form.field('name').error).toBeUndefined() // not left yet
    form.field('name').touch()
    await flush()
    expect(form.field('name').error).toBe('Too short')
    form.model.name.value = 'Ada'
    await flush()
    expect(form.field('name').error).toBeUndefined()
  })

  it('a group is a ref to a writable object: address.street = x', async () => {
    const form = make()
    const { address } = form.model
    expect(address.value.street).toBe('')
    address.value.street = 'Main St'
    expect(form.values.value.address).toEqual({ street: 'Main St', zip: '' })
    expect(form.field('address.street').value).toBe('Main St')
    form.field('address.zip').value = '123'
    expect(address.value.zip).toBe('123')
    expect(Object.keys(address.value)).toEqual(['street', 'zip'])
    expect(JSON.parse(JSON.stringify(address.value))).toEqual({ street: 'Main St', zip: '123' })
  })

  it('a list reads and iterates as an array, and its rows are writable', async () => {
    const form = make()
    const { members, tags } = form.model
    expect(Array.isArray(members.value)).toBe(true)
    expect(members.value).toHaveLength(1)
    expect(members.value.map((row) => row.name)).toEqual(['Ada'])
    members.value[0]!.name = 'Grace'
    expect(form.values.value.members).toEqual([{ name: 'Grace' }])
    form.field('members').push({ name: 'Linus' })
    expect([...members.value].map((row) => row.name)).toEqual(['Grace', 'Linus'])
    tags.value = [...tags.value, 'b'] // what a checkbox group does
    expect(form.values.value.tags).toEqual(['a', 'b'])
    expect(tags.value.includes('b')).toBe(true)
  })

  it('does not look like a Vue ref or reactive object where it should not', () => {
    const form = make()
    const { address, members } = form.model
    expect(isRef(address.value)).toBe(false)
    expect(isRef(members.value)).toBe(false)
  })
})

describe('the rest of what useForm returns', () => {
  it('errors and attrs follow the schema’s shape and the values', async () => {
    const form = effectScope().run(() =>
      useForm({ schema, defaultValues: defaults, showErrors: 'input' }),
    )!
    const { errors, attrs } = form // destructured: they stay live
    void form.valid.value
    await flush()
    form.model.name.value = 'a'
    form.model.address.value.street = 'x'
    await flush()
    expect(errors.name).toBe('Too short')
    expect(errors.address.street).toBeUndefined()
    expect(errors.tags).toBeUndefined() // a list is one field
    expect(attrs.name.name).toBe('name')
    expect(attrs.name['aria-invalid']).toBe(true)
    expect(attrs.address.street.name).toBe('address.street')
    expect(attrs.tags.name).toBe('tags')
    form.model.name.value = 'Ada'
    await flush()
    expect(errors.name).toBeUndefined()
  })

  it('valid, dirty, submitting... are refs that survive destructuring', async () => {
    const form = effectScope().run(() =>
      useForm({ schema, defaultValues: defaults, onSubmit: () => undefined }),
    )!
    const { valid, dirty, submitting, submitCount, values } = form
    void valid.value
    await flush()
    expect(dirty.value).toBe(false)
    form.model.name.value = 'Ada'
    expect(dirty.value).toBe(true)
    expect(values.value.name).toBe('Ada')
    await form.handleSubmit()
    expect(submitCount.value).toBe(1)
    expect(submitting.value).toBe(false)
  })

  it('ref.watch and form.watch hear the user and not a reset: a dependent field', async () => {
    const dep = z.object({
      country: z.string(),
      state: z.string().optional(),
      address: z.object({ zip: z.string() }),
    })
    const form = effectScope().run(() =>
      useForm({ schema: dep, defaultValues: { country: 'US', state: 'NY', address: { zip: '' } } }),
    )!
    const { country, state } = form.model
    const seen: string[] = []
    country.watch(() => (state.value = undefined))
    form.watch('address.zip', ({ value }) => seen.push(`zip ${value}`))
    country.value = 'FR'
    await flush()
    expect(state.value).toBeUndefined() // the dependent field was cleared by the watcher
    form.model.address.value.zip = '75'
    await flush()
    expect(seen).toEqual(['zip 75'])

    state.value = 'IDF'
    form.reset() // not the user: nothing runs
    await flush()
    expect(country.value).toBe('US')
    expect(state.value).toBe('NY') // the reset default, not cleared by the watcher
    expect(seen).toEqual(['zip 75'])
  })
})

describe('attrs.errorId', () => {
  it('is on attrs but is not an attribute to spread', () => {
    const form = effectScope().run(() => useForm({ schema, defaultValues: defaults }))!
    const { attrs } = form
    expect(attrs.name.errorId).toBe(form.field('name').errorId)
    expect(Object.keys(attrs.name)).not.toContain('errorId')
    expect({ ...attrs.name }.errorId).toBeUndefined()
  })
})

describe('handleSubmit(fn)', () => {
  const make = (onSubmit?: (values: unknown) => unknown) =>
    effectScope().run(() =>
      useForm({ schema, defaultValues: { ...defaults, name: 'Ada' }, onSubmit }),
    )!

  it('with no onSubmit it only validates', async () => {
    const form = make()
    expect(await form.handleSubmit()).toBe(true)
    form.model.name.value = 'a'
    expect(await form.handleSubmit()).toBe(false)
  })

  it('returns a handler that runs your function with the output and the context', async () => {
    const form = make()
    const seen: unknown[] = []
    const handler = form.handleSubmit((values, { form: owner, submitter }) => {
      seen.push(values, owner === form, submitter)
    })
    expect(typeof handler).toBe('function')
    expect(seen).toEqual([]) // nothing runs until the event
    expect(await handler()).toBe(true)
    expect(seen).toMatchObject([{ name: 'Ada' }, true, null])
  })

  it('prevents the default of the event it is given, and skips your function when invalid', async () => {
    const form = make()
    form.model.name.value = 'a'
    let called = false
    let prevented = false
    const handler = form.handleSubmit(() => (called = true))
    expect(await handler({ preventDefault: () => (prevented = true) } as unknown as Event)).toBe(
      false,
    )
    expect(prevented).toBe(true)
    expect(called).toBe(false)
  })

  it('replaces onSubmit for that call, and onSubmit still runs for the plain call', async () => {
    const calls: string[] = []
    const form = make(() => calls.push('option'))
    await form.handleSubmit(() => calls.push('own'))()
    await form.handleSubmit()
    expect(calls).toEqual(['own', 'option'])
  })

  it('rejects when your function throws, and a second submit is allowed again', async () => {
    const form = make()
    await expect(form.handleSubmit(() => Promise.reject(new Error('boom')))()).rejects.toThrow(
      'boom',
    )
    expect(form.submitting.value).toBe(false)
    expect(await form.handleSubmit(() => undefined)()).toBe(true)
  })
})
