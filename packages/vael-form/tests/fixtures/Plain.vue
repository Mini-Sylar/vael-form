<template>
  <form novalidate data-test="form" @submit="form.handleSubmit">
    <input v-model="email.value" data-test="email" v-bind="email.attrs" />
    <p :id="email.errorId" data-test="email-error">{{ email.error }}</p>
    <input v-model.number="age.value" data-test="age" type="number" v-bind="age.attrs" />
    <p :id="age.errorId" data-test="age-error">{{ age.error }}</p>
    <button type="submit" data-test="submit">Send</button>
  </form>
</template>

<script setup lang="ts">
import { useForm } from '../../src'

const props = defineProps<{ handle: (values: unknown) => void }>()

// Plain functions, written once and reused: no schema library anywhere.
const required = (value: unknown) => !value && 'Required'
const pattern = (re: RegExp, message: string) => (value: string) =>
  !value || re.test(value) || message

const form = useForm({
  defaultValues: { email: '', age: 0 },
  validate: {
    email: [required, pattern(/^\S+@\S+\.\S+$/, 'Not an email')],
    age: (value) => value >= 18 || 'Too young',
  },
  onSubmit: (values) => props.handle(values),
})
const email = form.field('email')
const age = form.field('age')
</script>
