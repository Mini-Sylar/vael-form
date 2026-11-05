import { afterEach, describe, expect, it } from 'vitest'
import { $, blur, flush, text, type } from './utils/dom'
import { mount } from './utils/mount'
import type { Mounted } from './utils/mount'
import Model from './fixtures/Model.vue'

let mounted: Mounted | undefined
afterEach(() => mounted?.unmount())

const el = <T extends HTMLElement = HTMLInputElement>(name: string) => $<T>(mounted!.host, name)!
const values = () => JSON.parse(text(mounted!.host, 'values')!)

describe('v-model on form.model', () => {
  it('binds text, number, nested, checkbox, group, radio, select, list rows and a component', async () => {
    mounted = mount(Model, {})
    await flush()
    expect(el('name').value).toBe('')
    expect(el('street').value).toBe('')
    expect(el('tag-a').checked).toBe(true)
    expect(el('plan-free').checked).toBe(true)
    expect(el('member-0').value).toBe('Ada')

    await type(el('name'), 'Ada')
    expect(values().name).toBe('Ada')
    expect(el('child').value).toBe('Ada') // the component sees it
    await type(el('child'), 'Grace') // and writes back
    expect(values().name).toBe('Grace')
    expect(el('name').value).toBe('Grace')

    await type(el('age'), '42')
    expect(values().age).toBe(42)

    await type(el('street'), 'Main St')
    expect(values().address).toEqual({ street: 'Main St' })

    el('agree').click()
    await flush()
    expect(values().agree).toBe(true)

    el('tag-b').click()
    el('tag-a').click()
    await flush()
    expect(values().tags).toEqual(['b'])
    expect(el('tag-b').checked).toBe(true)
    expect(el('tag-a').checked).toBe(false)

    el('plan-pro').click()
    await flush()
    expect(values().plan).toBe('pro')
    expect(el('plan-free').checked).toBe(false)

    const country = el<HTMLSelectElement>('country')
    country.value = 'gh'
    country.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
    expect(values().country).toBe('gh')

    await type(el('member-0'), 'Linus')
    expect(values().members).toEqual([{ name: 'Linus' }])
    el('add').click()
    await flush()
    await type(el('member-1'), 'Grace')
    expect(values().members).toEqual([{ name: 'Linus' }, { name: 'Grace' }])
  })

  it('is the same state as fields: the error, dirty and touched follow a v-model write', async () => {
    mounted = mount(Model, {})
    await flush()
    await type(el('name'), 'ab')
    expect(text(mounted.host, 'name-error')).toBe('')
    await blur(el('name'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    await flush()
    expect(text(mounted.host, 'name-error')).toBe('Too short')
    await type(el('name'), 'Ada')
    await new Promise((resolve) => setTimeout(resolve, 20))
    await flush()
    expect(text(mounted.host, 'name-error')).toBe('')
  })
})
