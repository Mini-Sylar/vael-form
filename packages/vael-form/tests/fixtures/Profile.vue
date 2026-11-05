<template>
  <form novalidate data-test="form" @submit="form.handleSubmit">
    <FieldInput name="first" label="First" />
    <FieldInput name="last" label="Last" />
    <button type="submit" data-test="submit">save</button>
    <output data-test="summary">{{
      errorList.map((e) => `${e.path}:${e.message}`).join(',')
    }}</output>
  </form>
</template>

<script setup lang="ts">
import { z } from 'zod'
import { useForm } from '../../src'
import FieldInput from './FieldInput.vue'

const props = defineProps<{ showErrors?: 'blur' | 'edited' }>()

const form = useForm({
  schema: z.object({
    first: z.string().min(1, 'First required'),
    last: z.string().min(1, 'Last required'),
  }),
  defaultValues: { first: '', last: '' },
  showErrors: props.showErrors,
})
const { errorList } = form
</script>
