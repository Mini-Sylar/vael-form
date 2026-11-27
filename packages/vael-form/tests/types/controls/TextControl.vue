<!-- A text control whose model can't be null, like most inputs. -->
<template>
  <input :value="model" @input="model = ($event.target as HTMLInputElement).value" />
</template>

<script setup lang="ts">
const model = defineModel<string>()
</script>
