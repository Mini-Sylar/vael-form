<template>
  <h1>Reacting to changes</h1>
  <form novalidate @submit.prevent>
    <div class="row">
      <div class="field">
        <label :for="attrs.phone.id">Phone (formats itself)</label>
        <input v-model="phone" v-bind="attrs.phone" />
      </div>
      <div class="field">
        <label :for="attrs.qty.id">Quantity (debounced)</label>
        <input v-model.number="qty" type="number" v-bind="attrs.qty" />
      </div>
    </div>
    <div class="row">
      <div class="field">
        <label :for="attrs.address.city.id">City</label>
        <input v-model="address.city" v-bind="attrs.address.city" />
      </div>
      <div class="field">
        <label :for="attrs.address.zip.id">Zip</label>
        <input v-model="address.zip" v-bind="attrs.address.zip" />
      </div>
    </div>
    <div class="actions">
      <button type="button" @click="list.push('tag')">Push tag</button>
      <button type="button" @click="form.setValue('address.city', 'Accra')">setValue city</button>
      <button type="button" @click="form.reset()">form.reset</button>
      <button type="button" @click="field('phone').reset()">phone.reset</button>
      <button
        type="button"
        @click="form.setValues({ phone: '1', qty: 2, address: { city: 'X', zip: 'Y' }, tags: [] })"
      >
        setValues
      </button>
      <button type="button" @click="log = []">Clear log</button>
    </div>
    <p class="hint">tags: {{ tags.length }}</p>
    <pre class="debug" data-test="log">{{ log.join('\n') || '(nothing yet)' }}</pre>
  </form>
</template>

<script setup lang="ts">
import { shallowRef } from 'vue'
import { z } from 'zod'
import { useForm } from 'vael-form'

const schema = z.object({
  phone: z.string(),
  qty: z.number(),
  address: z.object({ city: z.string(), zip: z.string() }),
  tags: z.array(z.string()),
})

const log = shallowRef<string[]>([])
const note = (line: string) => (log.value = [...log.value, line])

const form = useForm({
  schema,
  defaultValues: { phone: '', qty: 1, address: { city: '', zip: '' }, tags: [] },
})
const { attrs, field } = form
const { phone, qty, address, tags } = form.model
const list = field('tags')

// Its own write is not reported again.
phone.watch(({ value }) => {
  note(`phone ${JSON.stringify(value)}`)
  phone.value = (value ?? '').replace(/\D/g, '').replace(/(\d{3})(?=\d)/g, '$1-')
})
qty.watch(({ value, oldValue }) => note(`qty ${oldValue} -> ${value}`), { debounce: 300 })
form.watch('address', () => note('address changed'))
form.watch('address.zip', ({ value }) => note(`zip ${JSON.stringify(value)}`), { immediate: true })
tags.watch(({ value }) => note(`tags ${value?.length ?? 0}`))
</script>
