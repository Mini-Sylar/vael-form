import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, inject, it, vi } from 'vitest'
import { zodSignup } from './schemas'
import Signup from './fixtures/Signup.vue'

// Vapor has no server renderer yet; the VDOM project is where a server render can be checked.
describe.skipIf(inject('mode') !== 'vdom')('hydration', () => {
  it('hydrates the server render without a mismatch, and then works', async () => {
    const props = { schema: zodSignup, defaultValues: { email: 'a@b.co', password: '' } }
    const html = await renderToString(createSSRApp(Signup, props))

    const host = document.createElement('div')
    host.innerHTML = html
    document.body.append(host)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const app = createSSRApp(Signup, props)
    app.mount(host)
    await Promise.resolve()

    expect(warn.mock.calls.filter(([message]) => String(message).includes('mismatch'))).toEqual([])
    const email = host.querySelector<HTMLInputElement>('[data-test="email"]')!
    expect(email.value).toBe('a@b.co')
    expect(email.id).toMatch(/-email$/)

    email.value = 'nope'
    email.dispatchEvent(new Event('input', { bubbles: true }))
    email.dispatchEvent(new FocusEvent('blur'))
    email.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(host.querySelector('[data-test="email-error"]')).not.toBeNull()

    warn.mockRestore()
    app.unmount()
    host.remove()
  })
})
