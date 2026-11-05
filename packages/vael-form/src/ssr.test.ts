import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { useForm } from './use-form'

const schema = z.object({ email: z.email('Invalid email') })

describe('server rendering', () => {
  it('renders ids, names and the initial value, and shows no error', async () => {
    const App = defineComponent({
      setup() {
        const form = useForm({ schema, defaultValues: { email: 'nope' } })
        const email = form.field('email')
        return () =>
          h('div', [
            h('input', { ...email.attrs, value: email.value }),
            email.error ? h('p', email.error) : null,
            h('output', String(form.valid.value)),
          ])
      },
    })
    const html = await renderToString(createSSRApp(App))
    expect(html).toMatch(/<input[^>]*name="email"/)
    expect(html).toMatch(/id="[^"]+-email"/)
    expect(html).toContain('value="nope"')
    expect(html).not.toContain('Invalid email')
    expect(html).not.toContain('aria-invalid')
  })

  it('gives the same ids on every render', async () => {
    const App = defineComponent({
      setup() {
        const email = useForm({ schema }).field('email')
        return () => h('input', email.attrs)
      },
    })
    expect(await renderToString(createSSRApp(App))).toBe(await renderToString(createSSRApp(App)))
  })
})
