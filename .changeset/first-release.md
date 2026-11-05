---
'vael-form': patch
---

The first release of vael-form: Vue-first forms on [Standard Schema](https://standardschema.dev), with `v-model`, i18n and accessibility built in. It works in VDOM and Vapor, with plain inputs or any component library.

**Contents:** [Quick start](#quick-start) · [What's in it](#whats-in-it) · [Schema libraries](#schema-libraries) · [Nuxt](#nuxt) · [Size](#size) · [Not yet](#not-yet)

## Quick start

```ts
const { model, errors, attrs, handleSubmit, submitting } = useForm({
  schema: z.object({ email: z.email(), password: z.string().min(8) }),
  defaultValues: { email: '' },
  onSubmit: (values) => api.signUp(values),
})
const { email, password } = model
```

```vue
<form novalidate @submit="handleSubmit">
  <input v-model="email" v-bind="attrs.email" />
  <p :id="attrs.email.errorId">{{ errors.email }}</p>
  <button :disabled="submitting">Sign up</button>
</form>
```

## What's in it

| Feature             | How                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `v-model`           | `model` is a ref per field; groups and lists are writable (`address.street`, `row.name`)                |
| Errors              | `errors.email`, shown once a field is changed and left (`showErrors` for other timings)                 |
| Accessibility       | `attrs` wires `id`, `aria-invalid`, `aria-describedby`, and the schema's limits (`maxlength`, `min`, …) |
| Async checks        | `rules`: debounced, aborted when stale, `pending` while running; a rule can be a function or a schema   |
| No schema library   | `validate`: plain functions, or a schema per field                                                      |
| Lists               | `field('members')`: `push`, `insert`, `remove`, `move`, `swap`, stable keys                             |
| Reacting to changes | `email.watch(...)` and `form.watch(path, ...)`: user edits only, not resets or loaded data              |
| Submitting          | `handleSubmit` (or `handleSubmit(fn)`), focuses the first invalid field, `formData` for multipart       |
| Loading data        | `defaultValues` takes a ref; the user's edits win, and nested groups work before the data arrives       |
| i18n                | your catalog under `formKit`, from vue-i18n or any `{ t, locale }`; no translations are shipped         |
| Stores and SSR      | works in Pinia stores and server rendering; stable ids from `useId()`                                   |

## Schema libraries

Zod 4, Zod Mini, Zod 3, Valibot and ArkType map their errors to your catalog and give `attrs` their limits. Yup, Joi, Effect and any other Standard Schema library work with their own message text.

## Nuxt

```ts
export default defineNuxtConfig({ modules: ['@nuxtjs/i18n', 'vael-form/nuxt'] })
```

The module installs the plugin with the app's `$i18n` and auto-imports `useForm`, `useFormContext`, `useField` and `msg`.

## Size

About 8.2 KB gzipped. The rules, the i18n catalog readers, the schema's limits and the plain validator are separate chunks that load only when a form uses them.

## Not yet

No devtools.
