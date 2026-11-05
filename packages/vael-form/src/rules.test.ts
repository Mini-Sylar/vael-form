import { effectScope, nextTick, shallowRef } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { msg } from './i18n'
import { useForm } from './use-form'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const flush = async (ms = 5) => {
  await nextTick()
  await wait(ms)
}

function make<S extends StandardSchemaV1>(options: Parameters<typeof useForm<S>>[0]) {
  return effectScope().run(() => useForm(options))!
}

/** Reading the errors is what starts validation; this asks and waits. */
async function warm(form: { valid: { value: boolean } }) {
  void form.valid.value
  await flush()
}

// A form loads the rules' code as it is made; tests warm it so a slow machine can't race them.
beforeAll(() => import('./rules'))

const schema = z.object({
  username: z.string().min(3, 'Too short'),
  members: z.array(z.object({ email: z.string().min(1, 'Required') })),
})
const defaults = { username: 'ada', members: [] }

describe('rules', () => {
  it('runs when the schema has no error at the path, and shows what it returns', async () => {
    const calls: string[] = []
    const form = make({
      schema,
      defaultValues: defaults,
      showErrors: 'input',
      rules: {
        username: async (value) => {
          calls.push(value)
          return value === 'grace' ? 'Already taken' : undefined
        },
      },
    })
    await warm(form)
    expect(calls).toEqual([]) // the default value is not checked

    form.field('username').value = 'gr'
    await flush()
    expect(calls).toEqual([]) // the schema says "too short": no call
    expect(form.field('username').error).toBe('Too short')

    form.field('username').value = 'grace'
    await nextTick()
    expect(form.field('username').pending).toBe(true)
    expect(form.pending.value).toBe(true)
    await flush()
    expect(calls).toEqual(['grace'])
    expect(form.field('username').error).toBe('Already taken')
    expect(form.field('username').valid).toBe(false)
    expect(form.valid.value).toBe(false)
    expect(form.pending.value).toBe(false)

    form.field('username').value = 'graces'
    await nextTick()
    expect(form.field('username').error).toBeUndefined() // cleared before the next render
    await flush()
    expect(form.field('username').valid).toBe(true)
  })

  it('waits for the last change, and answers only for the newest value', async () => {
    const seen: { value: string; signal: AbortSignal }[] = []
    const form = make({
      schema,
      defaultValues: defaults,
      debounce: 30,
      showErrors: 'input',
      rules: {
        username: async (value, { signal }) => {
          seen.push({ value, signal })
          await wait(40)
          return `taken: ${value}`
        },
      },
    })
    await warm(form)
    form.field('username').value = 'abc'
    await wait(10)
    form.field('username').value = 'abcd'
    await wait(10)
    form.field('username').value = 'abcde'
    await wait(45)
    expect(seen.map((s) => s.value)).toEqual(['abcde']) // one call, for the last value
    form.field('username').value = 'abcdef' // changes while the call above is running
    await wait(30 + 60)
    expect(seen.map((s) => s.value)).toEqual(['abcde', 'abcdef'])
    expect(seen[0]!.signal.aborted).toBe(true)
    expect(form.field('username').errors).toEqual(['taken: abcdef'])
  })

  it('takes a list, nothing, false, and a message key', async () => {
    const results = shallowRef<unknown>(['a', 'b'])
    const form = make({
      schema,
      defaultValues: defaults,
      showErrors: 'input',
      rules: { username: () => results.value as never },
    })
    await warm(form)
    form.field('username').value = 'one'
    await flush()
    expect(form.field('username').errors).toEqual(['a', 'b'])
    results.value = false
    form.field('username').value = 'two'
    await flush()
    expect(form.field('username').valid).toBe(true)
    results.value = msg('errors.taken', undefined, 'Taken!')
    form.field('username').value = 'three'
    await flush()
    expect(form.field('username').error).toBe('Taken!')
  })

  it('does not run again for a value it already answered', async () => {
    let calls = 0
    const form = make({
      schema,
      defaultValues: defaults,
      rules: { username: () => (calls++, 'No') },
    })
    await warm(form)
    form.field('username').value = 'grace'
    expect(await form.validate()).toBe(false)
    expect(await form.validate()).toBe(false)
    expect(calls).toBe(1)
  })

  it('runs on blur only when asked to, and always on submit', async () => {
    let calls = 0
    const form = make({
      schema,
      defaultValues: defaults,
      showErrors: 'input',
      rules: { username: { on: 'blur', run: () => (calls++, 'Already taken') } },
    })
    await warm(form)
    form.field('username').value = 'grace'
    await flush()
    expect(calls).toBe(0)
    form.field('username').touch()
    await flush()
    expect(calls).toBe(1)
    expect(form.field('username').error).toBe('Already taken')

    form.field('username').value = 'graces' // the old answer is gone until the next blur
    await flush()
    expect(form.field('username').valid).toBe(true)
    expect(await form.validate()).toBe(false) // a submit does not wait for a blur
    expect(calls).toBe(2)
  })

  it('checks each list item with a * in the path', async () => {
    const seen: string[] = []
    const form = make({
      schema,
      defaultValues: { username: 'ada', members: [{ email: 'a@x.co' }] },
      showErrors: 'input',
      rules: {
        'members.*.email': (value, { path }) => {
          seen.push(path)
          return value.startsWith('bad') ? 'Not allowed' : undefined
        },
      },
    })
    await warm(form)
    form.field('members').push({ email: 'bad@x.co' })
    form.field('members').push({ email: 'ok@x.co' })
    await flush()
    expect(seen.toSorted()).toEqual(['members.1.email', 'members.2.email'])
    const [, bad, ok] = form.field('members').items
    expect(bad!.field.email.error).toBe('Not allowed')
    expect(ok!.field.email.valid).toBe(true)

    form.field('members').remove(1)
    await flush()
    expect(form.valid.value).toBe(true)
  })
})

