<template>
  <h1>Book a trip</h1>
  <div class="steps">
    <span
      v-for="(name, i) in steps"
      :key="name"
      :class="{ on: i === step, bad: i < step && !field(name).valid }"
      >{{ i + 1 }}. {{ name }}</span
    >
  </div>
  <form novalidate @submit.prevent="last ? handleSubmit($event) : next()">
    <template v-if="step === 0">
      <div class="row">
        <div class="field">
          <label :for="attrs.trip.country.id">Country</label>
          <select v-model="trip.country" v-bind="attrs.trip.country">
            <option value="">Choose…</option>
            <option v-for="(_, country) in cities" :key="country">{{ country }}</option>
          </select>
          <p :id="attrs.trip.country.errorId" class="error">{{ errors.trip.country }}</p>
        </div>
        <div class="field">
          <label :for="attrs.trip.city.id">City</label>
          <select v-model="trip.city" :disabled="!trip.country" v-bind="attrs.trip.city">
            <option value="">Choose…</option>
            <option v-for="city in cities[trip.country ?? ''] ?? []" :key="city">
              {{ city }}
            </option>
          </select>
          <p :id="attrs.trip.city.errorId" class="error">{{ errors.trip.city }}</p>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label :for="attrs.trip.start.id">Start</label>
          <input v-model="trip.start" type="date" v-bind="attrs.trip.start" />
          <p :id="attrs.trip.start.errorId" class="error">{{ errors.trip.start }}</p>
        </div>
        <div class="field">
          <label :for="attrs.trip.nights.id">Nights</label>
          <input v-model.number="trip.nights" type="number" v-bind="attrs.trip.nights" />
          <p :id="attrs.trip.nights.errorId" class="error">{{ errors.trip.nights }}</p>
        </div>
      </div>
      <div class="field">
        <label :for="attrs.trip.promo.id">Promo code <span class="hint">(SAVE10)</span></label>
        <input v-model="trip.promo" v-bind="attrs.trip.promo" />
        <p :id="attrs.trip.promo.errorId" class="error">
          {{ errors.trip.promo
          }}<span v-if="field('trip.promo').pending" class="hint">checking…</span>
        </p>
      </div>
    </template>

    <template v-else-if="step === 1">
      <p v-if="field('travelers').error" class="error">{{ field('travelers').error }}</p>
      <TravelerRow
        v-for="item in list.items"
        :key="item.key"
        :fields="item.field"
        :first="item.index === 0"
        @up="list.move(item.index, item.index - 1)"
        @remove="list.remove(item.index)"
      />
      <button
        type="button"
        :disabled="list.items.length >= 4"
        @click="list.push({ name: '', age: 30 })"
      >
        Add traveler
      </button>
    </template>

    <template v-else>
      <fieldset class="choices" v-bind="attrs.payment.method">
        <label
          ><input v-model="payment.method" type="radio" value="card" name="method" /> Card</label
        >
        <label
          ><input v-model="payment.method" type="radio" value="bank" name="method" /> Bank</label
        >
      </fieldset>
      <template v-if="payment.method === 'card'">
        <div class="field">
          <label :for="attrs.payment.number.id">Card number</label>
          <input v-model="payment.number" inputmode="numeric" v-bind="attrs.payment.number" />
          <p :id="attrs.payment.number.errorId" class="error">{{ errors.payment.number }}</p>
        </div>
        <div class="field">
          <label :for="attrs.payment.expiry.id">Expiry</label>
          <input v-model="payment.expiry" placeholder="MM/YY" v-bind="attrs.payment.expiry" />
          <p :id="attrs.payment.expiry.errorId" class="error">{{ errors.payment.expiry }}</p>
        </div>
      </template>
      <div v-else class="field">
        <label :for="attrs.payment.iban.id">IBAN</label>
        <input v-model="payment.iban" v-bind="attrs.payment.iban" />
        <p :id="attrs.payment.iban.errorId" class="error">{{ errors.payment.iban }}</p>
      </div>
    </template>

    <div class="actions">
      <button v-if="step > 0" type="button" @click="step--">Back</button>
      <button class="primary" :disabled="submitting || pending">
        {{ last ? (submitting ? 'Booking…' : 'Book') : 'Next' }}
      </button>
    </div>
    <p v-if="reference" class="ok">Booked: {{ reference }}</p>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { z } from 'zod'
import { msg, useForm } from 'vael-form'
import { api } from '../api'
import TravelerRow from '../components/TravelerRow.vue'

const cities: Record<string, string[]> = {
  France: ['Paris', 'Lyon'],
  Ghana: ['Accra', 'Kumasi'],
  Japan: ['Tokyo', 'Kyoto', 'Osaka'],
}

const schema = z.object({
  trip: z.object({
    country: z.string().min(1),
    city: z.string().min(1),
    start: z
      .string()
      .min(1)
      .refine((v) => new Date(v) > new Date(), 'Pick a date in the future'),
    nights: z.number().int().min(1).max(30),
    promo: z.string().optional(),
  }),
  travelers: z
    .array(z.object({ name: z.string().min(2), age: z.number().int().min(0).max(120) }))
    .min(1)
    .max(4),
  payment: z.discriminatedUnion('method', [
    z.object({
      method: z.literal('card'),
      number: z.string().regex(/^\d{16}$/, 'Sixteen digits'),
      expiry: z.string().regex(/^\d\d\/\d\d$/, 'MM/YY'),
    }),
    z.object({ method: z.literal('bank'), iban: z.string().min(15) }),
  ]),
})

const steps = ['trip', 'travelers', 'payment'] as const
const step = ref(0)
const last = computed(() => step.value === steps.length - 1)
const reference = shallowRef('')

const form = useForm({
  schema,
  defaultValues: {
    trip: { country: '', city: '', start: '', nights: 3 },
    travelers: [{ name: '', age: 30 }],
    payment: { method: 'card' },
  },
  debounce: 300,
  rules: {
    'trip.promo': async (value, { signal }) =>
      value && !(await api.promoValid(value, signal)) ? msg('errors.promo') : undefined,
  },
  onSubmit: async (values) => {
    reference.value = (await api.book(values)).reference
  },
})
const { model, errors, attrs, field, handleSubmit, validate, submitting, pending } = form
const { trip, payment } = model
const list = field('travelers') // rows and list operations

form.watch('trip.country', () => (trip.value.city = ''))

async function next() {
  if (await validate(steps[step.value]!)) step.value++
}
</script>
