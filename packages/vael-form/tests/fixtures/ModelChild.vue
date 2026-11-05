<template>
  <input
    data-test="child"
    :value="model"
    @input="model = ($event.target as HTMLInputElement).value"
  />
</template>

<script setup lang="ts">
const model = defineModel<string>()
</script>
