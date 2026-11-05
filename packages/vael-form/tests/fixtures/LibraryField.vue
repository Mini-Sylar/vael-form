<template>
  <div>
    <!-- A component library's field: its own id wins, the form's error id is merged in. -->
    <input
      v-model="email.value"
      data-test="email"
      v-bind="{ ...email.attrs, id: 'library-email' }"
    />
    <input
      v-model="password.value"
      data-test="password"
      v-bind="{ ...password.attrs, id: 'library-password' }"
    />
  </div>
</template>

<script setup lang="ts">
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { useForm } from '../../src'
import type { Form } from '../../src'

interface Values {
  email: string
  password: string
}

const props = defineProps<{
  schema: StandardSchemaV1<Values, unknown>
  ready?: (form: Form<StandardSchemaV1<Values, unknown>>) => void
}>()

const form = useForm({ schema: props.schema })
const email = form.field('email')
const password = form.field('password')

props.ready?.(form)
</script>
