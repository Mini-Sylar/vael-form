<!-- @strictTemplates true -->
<!-- Type test, checked by `pnpm typecheck` with strict templates: `v-model` on a field type-checks both ways. -->
<template>
  <input v-model="name" v-bind="attrs.name" />
  <TextControl v-model="name" />
  <NumberControl v-model="seats" />
  <NumberControl v-model="limit" />
  <!-- @vue-expect-error a control that writes `null` needs a field that can hold it -->
  <NumberControl v-model="age" />
</template>

<script setup lang="ts">
import { z } from 'zod'
import { useForm } from '../../src'
import NumberControl from './controls/NumberControl.vue'
import TextControl from './controls/TextControl.vue'

const { model, attrs } = useForm({
  schema: z.object({
    name: z.string().min(1),
    // Required: null in, a number out.
    seats: z.number().int().min(1).nullable().pipe(z.number()),
    // Optional: null is an answer.
    limit: z.number().nullable(),
    age: z.number(),
  }),
})
const { name, seats, limit, age } = model
</script>
