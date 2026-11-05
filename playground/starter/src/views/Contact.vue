<template>
  <h1>Contact us</h1>
  <form novalidate @submit="onSubmit">
    <FormInput name="name" label="Name" />
    <FormInput name="email" label="Email" />
    <div class="field">
      <label :for="attrs.topic.id">Topic</label>
      <select v-model="topic" v-bind="attrs.topic">
        <option value="">Choose…</option>
        <option value="sales">Sales</option>
        <option value="support">Support</option>
      </select>
      <p :id="attrs.topic.errorId" class="error">{{ errors.topic }}</p>
    </div>
    <div v-if="topic === 'support'" class="field">
      <label :for="attrs.order.id">Order number</label>
      <input v-model="order" v-bind="attrs.order" />
      <p :id="attrs.order.errorId" class="error">{{ errors.order }}</p>
    </div>
    <div class="field">
      <label :for="attrs.message.id">Message</label>
      <textarea v-model="message" rows="4" v-bind="attrs.message"></textarea>
      <p :id="attrs.message.errorId" class="error">{{ errors.message }}</p>
    </div>
    <div class="actions">
      <button class="primary" :disabled="submitting">Send</button>
    </div>
    <p v-if="sent" class="ok">{{ sent }}</p>
  </form>
</template>

<script setup lang="ts">
import { shallowRef } from 'vue'
import { useForm } from 'vael-form'
import FormInput from '../components/FormInput.vue'

// No schema library: plain functions.
const required = (v: unknown) => !v && 'Required'
const pattern = (re: RegExp, message: string) => (v: string) => !v || re.test(v) || message
const isEmail = pattern(/^\S+@\S+\.\S+$/, 'Not an email')
const min = (n: number) => (v: string) => !v || v.length >= n || `At least ${n} characters`

interface Values {
  name: string
  email: string
  topic: 'sales' | 'support' | ''
  order?: string
  message: string
}

const sent = shallowRef('')

const { model, errors, attrs, handleSubmit, submitting } = useForm<Values>({
  defaultValues: { name: '', email: '', topic: '', message: '' },
  validate: {
    name: required,
    email: [required, isEmail],
    topic: required,
    order: (v, { values }) =>
      values.topic === 'support' && !v && 'Order number is required for support',
    message: [required, min(20)],
  },
})
const { topic, order, message } = model

// Our own function, no onSubmit option: handleSubmit makes the handler.
const onSubmit = handleSubmit(async (values) => {
  await new Promise((resolve) => setTimeout(resolve, 300))
  sent.value = `Thanks ${values.name}`
})
</script>
