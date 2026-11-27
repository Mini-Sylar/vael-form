import { afterEach, describe, expect, it } from 'vitest'
import { $, flush } from './utils/dom'
import { mount } from './utils/mount'
import type { Mounted } from './utils/mount'
import Choices from './fixtures/Choices.vue'
import Options from './fixtures/Options.vue'

let mounted: Mounted | undefined
afterEach(() => mounted?.unmount())

const at = (name: string) => $(mounted!.host, name)

async function submit() {
  at('submit')!.click()
  await flush()
  await flush()
}

describe('a failed submit whose first invalid field is a group', () => {
  it('focuses the first enabled radio of a fieldset when none is checked', async () => {
    mounted = mount(Choices)
    await submit()
    expect(document.activeElement).toBe(at('plan-pro'))
  })

  it('focuses the first checkbox of a checkbox group', async () => {
    mounted = mount(Choices, { defaultValues: { plan: 'pro', size: 'm' } })
    await submit()
    expect(document.activeElement).toBe(at('topic-vue'))
  })

  it('focuses the checked radio of a radiogroup div', async () => {
    mounted = mount(Choices, { defaultValues: { plan: 'pro', topics: ['vue'], size: 'm' } })
    await submit()
    expect(at('size')!.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(at('size-m'))
  })

  it('does the same when submitted from code', async () => {
    let form: { handleSubmit: () => Promise<boolean> } | undefined
    mounted = mount(Choices, { ready: (made: never) => (form = made) })
    expect(await form!.handleSubmit()).toBe(false)
    await flush()
    expect(document.activeElement).toBe(at('plan-pro'))
  })
})

describe("a failed submit whose first invalid field is a list's own error", () => {
  it('focuses the empty list, described by its error', async () => {
    mounted = mount(Options)
    await submit()
    const list = at('options')!
    expect(document.activeElement).toBe(list)
    expect(list.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(list.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Add an option',
    )
  })

  it('does the same when submitted from code', async () => {
    let form: { handleSubmit: () => Promise<boolean> } | undefined
    mounted = mount(Options, { ready: (made: never) => (form = made) })
    expect(await form!.handleSubmit()).toBe(false)
    await flush()
    expect(document.activeElement).toBe(at('options'))
  })

  it('leaves the list out of the tab order once focus moves on', async () => {
    mounted = mount(Options)
    await submit()
    at('add')!.click()
    await flush()
    expect(document.activeElement).toBe(at('option-0'))
    expect(at('options')!.hasAttribute('tabindex')).toBe(false)
  })
})
