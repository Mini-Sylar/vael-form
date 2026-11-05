<template>
  <div class="field">
    <label :for="field.id">{{ label }}</label>
    <input v-model="field.value" :type="type ?? 'text'" v-bind="field.attrs" />
    <p :id="field.errorId" class="error">{{ field.error }}</p>
  </div>
</template>

<script setup lang="ts">
import { useField } from 'vael-form'

// Binds by name to the nearest form, so the parent only writes the path.
const props = defineProps<{ name: string; label: string; type?: string }>()
const field = useField<string>(() => props.name)
</script>
