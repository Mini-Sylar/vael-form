<template>
  <button type="button" @click="count++">{{ label }}</button>
</template>

<script setup lang="ts">
import { computed, inject, shallowRef } from 'vue'

const name = inject('label', 'count')
const count = shallowRef(0)
const label = computed(() => `${name}: ${count.value}`)
</script>
