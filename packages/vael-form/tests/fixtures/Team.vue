<template>
  <form novalidate data-test="form" @submit="form.handleSubmit">
    <ul>
      <li v-for="item in members.items" :key="item.key" data-test="member" :data-key="item.key">
        <input
          v-model="item.field.name.value"
          :data-test="`name-${item.index}`"
          v-bind="item.field.name.attrs"
        />
        <span v-if="item.field.name.error" data-test="item-error">{{ item.field.name.error }}</span>
        <button
          type="button"
          :data-test="`remove-${item.index}`"
          @click="members.remove(item.index)"
        >
          remove
        </button>
      </li>
    </ul>
    <p v-if="members.error" data-test="list-error">{{ members.error }}</p>
    <button type="button" data-test="add" @click="members.push({ name: '' })">add</button>
    <button type="button" data-test="swap" @click="members.swap(0, 1)">swap</button>
    <button type="submit" data-test="submit">save</button>
  </form>
</template>

<script setup lang="ts">
import { z } from 'zod'
import { useForm } from '../../src'

const props = defineProps<{
  handle?: (values: unknown) => unknown
  showErrors?: 'blur' | 'edited'
}>()

const form = useForm({
  schema: z.object({
    members: z.array(z.object({ name: z.string().min(1, 'Name required') })).min(1, 'Add a member'),
  }),
  defaultValues: { members: [{ name: 'Ada' }, { name: 'Grace' }] },
  showErrors: props.showErrors,
  onSubmit: (values) => props.handle?.(values),
})
const members = form.field('members')
</script>
