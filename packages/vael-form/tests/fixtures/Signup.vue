<template>
  <form novalidate data-test="form" @submit="form.handleSubmit">
    <input v-model="email.value" data-test="email" v-bind="email.attrs" />
    <p v-if="email.error" :id="email.errorId" data-test="email-error">{{ email.error }}</p>
    <span v-if="email.pending" data-test="email-pending">checking</span>

    <input v-model="password.value" data-test="password" type="password" v-bind="password.attrs" />
    <p v-if="password.error" :id="password.errorId" data-test="password-error">
      {{ password.error }}
    </p>

    <button type="submit" data-test="submit">Sign up</button>
    <output data-test="state">
      {{ submitCount }}|{{ valid }}|{{ dirty }}|{{ submitting }}|{{ errorList.length }}
    </output>
  </form>
</template>

<script setup lang="ts">
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { useForm } from '../../src'
import type { DeepPartial, Form, FormI18n, ShowErrors } from '../../src'

interface Values {
  email: string
  password: string
}

const props = defineProps<{
  schema: StandardSchemaV1<Values, unknown>
  defaultValues?: DeepPartial<Values>
  showErrors?: ShowErrors
  rules?: Record<string, unknown>
  debounce?: number
  i18n?: FormI18n
  labels?: { email?: string; password?: string }
  ready?: (form: Form<StandardSchemaV1<Values, unknown>>) => void
  handle?: (values: unknown) => unknown
  handleInvalid?: (errors: readonly { path: string; message: string }[]) => unknown
}>()

const form = useForm({
  schema: props.schema,
  defaultValues: props.defaultValues,
  showErrors: props.showErrors,
  rules: props.rules as never,
  debounce: props.debounce,
  i18n: props.i18n,
  labels: props.labels,
  onSubmit: (values) => props.handle?.(values),
  onInvalid: (errors) => props.handleInvalid?.(errors),
})
const email = form.field('email')
const password = form.field('password')
const { submitCount, valid, dirty, submitting, errorList } = form

props.ready?.(form)
</script>
