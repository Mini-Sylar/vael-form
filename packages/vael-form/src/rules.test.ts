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

  it('keeps a row’s answer when a list change moves it, and checks only changed rows', async () => {
    const seen: string[] = []
    const form = make({
      schema,
      defaultValues: defaults,
      showErrors: 'input',
      rules: {
        'members.*.email': async (value) => {
          seen.push(value)
          return value.startsWith('bad') ? 'Not allowed' : undefined
        },
      },
    })
    await warm(form)
    const members = form.field('members')
    members.push({ email: 'a@x.co' })
    members.push({ email: 'bad@x.co' })
    members.push({ email: 'c@x.co' })
    await flush()
    expect(seen.toSorted()).toEqual(['a@x.co', 'bad@x.co', 'c@x.co'])

    seen.length = 0
    members.remove(0)
    await flush()
    members.move(0, 1)
    await flush()
    expect(seen).toEqual(['bad@x.co', 'bad@x.co']) // only the failing row, once per change
    expect(members.items[1]!.field.email.error).toBe('Not allowed') // the answer moved too

    seen.length = 0
    members.insert(0, { email: 'd@x.co' })
    await flush()
    expect(seen.toSorted()).toEqual(['bad@x.co', 'd@x.co'])

    form.field('members.2.email').value = 'e@x.co'
    await flush()
    expect(seen.toSorted()).toEqual(['bad@x.co', 'd@x.co', 'e@x.co'])
    expect(form.valid.value).toBe(true)
  })

  it('a moved row keeps its pending run; a removed row’s is aborted', async () => {
    const runs: { value: string; signal: AbortSignal }[] = []
    const form = make({
      schema,
      defaultValues: defaults,
      showErrors: 'input',
      rules: {
        'members.*.email': async (value, { signal }) => {
          runs.push({ value, signal })
          await wait(30)
          return value.startsWith('bad') ? 'Not allowed' : undefined
        },
      },
    })
    await warm(form)
    const members = form.field('members')
    members.push({ email: 'a@x.co' })
    members.push({ email: 'bad@x.co' })
    await flush()
    expect(runs.length).toBe(2)
    members.remove(0)
    await flush()
    expect(runs.map((run) => [run.value, run.signal.aborted])).toEqual([
      ['a@x.co', true],
      ['bad@x.co', false],
    ]) // no new run for the row that moved up
    expect(members.items[0]!.field.email.pending).toBe(true)
    await flush(40)
    expect(members.items[0]!.field.email.error).toBe('Not allowed')
  })
})

describe('rules after a list change', () => {
  it('checks a failing row again, so an error about another row clears; a passing row isn’t', async () => {
    const seen: string[] = []
    const form = make({
      schema,
      defaultValues: defaults,
      showErrors: 'input',
      rules: {
        'members.*.email': (value, { values }) => {
          seen.push(value)
          const all = (values.members ?? []).map((member) => member.email)
          return all.indexOf(value) !== all.lastIndexOf(value) ? 'Duplicate' : undefined
        },
      },
    })
    await warm(form)
    const members = form.field('members')
    for (const email of ['a@x.co', 'b@x.co', 'a@x.co']) members.push({ email })
    await flush()
    expect(members.items[0]!.field.email.error).toBe('Duplicate')
    seen.length = 0
    members.remove(2)
    await flush()
    expect(seen).toEqual(['a@x.co']) // only the row that failed
    expect(form.valid.value).toBe(true)
  })

  it('compares a row with its own default, not the one at its index', async () => {
    const seen: string[] = []
    const form = make({
      schema,
      defaultValues: { username: 'ada', members: [{ email: 'a@x.co' }, { email: 'b@x.co' }] },
      showErrors: 'input',
      rules: { 'members.*.email': (value) => void seen.push(value) },
    })
    await warm(form)
    const members = form.field('members')
    members.move(0, 1)
    await flush()
    members.remove(0)
    await flush()
    expect(seen).toEqual([]) // each row is still its own default
    members.insert(0, { email: 'b@x.co' })
    await flush()
    expect(seen).toEqual(['b@x.co']) // a new row has no default

    seen.length = 0
    form.reset()
    members.move(0, 1)
    await flush()
    form.setValues({ username: 'ada', members: [{ email: 'a@x.co' }, { email: 'b@x.co' }] })
    await flush()
    members.reset()
    members.swap(0, 1)
    await flush()
    expect(seen).toEqual([]) // reset, setValues and a field's reset line the rows up with the defaults
  })
})

