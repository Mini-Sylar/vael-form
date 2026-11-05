<template>
  <div class="item">
    <div class="row">
      <div class="field">
        <label :for="fields.name.id">Name</label>
        <input v-model="fields.name.value" v-bind="fields.name.attrs" />
        <p :id="fields.name.errorId" class="error">{{ fields.name.error }}</p>
      </div>
      <div class="field">
        <label :for="fields.age.id">Age</label>
        <input v-model.number="fields.age.value" type="number" v-bind="fields.age.attrs" />
        <p :id="fields.age.errorId" class="error">{{ fields.age.error }}</p>
      </div>
    </div>
    <div class="fit actions">
      <button type="button" :disabled="first" @click="emit('up')">↑</button>
      <button type="button" @click="emit('remove')">Remove</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FieldTree } from 'vael-form'

export interface Traveler {
  name: string
  age: number
}

defineProps<{ fields: FieldTree<Traveler>; first: boolean }>()
const emit = defineEmits<{ up: []; remove: [] }>()
</script>
