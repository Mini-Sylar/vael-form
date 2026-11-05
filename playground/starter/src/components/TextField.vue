<template>
  <div class="field">
    <label :for="field.id">{{ label }}</label>
    <input v-model="field.value" :type="type ?? 'text'" v-bind="field.attrs" />
    <p :id="field.errorId" class="error">
      {{ field.error }}<span v-if="field.pending" class="hint"> checking…</span>
    </p>
    <p v-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import type { Field } from 'vael-form'

defineProps<{ field: Field<string | undefined>; label: string; type?: string; hint?: string }>()
</script>
