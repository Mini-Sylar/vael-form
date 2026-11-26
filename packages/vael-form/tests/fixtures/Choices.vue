<template>
  <form novalidate data-test="form" @submit="form.handleSubmit">
    <fieldset v-bind="plan.attrs" data-test="plan">
      <input
        v-for="option in ['free', 'pro', 'team']"
        :key="option"
        v-model="plan.value"
        type="radio"
        name="plan"
        :value="option"
        :disabled="option === 'free'"
        :data-test="`plan-${option}`"
      />
    </fieldset>

    <fieldset v-bind="topics.attrs" data-test="topics">
      <input
        v-for="topic in ['vue', 'ts']"
        :key="topic"
        v-model="topics.value"
        type="checkbox"
        :value="topic"
        :data-test="`topic-${topic}`"
      />
    </fieldset>

    <!-- a radiogroup a component library renders: a div that can't take focus -->
    <div role="radiogroup" v-bind="size.attrs" data-test="size">
      <input
        v-for="option in ['s', 'm']"
        :key="option"
        v-model="size.value"
        type="radio"
        name="size"
        :value="option"
        :data-test="`size-${option}`"
      />
    </div>

    <button type="submit" data-test="submit">Send</button>
  </form>
</template>

<script setup lang="ts">
import { z } from 'zod'
import { useForm } from '../../src'
import type { DeepPartial, Form } from '../../src'

const schema = z.object({
  plan: z.enum(['free', 'pro', 'team']),
  topics: z.array(z.string()).min(1),
  size: z.enum(['s', 'm']).refine((value) => value !== 'm', 'Sold out'),
})

const props = defineProps<{
  defaultValues?: DeepPartial<z.input<typeof schema>>
  ready?: (form: Form<typeof schema>) => void
}>()

const form = useForm({ schema, defaultValues: props.defaultValues ?? { size: 'm' } })
const plan = form.field('plan')
const topics = form.field('topics')
const size = form.field('size')

props.ready?.(form)
</script>
