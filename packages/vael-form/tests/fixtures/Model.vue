<template>
  <form novalidate data-test="form" @submit="form.handleSubmit">
    <input v-model="name" data-test="name" v-bind="nameField.attrs" />
    <p data-test="name-error">{{ nameField.error }}</p>
    <input v-model.number="age" type="number" data-test="age" />
    <input v-model="address.street" data-test="street" />
    <input v-model="agree" type="checkbox" data-test="agree" />
    <label v-for="tag in ['a', 'b', 'c']" :key="tag">
      <input v-model="tags" type="checkbox" :value="tag" :data-test="`tag-${tag}`" />
    </label>
    <input v-model="plan" type="radio" value="free" data-test="plan-free" />
    <input v-model="plan" type="radio" value="pro" data-test="plan-pro" />
    <select v-model="country" data-test="country">
      <option value="">-</option>
      <option value="fr">fr</option>
      <option value="gh">gh</option>
    </select>
    <div v-for="(row, index) in members" :key="membersField.items[index]?.key">
      <input v-model="row.name" :data-test="`member-${index}`" />
    </div>
    <button type="button" data-test="add" @click="membersField.push({ name: '' })">add</button>
    <Child v-model="name" data-test-child />
    <output data-test="values">{{ JSON.stringify(values) }}</output>
  </form>
</template>

<script setup lang="ts">
import { z } from 'zod'
import { useForm } from '../../src'
import Child from './ModelChild.vue'

const props = defineProps<{ ready?: (form: unknown) => void }>()

const form = useForm({
  schema: z.object({
    name: z.string().min(3, 'Too short'),
    age: z.number(),
    address: z.object({ street: z.string() }),
    agree: z.boolean(),
    tags: z.array(z.string()),
    plan: z.enum(['free', 'pro']),
    country: z.string(),
    members: z.array(z.object({ name: z.string() })),
  }),
  defaultValues: {
    name: '',
    age: 1,
    address: { street: '' },
    agree: false,
    tags: ['a'],
    plan: 'free',
    country: '',
    members: [{ name: 'Ada' }],
  },
})
const { values } = form
const nameField = form.field('name')
const membersField = form.field('members')
const { name, age, address, agree, tags, plan, country, members } = form.model
props.ready?.(form)
</script>
