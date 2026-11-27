import { afterEach, beforeAll, expect, it } from 'vitest'
import { $, flush } from './utils/dom'
import { mount } from './utils/mount'
import type { Mounted } from './utils/mount'
import Union from './fixtures/Union.vue'

let mounted: Mounted | undefined
afterEach(() => mounted?.unmount())

// The limits are a chunk of their own; warm it so a busy run can't race the test.
beforeAll(() => import('../src/limits'))

const min = (name: string) => $(mounted!.host, name)?.getAttribute('min')

it('keeps a union field’s attrs on its branch after the field that read them first unmounts', async () => {
  mounted = mount(Union)
  await expect.poll(() => min('pay.amount')).toBe('1')
  $(mounted.host, 'swap')!.click()
  await flush()
  expect(min('second')).toBe('1')
  $(mounted.host, 'cash')!.click()
  await flush()
  expect(min('second')).toBeNull()
})
