import { effectScope, nextTick } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
import { msg } from './i18n'
import { useForm } from './use-form'
import { validator } from './validator'

const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 5))
}

// A form loads the validator's code as it is made; tests warm it so a slow machine can't race them.
beforeAll(() => import('./validator'))

// The reusable part: plain functions, nothing to learn.
const required = (v: unknown) => !v && 'Required'
const pattern = (re: RegExp, message: string) => (v: string) => !v || re.test(v) || message
const email = pattern(/^\S+@\S+\.\S+$/, 'Not an email')
const min = (n: number) => (v: number) => v >= n || `At least ${n}`

type Values = { email: string; age: number; password: string; confirm: string }

describe('validator', () => {
  const signup = validator<Values>({
    email: [required, email],
    age: min(18),
    confirm: (v, { values }) => v === values.password || 'Must match',
  })
  const run = (values: unknown) => signup['~standard'].validate(values)

  it('is a Standard Schema: it can run anywhere, a server or a test', async () => {
    expect(await run({ email: 'a@b.co', age: 30, password: 'x', confirm: 'x' })).toEqual({
      value: { email: 'a@b.co', age: 30, password: 'x', confirm: 'x' },
    })
    const bad = (await run({ email: 'nope', age: 3, password: 'x', confirm: 'y' })) as unknown as {
      issues: { message: string; path: string[] }[]
    }
    expect(bad.issues).toEqual([
      { message: 'Not an email', path: ['email'] },
      { message: 'At least 18', path: ['age'] },
      { message: 'Must match', path: ['confirm'] },
    ])
  })

  it('runs an array of rules in order, and the first failure is the error', async () => {
    const empty = (await run({ email: '', age: 30, password: '', confirm: '' })) as unknown as {
      issues: { message: string }[]
    }
    expect(empty.issues.map((i) => i.message)).toEqual(['Required']) // not also "Not an email"
  })

  it('treats nothing, true and false as a pass, and a list as several messages', async () => {
    const schema = validator<{ a: string; b: string; c: string }>({
      a: () => true,
      b: () => undefined,
      c: () => ['One', 'Two'],
    })
    const result = (await schema['~standard'].validate({ a: '', b: '', c: '' })) as unknown as {
      issues: { message: string }[]
    }
    expect(result.issues.map((i) => i.message)).toEqual(['One', 'Two'])
  })

  it("puts a list item's rules on every item, and the form's own rule under ''", async () => {
    const schema = validator<{ members: { name: string }[] }>({
      'members.*.name': required,
      '': (values) => values.members.length > 0 || 'Add a member',
    })
    const result = (await schema['~standard'].validate({
      members: [{ name: 'a' }, { name: '' }],
    })) as unknown as {
      issues: { message: string; path: string[] }[]
    }
    expect(result.issues).toEqual([{ message: 'Required', path: ['members', '1', 'name'] }])
    const none = (await schema['~standard'].validate({ members: [] })) as unknown as {
      issues: { path: string[] }[]
    }
    expect(none.issues).toEqual([{ message: 'Add a member', path: [] }])
  })

  it('lets a rule be async, which makes the validation async', async () => {
    const schema = validator<{ name: string }>({
      name: [required, async (v) => (await Promise.resolve(v === 'taken')) && 'Already taken'],
    })
    const result = schema['~standard'].validate({ name: 'taken' })
    expect(result).toBeInstanceOf(Promise)
    expect(await result).toEqual({ issues: [{ message: 'Already taken', path: ['name'] }] })
    expect(await schema['~standard'].validate({ name: 'free' })).toEqual({
      value: { name: 'free' },
    })
  })
})

describe('useForm with validate', () => {
  const scoped = <R>(fn: () => R): R => effectScope().run(fn)!

  it('validates, shows errors like a schema does, and submits the values', async () => {
    let submitted: unknown
    const form = scoped(() =>
      useForm({
        defaultValues: { email: '', age: 0 },
        validate: { email: [required, email], age: min(18) },
        onSubmit: (values) => void (submitted = values),
      }),
    )
    void form.valid.value
    await flush()
    expect(form.valid.value).toBe(false)
    expect(form.field('email').error).toBeUndefined() // nothing shown before it is earned

    expect(await form.handleSubmit()).toBe(false)
    expect(form.field('email').error).toBe('Required')
    expect(form.field('age').error).toBe('At least 18')

    form.field('email').value = 'a@b.co'
    form.field('age').value = 30
    expect(await form.handleSubmit()).toBe(true)
    expect(submitted).toEqual({ email: 'a@b.co', age: 30 })
  })

  it('takes a message key, so it translates like any other', async () => {
    const form = scoped(() =>
      useForm({
        defaultValues: { name: '' },
        validate: { name: () => msg('errors.required', undefined, 'Name please') },
      }),
    )
    await form.handleSubmit()
    expect(form.field('name').error).toBe('Name please')
  })

  it('handles a union with the type named, and checks only the active branch', async () => {
    type Payment = { type: 'card'; number: string } | { type: 'bank'; iban: string }
    const form = scoped(() =>
      useForm<Payment>({
        defaultValues: { type: 'card', number: '' },
        validate: {
          number: (v, { values }) => values.type === 'card' && !v && 'Required',
          iban: (v, { values }) => values.type === 'bank' && !v && 'Required',
        },
      }),
    )
    await form.handleSubmit()
    expect(form.field('number').error).toBe('Required')
    expect(form.field('iban').valid).toBe(true)

    form.field('type').value = 'bank'
    await flush()
    expect(form.field('number').valid).toBe(true)
    expect(form.field('iban').valid).toBe(false)
  })
})

describe('onSubmit formData', () => {
  it('is the submitted values as multipart, with the names the inputs have', async () => {
    let data: FormData | undefined
    const form = effectScope().run(() =>
      useForm({
        defaultValues: {
          name: 'Ada',
          age: 36,
          admin: false,
          born: new Date('1815-12-10T00:00:00Z'),
          nick: null as string | null,
          avatar: new File(['x'], 'me.png'),
          address: { street: 'Main' },
          members: [{ name: 'a' }, { name: 'b' }],
        },
        validate: {},
        onSubmit: (_, { formData }) => void (data = formData),
      }),
    )!
    await form.handleSubmit()
    expect(data!.get('name')).toBe('Ada')
    expect(data!.get('age')).toBe('36')
    expect(data!.get('admin')).toBe('false')
    expect(data!.get('born')).toBe('1815-12-10T00:00:00.000Z')
    expect(data!.has('nick')).toBe(false)
    expect((data!.get('avatar') as File).name).toBe('me.png')
    expect(data!.get('address.street')).toBe('Main')
    expect(data!.get('members.0.name')).toBe('a')
    expect(data!.get('members.1.name')).toBe('b')
  })

  it('adds the pressed submit button, as a native submit does', async () => {
    let data: FormData | undefined
    const form = effectScope().run(() =>
      useForm({
        defaultValues: { name: 'Ada' },
        validate: {},
        onSubmit: (_, { formData }) => void (data = formData),
      }),
    )!
    const submitter = { name: 'action', value: 'draft' } as HTMLButtonElement
    await form.handleSubmit({ preventDefault() {}, submitter } as unknown as SubmitEvent)
    expect(data!.get('action')).toBe('draft')
  })
})
