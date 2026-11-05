import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { $, blur, flush, text, type } from './utils/dom'
import { mount } from './utils/mount'
import type { Mounted } from './utils/mount'
import Plain from './fixtures/Plain.vue'

// The validator is a chunk of its own; warm it so a busy run can't race the first check.
beforeAll(() => import('../src/validator'))

let mounted: Mounted | undefined
afterEach(() => mounted?.unmount())

const el = (name: string) => $<HTMLInputElement>(mounted!.host, name)!
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 30))
  await flush()
}

describe('validating with plain functions, no schema library', () => {
  it('validates with a regex rule, shows errors like any form, and submits when clean', async () => {
    const handle = vi.fn()
    mounted = mount(Plain, { handle })
    await settle() // the validator's code loads as the form is made

    await type(el('email'), 'nope')
    await blur(el('email'))
    await settle()
    expect(text(mounted.host, 'email-error')).toBe('Not an email')

    el('submit').click()
    await settle()
    expect(handle).not.toHaveBeenCalled()
    expect(text(mounted.host, 'age-error')).toBe('Too young')

    await type(el('email'), 'a@b.co')
    await type(el('age'), '30')
    el('submit').click()
    await settle()
    expect(handle).toHaveBeenCalledWith({ email: 'a@b.co', age: 30 })
  })
})
