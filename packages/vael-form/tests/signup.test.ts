import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { $, blur, flush, text, type } from './utils/dom'
import { mount } from './utils/mount'
import type { Mounted } from './utils/mount'
import { signupSchemas, zodSignup } from './schemas'
import Signup from './fixtures/Signup.vue'
import LibraryField from './fixtures/LibraryField.vue'

let mounted: Mounted | undefined
afterEach(() => mounted?.unmount())

const input = (name: string) => $<HTMLInputElement>(mounted!.host, name)!
const shown = (name: string) => text(mounted!.host, name)

describe.each(Object.entries(signupSchemas))('%s schema', (_name, schema) => {
  it('submitted from code, with no <form>, still focuses the first invalid field', async () => {
    let form: { handleSubmit: (event?: Event) => Promise<boolean> } | undefined
    mounted = mount(Signup, { schema, ready: (f: never) => (form = f) })
    await type(input('password'), 'x')

    expect(await form!.handleSubmit()).toBe(false)
    await flush()
    expect(document.activeElement).toBe(input('email'))
  })

  it('finds a field a component library renamed, by the error id it describes itself with', async () => {
    let form: { handleSubmit: (event?: Event) => Promise<boolean> } | undefined
    mounted = mount(LibraryField, { schema, ready: (f: never) => (form = f) })

    expect(await form!.handleSubmit()).toBe(false)
    await flush()
    expect(document.activeElement).toBe(input('email'))
    expect(input('email').id).toBe('library-email')
  })

  it('shows nothing until the field is left, then keeps up as you type', async () => {
    mounted = mount(Signup, { schema })
    await flush()
    expect(shown('email-error')).toBeUndefined()

    await type(input('email'), 'nope')
    expect(shown('email-error')).toBeUndefined()

    await blur(input('email'))
    expect(shown('email-error')).toBe('Invalid email')

    await type(input('email'), 'me@example.com')
    expect(shown('email-error')).toBeUndefined()
    expect(shown('password-error')).toBeUndefined()
  })

  it('wires aria-invalid and aria-describedby to the visible error', async () => {
    mounted = mount(Signup, { schema })
    const email = input('email')
    expect(email.hasAttribute('aria-invalid')).toBe(false)

    await type(email, 'nope')
    await blur(email)
    expect(email.getAttribute('aria-invalid')).toBe('true')
    const described = email.getAttribute('aria-describedby')!
    expect(mounted.host.querySelector(`#${CSS.escape(described)}`)?.textContent?.trim()).toBe(
      'Invalid email',
    )
  })

  it('hands the handler the validated values and prevents the default submit', async () => {
    const handle = vi.fn()
    mounted = mount(Signup, { schema, handle })
    await type(input('email'), 'me@example.com')
    await type(input('password'), 'long enough')

    const event = new Event('submit', { cancelable: true, bubbles: true })
    $(mounted.host, 'form')!.dispatchEvent(event)
    await flush()

    expect(event.defaultPrevented).toBe(true)
    expect(handle).toHaveBeenCalledTimes(1)
    expect(handle.mock.calls[0]![0]).toEqual({ email: 'me@example.com', password: 'long enough' })
  })

  it('on an invalid submit shows every error, focuses the first and skips the handler', async () => {
    const handle = vi.fn()
    const handleInvalid = vi.fn()
    mounted = mount(Signup, { schema, handle, handleInvalid })
    const host = mounted.host
    document.body.append(host)

    $(host, 'submit')!.click()
    await flush()
    await flush()

    expect(handle).not.toHaveBeenCalled()
    expect(handleInvalid).toHaveBeenCalledTimes(1)
    expect(shown('email-error')).toBeTruthy()
    expect(shown('password-error')).toBeTruthy()
    expect(document.activeElement).toBe(input('email'))
  })
})

describe('the default mode', () => {
  it('does not scold an empty field that was only passed over', async () => {
    mounted = mount(Signup, { schema: zodSignup })
    await flush()
    input('email').focus()
    await blur(input('email'))
    expect(shown('email-error')).toBeUndefined()

    await type(input('email'), 'nope')
    await blur(input('email'))
    expect(shown('email-error')).toBe('Invalid email')
  })
})

describe('a click that causes an error to appear', () => {
  it('is not lost when the error moves the button away', async () => {
    const handleInvalid = vi.fn()
    mounted = mount(Signup, { schema: zodSignup, handleInvalid })
    await flush()
    await userEvent.fill(input('email'), 'nope')
    // A real mouse press: the field loses focus on mouse-down, the error line appears above the
    // button, and the button is no longer under the pointer by mouse-up.
    await userEvent.click($(mounted.host, 'submit')!)
    await flush()
    await flush()
    expect(handleInvalid).toHaveBeenCalledTimes(1)
    expect(shown('email-error')).toBe('Invalid email')
  })
})

