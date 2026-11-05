<template>
  <main class="demo">
    <h1>vael-form playground ({{ mode }})</h1>
    <p>
      <button type="button" @click="toggleLocale">Locale: {{ i18n.global.locale.value }}</button>
    </p>

    <form novalidate @submit="handleSubmit">
      <label>
        Email
        <input v-model="email" type="email" v-bind="attrs.email" />
      </label>
      <!-- always there, with room for one line: an error appearing must not move the button below -->
      <p :id="attrs.email.errorId" class="error">
        {{ errors.email ?? (field('email').pending ? 'Checking…' : '') }}
      </p>

      <label>
        Password
        <input v-model="password" type="password" v-bind="attrs.password" />
      </label>
      <p :id="attrs.password.errorId" class="error">{{ errors.password }}</p>

      <fieldset>
        <legend>Members</legend>
        <div v-for="item in list.items" :key="item.key" class="row">
          <input
            v-model="item.field.name.value"
            placeholder="Name"
            v-bind="item.field.name.attrs"
          />
          <button type="button" @click="list.remove(item.index)">Remove</button>
          <span v-if="item.field.name.error" class="error">{{ item.field.name.error }}</span>
        </div>
        <button type="button" @click="list.push({ name: '' })">Add member</button>
        <p class="error">{{ list.error }}</p>
      </fieldset>

      <p>
        <button type="submit" :disabled="submitting">Sign up</button>
        <button type="button" @click="setErrors({ email: 'That email is already taken' })">
          Pretend the server said taken
        </button>
        <button type="button" @click="reset()">Reset</button>
      </p>
    </form>

    <ul v-if="errorList.length" class="summary">
      <li v-for="error in errorList" :key="error.path + error.message">
        {{ error.path || 'form' }}: {{ error.message }}
      </li>
    </ul>
    <p v-if="done">Signed up: {{ done }}</p>
    <pre>{{ { dirty, valid, submits: submitCount, values } }}</pre>
  </main>
</template>

<script setup vapor lang="ts">
import { shallowRef } from 'vue'
import { useForm } from 'vael-form'
import { i18n, labels, rules, schema } from 'playground-shared'

const mode = 'vapor'
const done = shallowRef('')

const form = useForm({
  schema,
  labels,
  rules,
  debounce: 300,
  defaultValues: { email: '', password: '', members: [{ name: '' }] },
  onSubmit: async (values) => {
    await new Promise((resolve) => setTimeout(resolve, 400))
    done.value = JSON.stringify(values)
  },
})
const {
  model,
  errors,
  attrs,
  field,
  handleSubmit,
  setErrors,
  reset,
  submitting,
  dirty,
  valid,
  submitCount,
  values,
  errorList,
} = form
const { email, password } = model
const list = field('members') // a list's rows and operations

function toggleLocale() {
  i18n.global.locale.value = i18n.global.locale.value === 'en' ? 'fr' : 'en'
}
</script>

<style>
.demo {
  font:
    15px/1.5 system-ui,
    sans-serif;
  max-width: 34rem;
  margin: 2rem auto;
  padding: 0 1rem;
}
.demo label,
.demo input {
  display: block;
}
.demo input {
  margin: 0.2rem 0 0.6rem;
  padding: 0.4rem 0.5rem;
}
.demo input[aria-invalid='true'] {
  outline: 2px solid #d33;
}
.demo .error {
  color: #b00;
  margin: -0.4rem 0 0.6rem;
  /* one line is always reserved, so showing the error moves nothing */
  min-height: 1.5em;
  line-height: 1.5;
}
.demo .row {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
}
.demo .summary {
  background: #fee;
  padding: 0.6rem 1.4rem;
}
</style>
