<template>
  <label>
    {{ label }}
    <input v-model="field.value" :data-test="name" v-bind="field.attrs" />
  </label>
  <p v-if="field.error" :id="field.errorId" :data-test="`${name}-error`">{{ field.error }}</p>
</template>

<script setup lang="ts">
import { useField } from '../../src'

const props = defineProps<{ name: string; label: string }>()
const field = useField<string>(() => props.name)
</script>
