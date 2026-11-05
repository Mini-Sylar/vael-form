# vael-form

## 0.0.2

### Patch Changes

- [#1](https://github.com/Mini-Sylar/vael-form/pull/1) [`c56a7bc`](https://github.com/Mini-Sylar/vael-form/commit/c56a7bc555e3ad0843470a10e7c99e38f6b613cc) Thanks [@Mini-Sylar](https://github.com/Mini-Sylar)! - The library's code is unchanged. Its development dependencies no longer have `pnpm audit` advisories (`glob` and `minimatch`), and this release is published from GitHub Actions with npm trusted publishing, so it carries provenance.

- [#2](https://github.com/Mini-Sylar/vael-form/pull/2) [`185f6bd`](https://github.com/Mini-Sylar/vael-form/commit/185f6bd771ea2dc323e1093e14537a6aabf8ddd8) Thanks [@Mini-Sylar](https://github.com/Mini-Sylar)! - `handleSubmit` called from code, with no submit event (from a TanStack Query `mutationFn`, a button's `@click`), focuses the first invalid field too. It finds the field by its id, or by the error id in its `aria-describedby` when a component library gives the input its own id. The README has a section on pairing a form with TanStack Query.

## 0.0.1

### Patch Changes

- [`5a5c6e5`](https://github.com/Mini-Sylar/vael-form/commit/5a5c6e528650e05c9560849829444121545140d6) Thanks [@Mini-Sylar](https://github.com/Mini-Sylar)! - The first release of vael-form: Vue-first forms on [Standard Schema](https://standardschema.dev), with `v-model`, i18n and accessibility built in. It works in VDOM and Vapor, with plain inputs or any component library.

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
