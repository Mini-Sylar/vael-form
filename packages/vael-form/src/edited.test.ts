import { effectScope, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { useForm } from './use-form'

const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 5))
}

function make<S extends StandardSchemaV1>(options: Parameters<typeof useForm<S>>[0]) {
  return effectScope().run(() => useForm(options))!
}

async function warm(form: { valid: { value: boolean } }) {
  void form.valid.value
  await flush()
}

const schema = z.object({
  name: z.string().min(2, 'Too short'),
  tags: z.array(z.string()).min(1, 'Add a tag'),
  members: z.array(z.object({ name: z.string().min(1, 'Required') })),
})
const defaults = { name: '', tags: [], members: [] }

describe("showErrors: 'edited' (the default)", () => {
  it('says nothing about a field that was only passed over', async () => {
    const form = make({ schema, defaultValues: defaults })
    await warm(form)
    form.field('name').touch()
    expect(form.field('name').error).toBeUndefined()
  })

  it('says nothing while the field is still being typed in, then shows once it is left', async () => {
    const form = make({ schema, defaultValues: defaults })
    await warm(form)
    form.field('name').value = 'a'
    expect(form.field('name').error).toBeUndefined()
    form.field('name').touch()
    expect(form.field('name').error).toBe('Too short')
    form.field('name').value = 'ab' // and then it keeps up
    await flush()
    expect(form.field('name').error).toBeUndefined()
  })

  it('shows everything after a submit, edited or not', async () => {
    const form = make({ schema, defaultValues: defaults })
    await form.handleSubmit()
    expect(form.field('name').error).toBe('Too short')
    expect(form.field('tags').error).toBe('Add a tag')
  })

  it('does not scold a new list item, only the one that was left after typing', async () => {
    const form = make({ schema, defaultValues: { ...defaults, members: [{ name: '' }] } })
    await warm(form)
    const members = form.field('members')
    members.items[0]!.field.name.touch() // left an empty row (what clicking "Add" does)
    members.push({ name: '' })
    expect(members.items[0]!.field.name.error).toBeUndefined()
    expect(members.items[1]!.field.name.error).toBeUndefined()

    members.items[1]!.field.name.value = 'x'
    members.items[1]!.field.name.value = ''
    members.items[1]!.field.name.touch()
    await flush()
    expect(members.items[1]!.field.name.error).toBe('Required')
  })

  it('forgets what was edited on a reset, and follows an item when the list changes', async () => {
    const form = make({
      schema,
      defaultValues: { ...defaults, members: [{ name: 'a' }, { name: 'b' }] },
    })
    await warm(form)
    const members = form.field('members')
    members.items[1]!.field.name.value = ''
    members.items[1]!.field.name.touch()
    await flush()
    expect(members.items[1]!.field.name.error).toBe('Required')
    members.remove(0)
    await flush()
    expect(members.items[0]!.field.name.error).toBe('Required') // it moved with its item

    form.reset()
    await flush()
    expect(form.field('members').items[0]!.field.name.error).toBeUndefined()
  })

  it("'blur' still shows an unedited field once it is left, and a per-path mix works", async () => {
    const form = make({
      schema,
      defaultValues: defaults,
      showErrors: { default: 'edited', name: 'blur' },
    })
    await warm(form)
    form.field('name').touch()
    form.field('tags').touch()
    expect(form.field('name').error).toBe('Too short')
    expect(form.field('tags').error).toBeUndefined()
  })
})

describe('untouch and clear', () => {
  it('untouch hides the errors again, until the field is left once more', async () => {
    const form = make({ schema, defaultValues: defaults, showErrors: 'blur' })
    await warm(form)
    form.field('name').touch()
    expect(form.field('name').error).toBe('Too short')
    form.field('name').untouch()
    expect(form.field('name').touched).toBe(false)
    expect(form.field('name').error).toBeUndefined()
    form.field('name').touch()
    expect(form.field('name').error).toBe('Too short')
  })

  it('clear empties a list', async () => {
    const form = make({ schema, defaultValues: { ...defaults, tags: ['a', 'b'] } })
    form.field('tags').clear()
    expect(form.field('tags').items).toHaveLength(0)
    expect(form.values.value.tags).toEqual([])
    expect(form.dirty.value).toBe(true)
  })
})

describe('a row added after a submit or a step check', () => {
  it('stays quiet until it is left, and the next submit shows it', async () => {
    const form = make({ schema, defaultValues: { ...defaults, members: [{ name: 'Ada' }] } })
    await form.handleSubmit()
    form.field('members').push({ name: '' })
    await flush()
    const added = form.field('members').items[1]!.field.name
    expect(added.error).toBeUndefined() // it was not part of the submit

    added.touch() // the user left it
    expect(added.error).toBe('Required')

    form.field('members').push({ name: '' })
    await flush()
    const another = form.field('members').items[2]!.field.name
    expect(another.error).toBeUndefined()
    await form.handleSubmit()
    expect(another.error).toBe('Required') // asking for the whole form shows it
  })

  it('stays quiet after validate(group), and moves with the rows', async () => {
    const form = make({ schema, defaultValues: { ...defaults, members: [{ name: '' }] } })
    await form.validate('members')
    expect(form.field('members').items[0]!.field.name.error).toBe('Required')

    form.field('members').push({ name: '' })
    form.field('members').insert(0, { name: '' })
    await flush()
    const [first, second, third] = form.field('members').items.map((item) => item.field.name)
    expect(first!.error).toBeUndefined() // inserted
    expect(second!.error).toBe('Required') // the checked row moved down
    expect(third!.error).toBeUndefined() // pushed

    form.field('members').swap(0, 1)
    await flush()
    expect(form.field('members').items[0]!.field.name.error).toBe('Required')
    expect(form.field('members').items[1]!.field.name.error).toBeUndefined()

    await form.validate('members')
    expect(form.field('members').items[1]!.field.name.error).toBe('Required')
  })
})