describe('rules and submit', () => {
  it('waits for the rules, and does not call onSubmit when one fails', async () => {
    let submitted = 0
    let invalid = 0
    const form = make({
      schema,
      defaultValues: defaults,
      debounce: 500, // a submit does not wait for the debounce
      onSubmit: () => void submitted++,
      onInvalid: () => void invalid++,
      rules: { username: async (value) => (value === 'grace' ? 'Already taken' : undefined) },
    })
    form.field('username').value = 'grace'
    expect(await form.handleSubmit()).toBe(false)
    expect([submitted, invalid]).toEqual([0, 1])
    expect(form.field('username').error).toBe('Already taken')

    form.field('username').value = 'graces'
    expect(await form.handleSubmit()).toBe(true)
    expect(submitted).toBe(1)
  })

  it('stops the submit when a rule throws', async () => {
    const form = make({
      schema,
      defaultValues: defaults,
      onSubmit: () => {
        throw new Error('should not run')
      },
      rules: {
        username: () => {
          throw new Error('network down')
        },
      },
    })
    form.field('username').value = 'grace'
    await expect(form.handleSubmit()).rejects.toThrow('network down')
    expect(form.submitting.value).toBe(false)
  })

  it('validate(path) settles only that path', async () => {
    const calls: string[] = []
    const form = make({
      schema,
      defaultValues: { username: 'ada', members: [{ email: 'a@x.co' }] },
      debounce: 500,
      rules: {
        username: () => (calls.push('username'), undefined),
        'members.*.email': () => (calls.push('email'), 'No'),
      },
    })
    await warm(form)
    form.field('username').value = 'grace'
    form.field('members').items[0]!.field.email.value = 'b@x.co'
    expect(await form.validate('username')).toBe(true)
    expect(calls).toEqual(['username'])
  })
})

describe('groups and the form itself', () => {
  const address = z
    .object({
      name: z.string().min(2, 'Short'),
      address: z.object({ street: z.string().min(1, 'Required'), zip: z.string() }),
    })
    .refine((v) => v.name !== 'root', { message: 'Form-wide problem' })

  it('a group is valid only when everything under it is', async () => {
    const form = make({
      schema: address,
      defaultValues: { name: 'Ada', address: { street: '', zip: '1' } },
    })
    await warm(form)
    expect(form.field('address').valid).toBe(false)
    expect(form.field('address.street').valid).toBe(false)
    expect(form.field('address.zip').valid).toBe(true)
    form.field('address.street').value = 'Main'
    await flush()
    expect(form.field('address').valid).toBe(true)
  })

  it("reads an error no field owns from form.field('')", async () => {
    const form = make({
      schema: address,
      defaultValues: { name: 'root', address: { street: 'x', zip: '1' } },
    })
    await warm(form)
    await form.handleSubmit()
    expect(form.field('').error).toBe('Form-wide problem')
    expect(form.field('').valid).toBe(false)
  })
})

describe('default values that arrive later', () => {
  it('follows a ref that starts empty, and keeps what the user typed', async () => {
    const loaded = shallowRef<{ username: string } | undefined>(undefined)
    const form = make({ schema, defaultValues: loaded })
    await warm(form)
    expect(form.dirty.value).toBe(false)
    loaded.value = { username: 'ada' }
    await flush()
    expect(form.field('username').value).toBe('ada')
    expect(form.dirty.value).toBe(false)

    form.field('username').value = 'grace'
    loaded.value = { username: 'refetched' }
    await flush()
    expect(form.field('username').value).toBe('grace')
    form.reset(loaded.value)
    expect(form.field('username').value).toBe('refetched')
    expect(form.dirty.value).toBe(false)
  })
})
