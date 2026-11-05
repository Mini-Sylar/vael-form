import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { $, flush, text } from './utils/dom'
import { mount } from './utils/mount'
import type { Mounted } from './utils/mount'
import Kitchen from './fixtures/Kitchen.vue'

let mounted: Mounted | undefined
afterEach(() => mounted?.unmount())

describe('a checkbox group with attrs on its fieldset', () => {
  it('is left when focus leaves the group, not when it moves between its boxes', async () => {
    mounted = mount(Kitchen, { showErrors: 'blur' })
    await flush()
    const group = $(mounted.host, 'topics')!
    expect(group.id).toBeTruthy()
    expect(group.getAttribute('name')).toBe('topics')
    expect(mounted.host.querySelectorAll(`[id="${CSS.escape(group.id)}"]`)).toHaveLength(1)

    await userEvent.click($(mounted.host, 'topic-vue')!)
    await userEvent.click($(mounted.host, 'topic-vue')!) // back to none: invalid
    await userEvent.click($(mounted.host, 'topic-ts')!) // still inside the group
    await userEvent.click($(mounted.host, 'topic-ts')!)
    await flush()
    expect(group.getAttribute('aria-invalid')).toBeNull() // not left yet

    await userEvent.click($(mounted.host, 'country')!) // out of the group
    await new Promise((resolve) => setTimeout(resolve, 20))
    await flush()
    expect(group.getAttribute('aria-invalid')).toBe('true')
    const described = group.getAttribute('aria-describedby')!
    expect(text(mounted.host, 'topics-error')).toBeTruthy()
    expect(mounted.host.querySelector(`#${CSS.escape(described)}`)?.textContent?.trim()).toBe(
      text(mounted.host, 'topics-error'),
    )
  })
})