describe('rules after a list change, again', () => {
  const duplicate = (seen: string[], signals: AbortSignal[] = [], ms = 0) =>
    (async (value: string, { values, signal }: any) => {
      seen.push(value)
      signals.push(signal)
      if (ms) await wait(ms)
      const all = (values.members ?? []).map((member: any) => member.email)
      return all.indexOf(value) !== all.lastIndexOf(value) ? 'Duplicate' : undefined
    }) as never

  it('aborts a failing row’s check that another list change superseded', async () => {
    const seen: string[] = []
    const signals: AbortSignal[] = []
    const form = make({
      schema,
      defaultValues: defaults,
      showErrors: 'input',
      rules: { 'members.*.email': duplicate(seen, signals, 30) },
    })
    await warm(form)
    const members = form.field('members')
    for (const email of ['a@x.co', 'a@x.co']) members.push({ email })
    await flush(50)
    expect(members.items[0]!.field.email.error).toBe('Duplicate')
    signals.length = 0
    members.push({ email: 'c@x.co' })
    await flush()
    members.push({ email: 'd@x.co' })
    await flush(50)
    const [first] = signals
    expect(signals.filter((one) => one === first)).toHaveLength(1)
    expect(first!.aborted).toBe(true) // the first recheck was superseded
  })

  it('waits the debounce before a failing row is checked again', async () => {
    const seen: string[] = []
    const form = make({
      schema,
      defaultValues: defaults,
      showErrors: 'input',
      debounce: 20,
      rules: { 'members.*.email': duplicate(seen) },
    })
    await warm(form)
    const members = form.field('members')
    for (const email of ['a@x.co', 'a@x.co']) members.push({ email })
    await flush(40)
    seen.length = 0
    for (const email of ['c@x.co', 'd@x.co', 'e@x.co']) {
      members.push({ email })
      await flush(1)
    }
    await flush(40)
    expect(seen.filter((one) => one === 'a@x.co')).toHaveLength(2) // once per failing row
  })

  it('skips the rows of a whole list written back at their defaults', async () => {
    const seen: string[] = []
    const rows = [{ email: 'a@x.co' }, { email: 'b@x.co' }]
    const form = make({
      schema,
      defaultValues: { username: 'ada', members: rows },
      showErrors: 'input',
      rules: { 'members.*.email': (value) => void seen.push(value) },
    })
    await warm(form)
    form.setValue('members', structuredClone(rows))
    await flush()
    form.model.members!.value = structuredClone(rows)
    await flush()
    expect(seen).toEqual([])
  })

  it('submits right after a list change cleared a duplicate, and a deduping rule ends', async () => {
    const seen: string[] = []
    let submitted = 0
    const form = make({
      schema,
      defaultValues: defaults,
      showErrors: 'input',
      onSubmit: () => void submitted++,
      rules: { 'members.*.email': duplicate(seen) },
    })
    await warm(form)
    const members = form.field('members')
    for (const email of ['a@x.co', 'b@x.co', 'a@x.co']) members.push({ email })
    await flush()
    members.remove(2)
    expect(await form.handleSubmit()).toBe(true)
    expect(submitted).toBe(1)
    // A rule that removes its own duplicate settles.
    const auto = make({
      schema,
      defaultValues: defaults,
      rules: {
        'members.*.email': (value, { values, path }) => {
          seen.push(value)
          const all = (values.members ?? []).map((member) => member.email)
          if (all.indexOf(value) === all.lastIndexOf(value)) return
          auto.field('members').remove(+path.split('.')[1]!)
          return 'Duplicate'
        },
      },
    })
    await warm(auto)
    for (const email of ['a@x.co', 'a@x.co', 'a@x.co']) auto.field('members').push({ email })
    seen.length = 0
    await flush(30)
    expect(seen.length).toBeLessThan(10)
    expect(auto.values.value.members!.length).toBeGreaterThan(0)
  })

  it('keeps the defaults when the rows a field reset put back are edited', async () => {
    const form = make({
      schema,
      defaultValues: { username: 'ada', members: [{ email: 'a@x.co' }] },
    })
    const members = form.field('members')
    members.push({ email: 'b@x.co' })
    members.reset()
    form.field('members.0.email').value = 'z@x.co'
    form.model.members!.value.push({ email: 'c@x.co' })
    ;(form.model.members!.value as any)[0].email = 'y@x.co'
    members.move(0, 1)
    form.reset()
    expect(form.values.value.members).toEqual([{ email: 'a@x.co' }])
    expect(form.dirty.value).toBe(false)
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

  it('submits once a rule that threw passes on the next try', async () => {
    let down = true
    let submitted = 0
    const form = make({
      schema,
      defaultValues: defaults,
      onSubmit: () => void submitted++,
      rules: {
        username: () => {
          if (down) throw new Error('network down')
        },
      },
    })
    form.field('username').value = 'grace'
    await expect(form.handleSubmit()).rejects.toThrow('network down')
    down = false
    expect(await form.handleSubmit()).toBe(true) // the old failure is not thrown again
    expect(submitted).toBe(1)
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