describe('a browser autofilling the fields', () => {
  /** What Chrome sends for a field it fills, in its order, while the field matches :autofill. */
  function autofill(field: HTMLInputElement, value: string) {
    Object.defineProperty(field, 'matches', {
      value: (selector: string) => selector === ':autofill',
      configurable: true,
    })
    field.dispatchEvent(new FocusEvent('focus'))
    field.dispatchEvent(new KeyboardEvent('keydown'))
    field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
    field.dispatchEvent(new KeyboardEvent('keyup'))
    field.dispatchEvent(new FocusEvent('blur'))
    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  }

  it('does not count the blur it sends as the user leaving the field', async () => {
    mounted = mount(Signup, { schema: zodSignup })
    await flush()
    autofill(input('email'), 'not-an-email')
    await flush()
    expect(shown('email-error')).toBeUndefined() // the value arrived, but nobody left the field
    expect(shown('state')).toContain('|true|') // the form knows it changed (dirty)

    // tabbing through it without typing is not leaving a field the user edited either
    await blur(input('email'))
    expect(shown('email-error')).toBeUndefined()

    // typing ends the autofilled state; leaving it then counts
    delete (input('email') as { matches?: unknown }).matches
    await type(input('email'), 'still-not-an-email')
    await blur(input('email'))
    expect(shown('email-error')).toBe('Invalid email')
  })

  it('still shows an autofilled value that is wrong when the form is submitted', async () => {
    const handleInvalid = vi.fn()
    mounted = mount(Signup, { schema: zodSignup, handleInvalid })
    await flush()
    autofill(input('email'), 'not-an-email')
    $(mounted.host, 'submit')!.click()
    await flush()
    await flush()
    expect(handleInvalid).toHaveBeenCalledTimes(1)
    expect(shown('email-error')).toBe('Invalid email')
  })
})

describe('leaving a field with the mouse held down', () => {
  it('waits for the release to show the error, and leaving with the keyboard does not wait', async () => {
    mounted = mount(Signup, { schema: zodSignup })
    await flush()
    await type(input('email'), 'nope')
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await blur(input('email'))
    expect(shown('email-error')).toBeUndefined() // the press is still down

    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    await flush()
    expect(shown('email-error')).toBe('Invalid email')

    await type(input('password'), 'x')
    await blur(input('password')) // no pointer: it shows at once
    expect(shown('password-error')).toBeTruthy()
  })

  it('does not touch a field again after the click it was waiting for reset the form', async () => {
    let form!: { reset: () => void }
    mounted = mount(Signup, {
      schema: zodSignup,
      ready: (value: { reset: () => void }) => (form = value),
    })
    await flush()
    await type(input('email'), 'x')
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await blur(input('email'))
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    form.reset() // the click handler, run right after the release

    await new Promise((resolve) => setTimeout(resolve, 20))
    await type(input('email'), 'nope') // typing again: the field was not left since the reset
    expect(shown('email-error')).toBeUndefined()
  })
})

describe('showErrors', () => {
  it("'input' shows an error as soon as the value changed", async () => {
    mounted = mount(Signup, { schema: zodSignup, showErrors: 'input' })
    await type(input('email'), 'nope')
    expect(shown('email-error')).toBe('Invalid email')
    expect(shown('password-error')).toBeUndefined()
  })

  it("'submit' waits for a submit, then stays live", async () => {
    mounted = mount(Signup, { schema: zodSignup, showErrors: 'submit' })
    await type(input('email'), 'nope')
    await blur(input('email'))
    expect(shown('email-error')).toBeUndefined()

    $(mounted.host, 'submit')!.click()
    await flush()
    await flush()
    expect(shown('email-error')).toBe('Invalid email')

    await type(input('email'), 'me@example.com')
    expect(shown('email-error')).toBeUndefined()
  })
})

describe('rules', () => {
  const rules = {
    email: async (value: string) =>
      value === 'taken@example.com' ? 'Already registered' : undefined,
  }
  const settle = async (ms = 80) => {
    await new Promise((resolve) => setTimeout(resolve, ms))
    await flush()
  }

  it('shows a rule’s error, with a pending state while it checks', async () => {
    mounted = mount(Signup, { schema: zodSignup, showErrors: 'input', debounce: 10, rules })
    await settle() // the rule code loads on first use
    await type(input('email'), 'taken@example.com')
    expect(shown('email-pending')).toBe('checking')
    await settle()
    expect(shown('email-error')).toBe('Already registered')
    expect(shown('email-pending')).toBeUndefined()

    await type(input('email'), 'free@example.com')
    await settle()
    expect(shown('email-error')).toBeUndefined()
  })

  it('stops a submit on a rule error, and submits once it is clean', async () => {
    const handle = vi.fn()
    mounted = mount(Signup, {
      schema: zodSignup,
      rules,
      debounce: 500,
      handle,
      defaultValues: { email: '', password: '' },
    })
    await type(input('email'), 'taken@example.com')
    await type(input('password'), 'long enough')
    $(mounted.host, 'submit')!.click()
    await settle()
    expect(handle).not.toHaveBeenCalled()
    expect(shown('email-error')).toBe('Already registered')

    await type(input('email'), 'free@example.com')
    $(mounted.host, 'submit')!.click()
    await settle()
    expect(handle).toHaveBeenCalledTimes(1)
  })
})

describe('form state', () => {
  it('tracks dirty, valid and the submit count', async () => {
    mounted = mount(Signup, { schema: zodSignup, defaultValues: { email: '', password: '' } })
    await flush()
    expect(shown('state')).toBe('0|false|false|false|0')

    await type(input('email'), 'me@example.com')
    expect(shown('state')).toBe('0|false|true|false|0')

    await type(input('password'), 'long enough')
    expect(shown('state')).toBe('0|true|true|false|0')
  })

  it('resets to the initial values with nothing touched', async () => {
    let form: { reset: () => void } | undefined
    mounted = mount(Signup, {
      schema: zodSignup,
      defaultValues: { email: 'a@b.co', password: '' },
      ready: (f: never) => (form = f),
    })
    await type(input('email'), 'nope')
    await blur(input('email'))
    expect(shown('email-error')).toBeTruthy()

    form!.reset()
    await flush()
    expect(input('email').value).toBe('a@b.co')
    expect(shown('email-error')).toBeUndefined()
    expect(shown('state')!.startsWith('0|')).toBe(true)
  })
})
