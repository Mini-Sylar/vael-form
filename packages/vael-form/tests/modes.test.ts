import { afterEach, describe, expect, inject, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from './utils/mount'
import type { Mounted } from './utils/mount'
import Counter from './fixtures/Counter.vue'

let mounted: Mounted | undefined
afterEach(() => mounted?.unmount())

describe('test harness', () => {
  it('compiles the fixture for the current mode', () => {
    const isVapor = '__vapor' in Counter
    expect(isVapor).toBe(inject('mode') !== 'vdom')
  })

  it('mounts and reacts in the current mode', async () => {
    mounted = mount(Counter)
    const button = mounted.host.querySelector('button')!
    expect(button.textContent).toBe('count: 0')

    button.click()
    await nextTick()
    expect(button.textContent).toBe('count: 1')
  })

  it('reads provide/inject from the app', () => {
    mounted = mount(Counter, undefined, (app) => app.provide('label', 'clicks'))
    expect(mounted.host.querySelector('button')!.textContent).toBe('clicks: 0')
  })
})
