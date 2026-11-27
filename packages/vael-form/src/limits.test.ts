import { effectScope, nextTick, watchEffect } from 'vue'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { useForm } from './use-form'

// Counts the union reads, to see which watchers still run.
const reads = vi.hoisted(() => ({ count: 0 }))
vi.mock('./shape', async (load) => {
  const shape = await load<typeof import('./shape')>()
  return {
    ...shape,
    branchOf: (...args: Parameters<typeof shape.branchOf>) => (
      reads.count++,
      shape.branchOf(...args)
    ),
  }
})

const schema = z.object({
  pay: z.discriminatedUnion('type', [
    z.object({ type: z.literal('card'), amount: z.number().min(1) }),
    z.object({ type: z.literal('cash'), amount: z.number().nullable() }),
  ]),
})

const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 5))
}

it('stops a union’s branch watcher with the form, not with the field that read it first', async () => {
  await import('./limits')
  const forms = Array.from({ length: 100 }, () => {
    const scope = effectScope()
    const form = scope.run(() =>
      useForm({ schema, defaultValues: { pay: { type: 'card' } } as never }),
    )!
    const field = (path: string) => form.field(path as never) as { attrs: any; value: unknown }
    // A component that reads attrs, then unmounts while the form stays.
    const reader = effectScope()
    reader.run(() => watchEffect(() => void field('pay.amount').attrs))
    return { scope, reader, field }
  })
  await flush()
  const [first] = forms
  first!.reader.stop()
  first!.field('pay.type').value = 'cash'
  await flush()
  expect(first!.field('pay.amount').attrs.min).toBeUndefined() // the form's own watcher still runs
  for (const { scope } of forms) scope.stop()
  const before = reads.count
  for (const { field } of forms) field('pay.type').value = 'other'
  await flush()
  expect(reads.count - before).toBe(0) // a stopped form's watchers are gone
})

it('reads no list row’s branch again on a keystroke elsewhere in the form', async () => {
  await import('./limits')
  const rows = z.object({ name: z.string(), pays: z.array(schema.shape.pay) })
  const scope = effectScope()
  const form = scope.run(() =>
    useForm({
      schema: rows,
      defaultValues: {
        name: '',
        pays: Array.from({ length: 50 }, () => ({ type: 'card' })),
      } as never,
    }),
  )!
  const field = (path: string) => form.field(path as never) as { attrs: any; value: unknown }
  scope.run(() =>
    watchEffect(() => {
      for (let i = 0; i < 50; i++) void field(`pays.${i}.amount`).attrs
    }),
  )
  await flush()
  const before = reads.count
  for (const name of ['a', 'ab', 'abc']) field('name').value = name
  await flush()
  expect(reads.count - before).toBe(0)
  scope.stop()
})
