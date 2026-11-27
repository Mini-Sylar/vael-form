<template>
  <FieldInput v-if="first" name="pay.amount" label="Amount" />
  <input v-if="second" data-test="second" v-bind="attrs.pay.amount" />
  <button type="button" data-test="swap" @click="swap">Swap</button>
  <button type="button" data-test="cash" @click="form.setValue('pay.type', 'cash')">Cash</button>
</template>

<script setup lang="ts">
import { shallowRef } from 'vue'
import { z } from 'zod'
import { useForm } from '../../src'
import FieldInput from './FieldInput.vue'

const form = useForm({
  schema: z.object({
    pay: z.discriminatedUnion('type', [
      z.object({ type: z.literal('card'), amount: z.number().min(1) }),
      z.object({ type: z.literal('cash'), amount: z.number().nullable() }),
    ]),
  }),
  defaultValues: { pay: { type: 'card' } } as never,
})
const { attrs } = form
const [first, second] = [shallowRef(true), shallowRef(false)]
// The first reader goes; another comes.
const swap = () => ([first.value, second.value] = [false, true])
</script>
