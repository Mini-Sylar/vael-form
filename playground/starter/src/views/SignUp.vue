<template>
  <h1>Create your account</h1>
  <form novalidate @submit="handleSubmit">
    <ul v-if="submitCount && errorList.length" class="summary">
      <li v-for="error in errorList" :key="error.path + error.message">{{ error.message }}</li>
    </ul>
    <div class="field">
      <label :for="attrs.username.id">Username</label>
      <input v-model="username" v-bind="attrs.username" />
      <p :id="attrs.username.errorId" class="error">
        {{ errors.username }}<span v-if="field('username').pending" class="hint"> checking…</span>
      </p>
      <p class="hint">Try ada, grace or admin.</p>
    </div>
    <div class="field">
      <label :for="attrs.email.id">Email</label>
      <input v-model="email" type="email" v-bind="attrs.email" />
      <p :id="attrs.email.errorId" class="error">{{ errors.email }}</p>
      <p class="hint">taken@example.com is rejected by the server.</p>
    </div>
    <div class="field">
      <label :for="attrs.password.id">Password</label>
      <input v-model="password" type="password" v-bind="attrs.password" />
      <p :id="attrs.password.errorId" class="error">{{ errors.password }}</p>
    </div>
    <div class="field">
      <label :for="attrs.confirm.id">Confirm password</label>
      <input v-model="confirm" type="password" v-bind="attrs.confirm" />
      <p :id="attrs.confirm.errorId" class="error">{{ errors.confirm }}</p>
    </div>
    <div class="field">
      <label class="choices">
        <span
          ><input v-model="terms" type="checkbox" v-bind="attrs.terms" /> I accept the terms</span
        >
      </label>
      <p :id="attrs.terms.errorId" class="error">{{ errors.terms }}</p>
    </div>
    <div class="actions">
      <button class="primary" :disabled="submitting || pending">
        {{ submitting ? 'Creating…' : 'Create account' }}
      </button>
      <button type="button" @click="clear">Reset</button>
      <span v-if="pending" class="hint">checking…</span>
    </div>
    <p v-if="done" class="ok">{{ done }}</p>
  </form>
</template>

<script setup lang="ts">
import { shallowRef } from 'vue'
import { z } from 'zod'
import { msg, useForm } from 'vael-form'
import { api } from '../api'

const schema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(20)
      .regex(/^[a-z0-9_]+$/i),
    email: z.email(),
    password: z.string().min(8),
    confirm: z.string(),
    terms: z.boolean().refine((v) => v, msg('errors.terms')),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

const done = shallowRef('')

const {
  model,
  errors,
  attrs,
  field,
  handleSubmit,
  reset,
  submitting,
  pending,
  submitCount,
  errorList,
} = useForm({
  schema,
  defaultValues: { username: '', email: '', password: '', confirm: '', terms: false },
  labels: {
    username: 'labels.username',
    email: 'labels.email',
    password: 'labels.password',
    confirm: 'labels.confirm',
  },
  debounce: 300,
  rules: {
    username: async (value, { signal }) =>
      (await api.usernameTaken(value, signal)) ? msg('errors.taken') : undefined,
  },
  onSubmit: async (values, { form }) => {
    try {
      await api.signUp(values)
      done.value = `Welcome, ${values.username}`
    } catch {
      form.setErrors({ email: 'That email is already registered' })
    }
  },
})
const { username, email, password, confirm, terms } = model

function clear() {
  reset()
  done.value = ''
}
</script>
