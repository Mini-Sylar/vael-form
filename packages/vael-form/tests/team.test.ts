import { afterEach, describe, expect, it, vi } from 'vitest'
import { $, blur, flush, text, type } from './utils/dom'
import { mount } from './utils/mount'
import type { Mounted } from './utils/mount'
import Team from './fixtures/Team.vue'
import Profile from './fixtures/Profile.vue'

let mounted: Mounted | undefined
afterEach(() => mounted?.unmount())

const rows = () => [...mounted!.host.querySelectorAll<HTMLElement>('[data-test="member"]')]
const click = async (name: string) => {
  $(mounted!.host, name)!.click()
  await flush()
}

describe('array fields', () => {
  it('renders one row per item and keeps the same DOM nodes while you type', async () => {
    mounted = mount(Team)
    await flush()
    const before = rows()
    expect(before).toHaveLength(2)

    await type($<HTMLInputElement>(mounted.host, 'name-1')!, 'Grace Hopper')
    expect(rows()).toEqual(before)
  })

  it('keeps the rows of items that stay when one is removed, and adds new ones', async () => {
    mounted = mount(Team)
    await flush()
    const [first, second] = rows()

    await click('remove-0')
    expect(rows()).toEqual([second])
    expect($<HTMLInputElement>(mounted.host, 'name-0')!.value).toBe('Grace')

    await click('add')
    expect(rows()).toHaveLength(2)
    expect(rows()[0]).toBe(second)
    expect(rows()).not.toContain(first)
  })

  it('moves rows without recreating them', async () => {
    mounted = mount(Team)
    await flush()
    const [first, second] = rows()
    await click('swap')
    expect(rows()).toEqual([second, first])
    expect($<HTMLInputElement>(mounted.host, 'name-0')!.value).toBe('Grace')
  })

  it("shows an item's error after it is left, and follows the item when others are removed", async () => {
    mounted = mount(Team, { showErrors: 'blur' })
    await click('add')
    const empty = $<HTMLInputElement>(mounted.host, 'name-2')!
    await blur(empty)
    expect(text(rows()[2]!, 'item-error')).toBe('Name required')

    await click('remove-0')
    expect(text(rows()[1]!, 'item-error')).toBe('Name required')
    expect(text(rows()[0]!, 'item-error')).toBeUndefined()
  })

  it('shows a list error on submit when the list is empty', async () => {
    const handle = vi.fn()
    mounted = mount(Team, { handle })
    await click('remove-0')
    await click('remove-0')
    await click('submit')
    await flush()
    expect(text(mounted.host, 'list-error')).toBe('Add a member')
    expect(handle).not.toHaveBeenCalled()
  })
})

describe('useField', () => {
  it('lets a reusable input bind to the form above it by name', async () => {
    mounted = mount(Profile, { showErrors: 'blur' })
    const first = $<HTMLInputElement>(mounted.host, 'first')!
    await blur(first)
    expect(text(mounted.host, 'first-error')).toBe('First required')
    expect(text(mounted.host, 'last-error')).toBeUndefined()

    await type(first, 'Ada')
    expect(text(mounted.host, 'first-error')).toBeUndefined()
  })

  it('feeds the form-level error summary', async () => {
    mounted = mount(Profile)
    await click('submit')
    await flush()
    expect(text(mounted.host, 'summary')).toBe('first:First required,last:Last required')
  })
})
