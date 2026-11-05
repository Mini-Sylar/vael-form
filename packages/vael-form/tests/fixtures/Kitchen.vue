<template>
  <form novalidate data-test="form" @submit="form.handleSubmit">
    <input v-model="name.value" data-test="name" v-bind="name.attrs" />
    <input v-model="email.value" data-test="email" type="email" v-bind="email.attrs" />
    <input v-model.number="age.value" data-test="age" type="number" v-bind="age.attrs" />
    <textarea v-model="bio.value" data-test="bio" v-bind="bio.attrs" />
    <input v-model="birthday.value" data-test="birthday" type="date" v-bind="birthday.attrs" />
    <input v-model="price.value" data-test="price" v-bind="price.attrs" />

    <input
      v-model="newsletter.value"
      data-test="newsletter"
      type="checkbox"
      v-bind="newsletter.attrs"
    />

    <!-- a group shares a name, not an id: every input needs its own -->
    <fieldset v-bind="topics.attrs" data-test="topics">
      <input
        v-for="topic in ['vue', 'ts', 'css']"
        :key="topic"
        v-model="topics.value"
        type="checkbox"
        :value="topic"
        :data-test="`topic-${topic}`"
      />
    </fieldset>

    <fieldset v-bind="plan.attrs" data-test="plan">
      <input
        v-for="option in ['free', 'pro']"
        :key="option"
        v-model="plan.value"
        type="radio"
        :value="option"
        name="plan"
        :data-test="`plan-${option}`"
      />
    </fieldset>

    <select v-model="country.value" data-test="country" v-bind="country.attrs">
      <option value="">-</option>
      <option value="gh">Ghana</option>
      <option value="fr">France</option>
    </select>

    <p v-if="name.error" data-test="name-error">{{ name.error }}</p>
    <p v-if="topics.error" :id="topics.errorId" data-test="topics-error">{{ topics.error }}</p>
    <button type="submit" data-test="submit">Send</button>
  </form>
</template>

<script setup lang="ts">
import { z } from 'zod'
import { useForm } from '../../src'

const props = defineProps<{
  handle?: (values: unknown, context: unknown) => void
  showErrors?: 'blur' | 'edited'
}>()

const form = useForm({
  schema: z.object({
    // Transforms live in the schema, and onSubmit gets what they return.
    name: z.string().trim().min(1),
    email: z.string().trim().toLowerCase().pipe(z.email()),
    age: z.number().min(18),
    bio: z.string().max(40),
    birthday: z.string().transform((value) => new Date(value)),
    price: z.string().transform(Number),
    newsletter: z.boolean(),
    topics: z.array(z.string()).min(1),
    plan: z.enum(['free', 'pro']),
    country: z.string().min(1),
  }),
  defaultValues: {
    name: '',
    email: '',
    bio: '',
    price: '',
    newsletter: false,
    topics: [],
    plan: 'free',
    country: '',
  },
  showErrors: props.showErrors,
  onSubmit: (values, context) => props.handle?.(values, context),
})
const name = form.field('name')
const email = form.field('email')
const age = form.field('age')
const bio = form.field('bio')
const birthday = form.field('birthday')
const price = form.field('price')
const newsletter = form.field('newsletter')
const topics = form.field('topics')
const plan = form.field('plan')
const country = form.field('country')
</script>
