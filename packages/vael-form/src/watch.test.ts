import { effectScope, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { useForm } from './use-form'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const flush = async () => {
  await nextTick()
  await wait(2)
}

function make<S extends StandardSchemaV1>(options: Parameters<typeof useForm<S>>[0]) {
  const scope = effectScope()
  return Object.assign(
    scope.run(() => useForm(options))!,
    { scope },
  )
}

const schema = z.object({
  country: z.string(),
  state: z.string().optional(),
  plan: z.string(),
  address: z.object({ street: z.string(), zip: z.string() }),
  tags: z.array(z.string()),
})
const defaults = {
  country: 'US',
  state: 'NY',
  plan: 'free',
  address: { street: '', zip: '' },
  tags: [],
}

describe('field.watch', () => {
  it('runs on a user edit, with the new and the old value, and can change another field', async () => {
    const form = make({ schema, defaultValues: defaults })
    const country = form.field('country')
    const state = form.field('state')
    const seen: unknown[] = []
    country.watch(({ value, oldValue }) => {
      seen.push([value, oldValue])
      state.value = undefined
    })
    country.value = 'CA'
    await flush()
    expect(seen).toEqual([['CA', 'US']])
    expect(state.value).toBeUndefined()
  })

  it('runs for setValue and for a list changing, once per tick', async () => {
    const form = make({ schema, defaultValues: defaults })
    let plans = 0
    let tags = 0
    form.field('plan').watch(() => void plans++)
    form.field('tags').watch(() => void tags++)
    form.setValue('plan', 'pro')
    form.field('plan').value = 'team'
    form.field('tags').push('a')
    form.field('tags').push('b')
    await flush()
    expect([plans, tags]).toEqual([1, 1])
  })

  it('does not run for a reset, setValues, a field reset or defaults that load', async () => {
    const loaded = { value: undefined as typeof defaults | undefined }
    const { shallowRef } = await import('vue')
    const source = shallowRef(loaded.value)
    const form = make({ schema, defaultValues: source })
    let runs = 0
    form.field('country').watch(() => void runs++)

    source.value = defaults
    await flush()
    form.field('country').value = 'CA' // a user edit: counts
    await flush()
    expect(runs).toBe(1)

    form.reset()
    await flush()
    form.setValues({ ...defaults, country: 'FR' })
    await flush()
    form.field('country').value = 'DE'
    await flush()
    runs = 0
    form.field('country').reset()
    await flush()
    expect(runs).toBe(0)
  })

  it('does not run again for what its own handler wrote, but other watchers do', async () => {
    const form = make({ schema, defaultValues: defaults })
    let own = 0
    let other = 0
    form.field('plan').watch(() => {
      own++
      form.field('plan').value = 'normalised' // writes to its own field
      form.field('state').value = 'changed' // and to another
    })
    form.field('state').watch(() => void other++)
    form.field('plan').value = 'pro'
    await flush()
    expect(own).toBe(1)
    expect(other).toBe(1)
    expect(form.field('plan').value).toBe('normalised')
  })

  it('waits for the last change when asked to', async () => {
    const form = make({ schema, defaultValues: defaults })
    const seen: unknown[] = []
    form.field('plan').watch(({ value, oldValue }) => void seen.push([value, oldValue]), {
      debounce: 20,
    })
    form.field('plan').value = 'a'
    await wait(5)
    form.field('plan').value = 'ab'
    await wait(5)
    form.field('plan').value = 'abc'
    await wait(50)
    expect(seen).toEqual([['abc', 'free']]) // one call, from before the burst to the end
  })

  it('can run once at the start', () => {
    const form = make({ schema, defaultValues: defaults })
    const seen: unknown[] = []
    form.field('plan').watch(({ value, oldValue }) => void seen.push([value, oldValue]), {
      immediate: true,
    })
    expect(seen).toEqual([['free', undefined]])
  })

  it('watches a group through form.field(), and stops', async () => {
    const form = make({ schema, defaultValues: defaults })
    let runs = 0
    const stop = form.field('address').watch(() => void runs++)
    form.field('address.street').value = 'Main'
    await flush()
    expect(runs).toBe(1)
    stop()
    form.field('address.zip').value = '1'
    await flush()
    expect(runs).toBe(1)
  })

  it('stops with the scope that made the form', async () => {
    const form = make({ schema, defaultValues: defaults })
    let runs = 0
    form.scope.run(() => form.field('plan').watch(() => void runs++))
    form.field('plan').value = 'a'
    await flush()
    form.scope.stop()
    form.field('plan').value = 'b'
    await flush()
    expect(runs).toBe(1)
  })
})

describe('field.watch and a write that changes nothing', () => {
  it('does not make the next reset or setValues look like an edit', async () => {
    const form = make({ schema, defaultValues: defaults })
    const country = form.field('country')
    const seen: unknown[] = []
    country.watch(({ value }) => {
      seen.push(value)
      country.value = value // writes back what it was given: no change
    })
    country.value = 'FR'
    await flush()
    expect(seen).toEqual(['FR'])

    form.setValues({ ...defaults, country: 'DE' })
    country.reset()
    form.reset()
    await flush()
    expect(seen).toEqual(['FR']) // none of those is the user
  })
})
