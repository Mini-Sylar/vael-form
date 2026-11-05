import { afterEach, describe, expect, it, vi } from 'vitest'
import { $, blur, flush, text, type } from './utils/dom'
import { mount } from './utils/mount'
import type { Mounted } from './utils/mount'
import Kitchen from './fixtures/Kitchen.vue'

let mounted: Mounted | undefined
afterEach(() => mounted?.unmount())

const el = <T extends HTMLElement = HTMLInputElement>(name: string) => $<T>(mounted!.host, name)!

async function click(name: string) {
  el(name).click()
  await flush()
}

async function choose(value: string) {
  const select = el<HTMLSelectElement>('country')
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await flush()
}

describe('every kind of input, and transforms before submit', () => {
  it('submits what the schema returns, from native inputs of every kind', async () => {
    const handle = vi.fn()
    mounted = mount(Kitchen, { handle })
    await type(el('name'), '  Ada  ')
    await type(el('email'), '  Ada@Example.COM ')
    await type(el('age'), '36')
    await type(el('bio'), 'writes programs')
    await type(el('birthday'), '1815-12-10')
    await type(el('price'), '12.5')
    await click('newsletter')
    await click('topic-vue')
    await click('topic-css')
    await click('plan-pro')
    await choose('gh')

    el('submit').click()
    await flush()
    await flush()

    expect(handle).toHaveBeenCalledTimes(1)
    const values = handle.mock.calls[0]![0] as Record<string, unknown>
    expect(values).toMatchObject({
      name: 'Ada', // trimmed
      email: 'ada@example.com', // trimmed and lowercased before the email check
      age: 36, // v-model.number
      bio: 'writes programs',
      price: 12.5, // transform to a number
      newsletter: true,
      topics: ['vue', 'css'],
      plan: 'pro',
      country: 'gh',
    })
    expect(values.birthday).toBeInstanceOf(Date)
    expect((values.birthday as Date).getUTCFullYear()).toBe(1815)

    // the form element is there to read, and the values come as multipart, from state and not the page
    const context = handle.mock.calls[0]![1] as {
      element: HTMLFormElement | null
      formData: FormData
    }
    expect(context.element).toBeInstanceOf(HTMLFormElement)
    expect(() => new FormData(context.element!)).not.toThrow()
    expect(context.formData.get('name')).toBe('Ada')
    expect(context.formData.get('age')).toBe('36')
    expect(context.formData.get('newsletter')).toBe('true')
    expect(context.formData.get('topics.0')).toBe('vue')
    expect(context.formData.get('topics.1')).toBe('css')
  })

  it('shows what is missing, and keeps a checkbox group and a radio in step with the form', async () => {
    mounted = mount(Kitchen, { handle: vi.fn() })
    el('submit').click()
    await flush()
    await flush()
    expect(text(mounted.host, 'name-error')).toBeTruthy()
    expect(text(mounted.host, 'topics-error')).toBeTruthy()

    await click('topic-ts')
    expect(text(mounted.host, 'topics-error')).toBeUndefined()
    expect(el('topic-ts').checked).toBe(true)
    await click('plan-pro')
    expect(el('plan-pro').checked).toBe(true)
    expect(el('plan-free').checked).toBe(false)
    await blur(el('name'))
  })
})
