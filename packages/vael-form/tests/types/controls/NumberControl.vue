<!-- A number control that writes `null` when emptied, like most number inputs. -->
<template>
  <input
    :value="model ?? ''"
    @input="model = ($event.target as HTMLInputElement).valueAsNumber || null"
  />
</template>

<script setup lang="ts">
const model = defineModel<number | null>({ default: null })
</script>
