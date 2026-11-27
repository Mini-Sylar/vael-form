<template>
  <form novalidate data-test="form" @submit="form.handleSubmit">
    <fieldset v-bind="options.attrs" data-test="options">
      <legend>Options</legend>
      <input
        v-for="item in options.items"
        :key="item.key"
        v-model="item.field.label.value"
        v-bind="item.field.label.attrs"
        :data-test="`option-${item.index}`"
      />
    </fieldset>
    <p :id="options.attrs.errorId" data-test="options-error">{{ options.error }}</p>

    <button type="button" data-test="add" @click="add">Add</button>
    <button type="submit" data-test="submit">Send</button>
  </form>
</template>

<script setup lang="ts">
import { nextTick } from 'vue'
import { z } from 'zod'
import { useForm } from '../../src'
import type { Form } from '../../src'

const schema = z.object({
  options: z.array(z.object({ label: z.string().min(1) })).min(1, 'Add an option'),
})

const props = defineProps<{ ready?: (form: Form<typeof schema>) => void }>()

const form = useForm({ schema, defaultValues: { options: [] } })
const options = form.field('options')

// The just-pushed row's input, by the id its attrs give it.
async function add() {
  options.push({ label: '' })
  await nextTick()
  document.getElementById(options.items.at(-1)!.field.label.id)?.focus()
}

props.ready?.(form)
</script>
