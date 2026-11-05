<template>
  <h1>With vael-ui</h1>
  <form novalidate data-test="vael-form" @submit="handleSubmit">
    <Field label="Name" description="As on your passport." :error="errors.name" required>
      <Input v-model="name" v-bind="attrs.name" />
    </Field>
    <Field label="Bio" :error="errors.bio">
      <Textarea v-model="bio" v-bind="attrs.bio" />
    </Field>
    <Field label="Role" :error="errors.role">
      <Select v-model="role" :items="roles" placeholder="Choose…" v-bind="attrs.role" />
    </Field>
    <Field label="Plan" :error="errors.plan">
      <RadioGroup v-model="plan" v-bind="attrs.plan">
        <Radio value="free" label="Free" />
        <Radio value="pro" label="Pro" />
      </RadioGroup>
    </Field>
    <Field :error="errors.terms">
      <Checkbox v-model="terms" label="I accept the terms" v-bind="attrs.terms" />
    </Field>
    <Field :error="errors.notify">
      <Switch v-model="notify" label="Email me" v-bind="attrs.notify" />
    </Field>
    <div class="actions"><Button type="submit" :disabled="submitting">Save</Button></div>
  </form>
</template>

<script setup lang="ts">
import { z } from 'zod'
import { useForm } from 'vael-form'
import type { Field as FormField } from 'vael-form'
import {
  Button,
  Checkbox,
  Field,
  Input,
  Radio,
  RadioGroup,
  Select,
  Switch,
  Textarea,
} from 'vael-ui'

const roles = ['Designer', 'Engineer', 'Manager'].map((label) => ({
  label,
  value: label.toLowerCase(),
}))

const form = useForm({
  schema: z.object({
    name: z.string().min(2),
    bio: z.string().max(20),
    role: z.string().min(1),
    plan: z.enum(['free', 'pro']),
    terms: z.boolean().refine((v) => v, 'Accept the terms'),
    notify: z.boolean(),
  }),
  defaultValues: { name: '', bio: '', role: '', terms: false, notify: false },
  onSubmit: () => undefined,
})
const { model, errors, attrs, handleSubmit, submitting } = form
const { name, bio, role, plan, terms, notify } = model
</script>
