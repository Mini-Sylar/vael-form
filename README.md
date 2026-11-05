# vael-form

Vue-first forms on [Standard Schema](https://standardschema.dev): Zod, Valibot, ArkType, Yup, Joi, Effect... No components, and no dependency on vael-ui: it works with plain inputs and with any component library. Works in VDOM and Vapor. About 8.2 KB gzipped, plus small chunks that load only when a form needs them (`rules`, the i18n catalog, the schema's limits).

```vue
<script setup lang="ts">
import { z } from 'zod'
import { useForm } from 'vael-form'

const { model, errors, attrs, handleSubmit, submitting } = useForm({
  schema: z.object({ email: z.email(), password: z.string().min(8) }),
  defaultValues: { email: '' },
  onSubmit: async (values) => api.signUp(values), // values: the schema's output
})
const { email, password } = model // refs, typed from the schema
</script>

<template>
  <form novalidate @submit="handleSubmit">
    <input v-model="email" v-bind="attrs.email" />
    <p :id="attrs.email.errorId">{{ errors.email }}</p>
    <input v-model="password" type="password" v-bind="attrs.password" />
    <p :id="attrs.password.errorId">{{ errors.password }}</p>
    <button :disabled="submitting">Sign up</button>
  </form>
</template>
```

That is the whole shape. One schema is the truth and always runs; `showErrors` only decides when an error appears. Per input there are three things, all looked up by the field's name: `v-model` writes the value, `attrs` wires the id, ARIA and blur, and `errors` is the message (`attrs.email.errorId` is the id its element gets, which `aria-describedby` points at).

|             |                                                                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Options** | `schema` or `validate`, `defaultValues`, `onSubmit`, `onInvalid`, `showErrors`, `rules`, `debounce`, `labels`, `i18n`, `id`                                                                                                                                           |
| **Returns** | `model`, `errors`, `attrs`, `handleSubmit`, `submitting`, `valid`, `dirty`, `touched`, `pending`, `submitCount`, `values`, `errorList`, `allErrors`, `reset(values?)`, `validate(path?)`, `setValue`, `setValues`, `setErrors`, `clearErrors`, `watch`, `field(path)` |
| **Field**   | what `field(path)` gives, for the rare cases: `value`, `error`, `touched`, `dirty`, `valid`, `pending`, `attrs`, `touch()`, `untouch()`, `validate()`, `reset()`, `watch()`, and for a list `items`, `push`, `insert`, `remove`, `move`, `swap`, `replace`, `clear`   |

- `model` is a ref for each field (below), `errors.email` the message to show, `attrs.email` what to spread on the input: `id`, `name`, `aria-invalid`, `aria-describedby` and `onFocusout` (which marks the field as left). Nested fields are nested: `errors.address.street`, `attrs.address.street`. A list is one field (`errors.tags`); its rows and operations are on `field('members')`.
- `handleSubmit` is the handler for `@submit`: it prevents the default, validates, focuses the first `[aria-invalid="true"]`, calls `onSubmit` (or `onInvalid`), and ignores a second submit while one runs.
- `valid`, `dirty`, `touched`, `pending`, `submitting`, `submitCount` and `values` are refs, so you can destructure them and use them in a template without `.value`. `errorList` is the shown errors, for a summary; `allErrors` is everything, shown or not. A group's own error ("add at least one member") and an error no field owns (a `.refine` without a path) are `field('members').error` and `field('').error`.

## v-model

`model` is a ref for each field, so a Vue form reads like any other:

```ts
const { model, attrs, errors } = useForm({
  schema,
  defaultValues: { email: '', address: { street: '' }, tags: [] },
})
const { email, address, tags } = model // refs: destructure them
```

```vue
<input v-model="email" v-bind="attrs.email" />
<input v-model="address.street" v-bind="attrs.address.street" />
<fieldset v-bind="attrs.tags">
  <input v-for="tag in ['a', 'b']" v-model="tags" type="checkbox" :value="tag" />
</fieldset>
```

- A group is a ref to an object you can write to (`address.street`), and a list is a ref to an array, so `v-model="row.name"` works in a `v-for` and a checkbox group works as in plain Vue. With Zod, Valibot or ArkType a group is there before the data has it, read from the schema; with another library, give it a default (`address: {}`).
- Every write is a `setValue`: `dirty`, the errors and `watch` behave as for any edit.
- Destructure `model` as above. Reading `model.address.street` without destructuring, in a template, doesn't unwrap (Vue unwraps top-level refs only).
- In the script, a ref is a ref: `email.value`. In the template it is the value.

## Submitting

`onSubmit` gets the schema's output (a `z.coerce.number()` arrives as a number) and a context with `form`, `event`, `element` (the `<form>`; `event.currentTarget` is already null by now), `submitter` and `formData`. Two buttons, one form: the button that submitted is the HTML way to tell them apart.

```vue
<button name="action" value="draft">Save draft</button>
<button name="action" value="publish">Publish</button>
```

```ts
onSubmit: (values, { submitter }) => api.save(values, submitter?.value)
```

Without `onSubmit`, or to do something different for one form element or button, pass your own function: `handleSubmit(fn)` returns the handler for `@submit`, and `fn` gets the same values and context. It replaces `onSubmit` for that handler. Make the handler in the script; an inline `@submit="handleSubmit(fn)"` would only create it, not run it.

```ts
const onSubmit = handleSubmit(async (values, { formData }) => {
  await api.save(values)
})
```

```vue
<form @submit="onSubmit">
```

An error thrown in `onSubmit` rejects `handleSubmit`; `submitting` is false again. Server errors: `form.setErrors({ email: 'Already taken' })`, cleared when that field changes.

## With TanStack Query

The form checks the values; a mutation sends them. As with TanStack Form, the form calls the mutation once it is valid:

```ts
const mutation = useMutation({ mutationFn: (values: Values) => api.save(values) })
const form = useForm({ schema, onSubmit: (values) => mutation.mutateAsync(values) })
// <form novalidate @submit="form.handleSubmit">, and mutation.isPending for the button
```

To keep calling `mutate()` (`@submit.prevent="mutate()"`), write the pairing once in a composable of your own. `handleSubmit` called from code shows every error and focuses the first invalid field, as a submit event does.

```ts
export function useFormMutation<S extends StandardSchemaV1, T>(
  form: Form<S>,
  mutationFn: (values: InferOutput<S>) => Promise<T>,
) {
  const mutation = useMutation({ mutationFn })
  // Only valid values reach the mutation. Its errors stay on the mutation (`error`), not thrown here.
  const submit = form.handleSubmit((values) => mutation.mutateAsync(values).catch(() => {}))
  return { ...mutation, mutate: () => void submit() }
}
```

A server's field errors go back with `form.setErrors` in the mutation's `onError`.

## FormData

`formData` in the `onSubmit` context is the submitted values as multipart, built when you read it:

```ts
onSubmit: (values, { formData }) => fetch('/api/signup', { method: 'POST', body: formData })
```

It comes from the values (the schema's output), not from the page, so steps that aren't on screen are in it, and a checkbox is `'true'` and not `'on'`. Nested values use the inputs' own names (`address.street`, `members.0.name`), `File`s stay files, dates are ISO strings, `null` and `undefined` are left out, and the pressed submit button's name and value are added, as a native submit does. For a file input, set the field yourself: `@change="avatar.value = $event.target.files[0]"`.

## Rules

For what a schema shouldn't hold: an API call, the app's state. A schema is also used on your server, where "is this email taken" is a database query, not a schema rule.

```ts
useForm({
  schema,
  debounce: 400,
  rules: {
    username: async (value, { signal }) =>
      (await taken(value, { signal })) ? 'Already taken' : undefined,
  },
})
```

- Paths complete from the schema; `*` stands for a list index: `'members.*.email'`.
- A rule gets the value, and `{ values, path, signal }`. It returns a message, a list, or nothing. A message can be `msg('errors.taken')`, so it translates.
- It runs when the schema has no error at that path (a badly formatted email never calls your API), and not for a value that is still the default one (an edit form doesn't check the address the user already has).
- `debounce` waits for the last change. A change aborts the earlier call (`signal`) and only the newest answer is used.
- Its errors count like the schema's: `showErrors` decides when they show, they set `valid`, and `handleSubmit` waits for them and stops on one. `pending` is true meanwhile, on the field (`username.pending`) and the form.
- To check on blur instead of while typing: `username: { on: 'blur', run: check }`. A submit runs it anyway.
- A rule can be a schema for that one value: `rules: { code: z.string().regex(/^[A-Z]{3}$/) }`, and the same in `validate` (`email: z.email()`, alone or in a list with functions). Its errors are translated by your catalog like the form's own.
- Rules are async work: put cheap sync checks in the schema (`refine`), where they give feedback at once. A rule that throws (the network is down) stops the submit and rethrows.
- The rules' code is a separate chunk that loads only for a form with `rules`.

## Inputs

Every native input binds with `v-model` plus `attrs`:

| Input                               | Binding                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| text, email, textarea, date, select | `<input v-model="x" v-bind="attrs.x" />`                           |
| number                              | `v-model.number="x"` (or `z.coerce.number()` in the schema)        |
| one checkbox                        | `v-model="x"` on a `boolean` field                                 |
| checkbox group                      | a list field: `v-model="x"` on each checkbox with its own `:value` |
| radio group                         | `v-model="x"` on each radio with its own `:value`                  |

A group of checkboxes or radios has one `id` and one error, so `attrs.x` goes on the wrapping `<fieldset>`. The field counts as left when focus leaves the group, not when it moves between its inputs. Give radios a shared `name` so the arrow keys move between them:

```vue
<fieldset v-bind="attrs.tags">
  <label v-for="tag in tags" :key="tag">
    <input v-model="selected" type="checkbox" :value="tag" /> {{ tag }}
  </label>
</fieldset>
<p :id="attrs.tags.errorId">{{ errors.tags }}</p>
```

### Limits from the schema

`attrs` also carries what the schema says about the input: `minlength` and `maxlength` for text, `min`, `max` and `step` for numbers, and `aria-required` for a value that can't be left empty (a required string with a minimum, a required number; not a boolean, nor a plain string, which may be `''`). A `maxlength` stops the typing at the limit, so that error rarely needs showing. It works with Zod, Valibot and ArkType, and its code is a small chunk loaded when attrs are first read.

## Component libraries

`attrs` works on a library's components too, as long as the library keeps its own wiring when attributes are passed in. vael-ui does: inside its `Field`, the Field's `id` wins (so its label still names the control) and the passed `aria-describedby` is merged with the Field's error.

```vue
<Field label="Email" :error="errors.email">
  <Input v-model="email" v-bind="attrs.email" />
</Field>
```

A library that lets a passed `id` replace its own would lose its label. There, spread only what it needs: `:name="attrs.email.name" @focusout="attrs.email.onFocusout"`.

## Transforming values

Transforms live in the schema, and `onSubmit` gets what they return:

```ts
z.object({
  name: z.string().trim().min(1), // "  Ada " becomes "Ada"
  email: z.string().trim().toLowerCase().pipe(z.email()), // normalized, then checked
  price: z.string().transform(Number), // "12.5" becomes 12.5
  birthday: z.string().transform((value) => new Date(value)),
})
```

`field.value` stays what the user typed; the transformed value is what `onSubmit` receives. To change what is shown while typing (format a phone number), write to the field from `field.watch`: its own writes don't run it again. `v-model.trim` and `v-model.number` work as in any Vue form.

## Without a schema library

Write the rules as plain functions and give them to `validate`. A rule is `(value, { values, path }) => message | undefined`, the same shape as `rules`.

```ts
// shared: plain functions, written once
const required = (v) => !v && 'Required'
const pattern = (re, message) => (v) => !v || re.test(v) || message
const email = pattern(/^\S+@\S+\.\S+$/, 'Not an email')
const min = (n) => (v) => v >= n || `At least ${n}`
```

```ts
const form = useForm({
  defaultValues: { email: '', age: 0, password: '', confirm: '', members: [{ name: '' }] },
  validate: {
    email: [required, email], // an array runs in order; the first to fail is the error
    age: min(18),
    confirm: (v, { values }) => v === values.password || 'Must match',
    'members.*.name': required, // * is any list index
    '': (values) => values.members.length > 0 || 'Add a member', // an error no field owns
  },
  onSubmit: (values) => api.save(values),
})
```

It is the same form in every other way: `showErrors`, `valid`, `rules`, steps, `field.watch`, i18n. The types come from `defaultValues`; name them with `useForm<Values>` when they can't be inferred (a union, optional fields).

- **Regex.** A rule is any function: `(v) => re.test(v) || 'Message'`. An empty value is skipped by convention (`!v || ...`), so only `required` cares about empty.
- **Messages.** Return text, or `msg('errors.required')` to translate it like a schema's. A rule can return a list of messages.
- **Unions and conditions.** The rule gets `values`: `iban: (v, { values }) => values.type === 'bank' && !v && 'Required'`.
- **Async.** A rule may return a promise, which makes the whole validation async. For an API call use the `rules` option, which debounces and aborts.
- **Output.** The values as they are: nothing is stripped (a `number` typed before switching a union to `'bank'` is still there), trimmed or converted. Pick fields in `onSubmit`, or use a schema library when you want that.
- **Server and tests.** `validator()` is the same map as a Standard Schema, so it can run anywhere:

```ts
import { validator } from 'vael-form/validator'

export const signup = validator<Values>({ email: [required, email], age: min(18) })
// useForm({ schema: signup, defaultValues }), or on a server: signup['~standard'].validate(body)
```

## Schema libraries

Zod 4, Zod Mini, Zod 3, Valibot and ArkType map their errors to your catalog. Any other Standard Schema library works too, with its own message text; use `msg` for translated ones. Yup, Joi and Effect are tested (errors land on the right field and list row, and `msg` translates). Two things to know: Joi stops at the first problem unless the schema ends with `.prefs({ abortEarly: false })`, and an Effect schema becomes a Standard Schema with `Schema.toStandardSchemaV1(schema)`.

## Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n', 'vael-form/nuxt'],
  vaelForm: { showErrors: 'edited' }, // optional: showErrors, keyPrefix, i18n (true), autoImports (true)
})
```

The module installs the plugin, gives it the app's `$i18n` (from `@nuxtjs/i18n`, in whichever order the modules run), and auto-imports `useForm`, `useFormContext`, `useField` and `msg`. Your `formKit` messages go in the i18n config like any other.

## Server rendering

Inputs get their ids from `useId()`, so the server and the browser agree. Nothing is validated visibly on the server: errors show only after the user has earned them, so the server render has none. A render and its hydration are tested together for VDOM (no mismatch). Outside a component, give the form an `id`. Vapor has no server renderer yet, so that is not tested.

## Steps

A step is a group in the same schema, and one form holds all of them. `validate(path)` checks one group and shows only its errors.

```ts
const { validate, handleSubmit } = useForm({
  schema: z.object({
    account: z.object({ email: z.email(), password: z.string().min(8) }),
    profile: z.object({ name: z.string().min(2), age: z.number().min(18) }),
  }),
  onSubmit: (values) => api.signUp(values),
})
const steps = ['account', 'profile'] as const
const step = ref(0)
const last = computed(() => step.value === steps.length - 1)

async function next() {
  if (await validate(steps[step.value]!)) step.value++
}
```

```vue
<form novalidate @submit.prevent="last ? handleSubmit($event) : next()">
  <AccountFields v-if="step === 0" />
  <ProfileFields v-else />
  <button v-if="step > 0" type="button" @click="step--">Back</button>
  <button>{{ last ? 'Create account' : 'Next' }}</button>
</form>
```

- The values live in the form, not in the inputs, so a step that is not on the page keeps what the user typed. Nothing registers or unregisters.
- The final submit checks every step. `field('profile').valid` tells a step indicator which steps still have problems; it is true only when nothing under the group has an error.
- A step you haven't reached has errors the form knows about but doesn't show: `errorList` holds only what the user has earned. `allErrors` is everything.
- Which step is current is your state (`ref`), as in any Vue app. A step component reads the form with `useFormContext<typeof schema>()` (see "In child components"): `const { model, errors, attrs } = useFormContext<typeof schema>()`, then `v-model="account.email"`.

## Dependent fields

Rules that look at several fields belong in the schema, because the whole schema runs on every change. The error goes on the field you name, and goes away when either side is fixed.

```ts
// Zod
z.object({ password: z.string().min(8), confirm: z.string() }).refine(
  (d) => d.password === d.confirm,
  { path: ['confirm'], message: 'Passwords do not match' },
)

// Valibot
v.pipe(
  v.object({ password: v.pipe(v.string(), v.minLength(8)), confirm: v.string() }),
  v.forward(
    v.partialCheck(
      [['password'], ['confirm']],
      (i) => i.password === i.confirm,
      'Passwords do not match',
    ),
    ['confirm'],
  ),
)

// ArkType
type({ password: 'string >= 8', confirm: 'string' }).narrow(
  (data, ctx) =>
    data.password === data.confirm ||
    ctx.reject({
      expected: 'identical to password',
      actual: '',
      path: ['confirm'],
      message: 'Passwords do not match',
    }),
)
```

- A field required only for some answers: `superRefine` (Zod) or a discriminated union (`z.discriminatedUnion`, `v.variant`) in the schema, and `v-if` on the input.
- A field that depends on another's value (the state list after a country): a `country.watch` and your data, as in "Reacting to changes".
- Zod runs a cross-field `refine` even when another field is invalid, so the user sees both errors at once.

## Reacting to changes

`email.watch` (on a `model` ref, in the script) and `form.watch(path, …)` run a function when a value changes by a user edit or `setValue`. They do not run for `reset()`, `setValues()` or defaults that load, so a loaded `country` doesn't clear the `state` that came with it.

```ts
const form = useForm({ schema, defaultValues })
const { country, state, plan, username } = form.model

country.watch(() => (state.value = undefined)) // a dependent field
plan.watch(({ value }) => (schema.value = schemas[value])) // swap the schema (a ref)
username.watch(({ value }) => track(value), { debounce: 300 })
form.watch('address.zip', ({ value }) => lookup(value)) // any path, a group or a list too
```

- The handler gets `{ value, oldValue }`. Several changes in one tick run it once. What it writes to its own field doesn't run it again; other watchers do run.
- Options: `debounce` (waits for the last change) and `immediate` (runs once now). It returns `stop`, and stops with the component.
- `ref.watch` is for the script (in a template a ref is its value). Call `form.watch` through the form, or rename it as you destructure, so it doesn't shadow Vue's own `watch`.
- Use Vue's `watch` for anything that isn't a form value; use these when a reset or a load must not trigger it.
- Your own `@blur` or `@focusout` on the input runs as well: `<input v-model="email" v-bind="attrs.email" @blur="track('email')" />`.

**Dependent values** come in three kinds. A rule across fields goes in the schema (a `refine` with a `path`). A value that follows another is a `watch` (above). A list of options that depends on a value is a plain `computed` of the ref: `const states = computed(() => statesOf[country.value])`.

Two fields that depend on each other (confirm password) need nothing: the whole schema runs on every change, so `.refine((v) => v.confirm === v.password, { path: ['confirm'] })` is enough.

## Outside a component

A form is a plain object. It keeps its reactivity wherever you put it: a Pinia store, a module, a composable, a prop, `provide`.

```ts
export const useSignup = defineStore('signup', () => {
  const form = useForm({
    schema,
    id: 'signup', // see below
    onSubmit: async (values, { form }) => {
      try {
        await api.signUp(values)
      } catch {
        form.setErrors({ email: 'That email is already registered' })
      }
    },
  })
  return { form }
})
```

```vue
<script setup lang="ts">
const { form } = useSignup()
const { model, errors, attrs } = form
const { email } = model
</script>
```

- The `form` in `onSubmit`'s second argument is the same form, so the callback never has to name a variable that isn't defined yet.
- A form stays out of Vue's reactive wrapping, so `store.form.values` can't be changed by accident. Change values through `model`, `setValue` and `setValues`.
- The app's i18n and `showErrors` reach a form made in a store, because Pinia sets stores up inside the app. In a bare module there is no app: pass `i18n` to `useForm`.
- `id` is the prefix of the inputs' ids. In a component it comes from `useId()`, which is the same on the server and in the browser. Outside one it comes from a counter, so give the form an `id` if you render on the server.
- State like `valid` and `submitting` is a ref: destructure it, or read `form.valid.value` in a script.

## Dialogs

Put the form in its own component inside the dialog. A dialog that renders its content only while open (vael-ui's `Dialog` does, unless `forceMount`) makes a new form on every open, already filled in, with nothing to reset:

```vue
<Dialog v-model:open="open"><EditUser :user="selected" @done="open = false" /></Dialog>
```

```ts
// EditUser.vue
const props = defineProps<{ user: User }>()
const form = useForm({ schema, defaultValues: props.user, onSubmit: save })
```

If the form lives where it stays mounted (a dialog that is only hidden, the parent, a store), reset it where you open the dialog:

```ts
function openEdit(user: User) {
  form.reset(user) // the new defaults, nothing dirty, nothing touched
  open.value = true
}
```

Watch out for one thing: `defaultValues` follows its source only while the form is not dirty, so that a refetch can't overwrite what the user is typing. A shared dialog that shows record A, is cancelled with edits, and then shows record B would keep A's edits. A fresh component, or `form.reset(record)` when you open, avoids it.

## Default values that load later

Pass a ref (from `useFetch`, a query, or your own). The form is usable while it's `undefined`, takes the data when it arrives, and keeps what the user already typed. Nested groups (`notify.email`) work while it's loading, with Zod, Valibot or ArkType; with another schema library, give them a default.

```ts
const { data: user } = useQuery(...)
const form = useForm({ schema, defaultValues: user })
```

Data arriving before an edit replaces the values and clears `dirty`; after one, the user's edit wins (`form.reset(user.value)` overwrites on purpose). After a save, `form.reset(saved)` makes the saved values the new defaults. Show a skeleton with the query's own `isLoading`; with Suspense, `defaultValues: await load()` is a plain value.

## When errors show

`showErrors` decides when an error appears. Every mode shows all of them after a submit and keeps them live from then on. A row added to a list after that submit (or after a step check) stays quiet until the user leaves it, or until the next submit.

| Mode                 | The error shows                                                                     |
| -------------------- | ----------------------------------------------------------------------------------- |
| `'edited'` (default) | once the field has been changed and left. Passing over an empty field says nothing. |
| `'blur'`             | once the field is left, even if it was never changed                                |
| `'input'`            | as soon as the value changes                                                        |
| `'submit'`           | only after the first submit                                                         |

Give one mode for the form, or a mode per path, with `default` for the rest:

```ts
useForm({
  schema,
  showErrors: { default: 'edited', username: 'input', members: 'submit' },
})
```

### Autofill

When a browser autofills a field it plays back a whole interaction in a few milliseconds: focus, input, change, blur (Chrome does this at your first click on the page). The blur is not the user leaving the field, so a field that still holds an autofilled value doesn't count as left: no error appears for it until the user types in it, or until the form is submitted, which shows everything. The check is the `:autofill` selector (`:-webkit-autofill` in Safari), through `attrs.x.onFocusout`; `field.touch()` is still immediate.

### Errors that move the page

An error that appears pushes what is below it down, and a button that moves between mouse-down and mouse-up loses the click: type a bad email, press "Sign up", and the press never lands. Two things stop it:

- A field that loses focus to a mouse press (or a finger) waits for the release before it counts as left, so the click happens first and the error appears right after. Leaving with the keyboard shows it at once, and `field.touch()` is always immediate.
- Reserve a line for the error. Keep the element in the page even when it is empty, and give it a `min-height`; `aria-describedby` points at it only while the field is invalid.

```vue
<p :id="field.errorId" class="error">{{ field.error }}</p>
```

```css
.error {
  min-height: 1.5em;
}
```

Paths complete from the schema. A group covers everything under it, and the nearest path wins (`'members.0.name': 'input'` beats `members`). `app.use(formPlugin, { showErrors })` sets the default for every form; a form's own `showErrors` replaces it, it isn't merged. `field.untouch()` hides a field's errors again until it is left once more.

## Paths

`form.field('address.street')`, `form.setValue('items.0.name', 'x')`, `form.validate('address')` and `labels` all complete from the schema's input type, and `setValue` checks the value's type.

## Lists

```ts
const list = form.field('members') // a list's rows and operations live on its field
```

```vue
<div v-for="item in list.items" :key="item.key">
  <input v-model="item.field.name.value" v-bind="item.field.name.attrs" />
  <p>{{ item.field.name.error }}</p>
  <button type="button" @click="list.remove(item.index)">Remove</button>
</div>
<button type="button" @click="list.push({ name: '' })">Add</button>
```

`push`, `insert`, `remove`, `move`, `swap`, `replace`. `item.key` is stable through edits and moves, and touched state follows the item.

## Unions, tuples and dynamic schemas

- A discriminated union has the fields of every branch (`attrs.number`, `attrs.iban`), and the schema validates the active one. Values of the other branch are kept, so switching back restores them; the submitted values only contain the active branch.
- A tuple is one field (`Field<[Date, Date]>`), with its positions as paths (`range.0`).
- A nullable value is `Field<string | null>`; a recursive schema works, and its paths are checked to twelve levels.
- `schema` can be a ref, for forms built from data: a new schema validates the same values again.
- With a schema that has no types, `model`, `errors` and `attrs` take any name.

## i18n

The library ships no translations. Pass your own i18n instance once, and add the form's messages to your own locale files under the `formKit` namespace.

```ts
// main.ts
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en, fr } }) // your catalogs
app.use(i18n)
app.use(formPlugin, { i18n: i18n.global }) // vue-i18n in either mode, or { t, locale } over any catalog
```

That is the whole connection. Your schemas stay as they are (`z.string().min(8)`, `v.pipe(v.string(), v.email())`, `type({ name: 'string >= 3' })`): Zod, Valibot and ArkType return what went wrong, and the form looks up the matching key in your catalog when it shows the error. A locale switch updates the errors already on screen, without validating again.

Copy this into your locale files, then translate the values:

```json
{
  "formKit": {
    "required": "{field} is required",
    "invalidType": {
      "default": "{field} is not valid",
      "string": "{field} must be text",
      "number": "{field} must be a number",
      "int": "{field} must be a whole number",
      "boolean": "{field} must be true or false",
      "date": "{field} must be a valid date",
      "array": "{field} must be a list"
    },
    "tooSmall": {
      "default": "{field} is too small (minimum {minimum})",
      "string": "{field} must be at least {minimum} characters",
      "number": "{field} must be at least {minimum}",
      "array": "{field} needs at least {minimum} items",
      "date": "{field} must be on or after {minimum}"
    },
    "tooBig": {
      "default": "{field} is too large (maximum {maximum})",
      "string": "{field} must be at most {maximum} characters",
      "number": "{field} must be at most {maximum}",
      "array": "{field} can have at most {maximum} items",
      "date": "{field} must be on or before {maximum}"
    },
    "invalidFormat": {
      "default": "{field} is not in the right format",
      "email": "Enter a valid email address",
      "url": "Enter a valid URL",
      "uuid": "{field} must be a valid UUID",
      "regex": "{field} is not in the right format",
      "startsWith": "{field} must start with \"{prefix}\"",
      "endsWith": "{field} must end with \"{suffix}\"",
      "includes": "{field} must contain \"{includes}\""
    },
    "invalidValue": "Choose one of the available options for {field}",
    "notMultipleOf": "{field} must be a multiple of {divisor}",
    "invalidUnion": "{field} is not valid",
    "unrecognizedKeys": "Unrecognized fields: {keys}",
    "custom": "{field} is not valid"
  }
}
```

You don't need all of it. The form tries the most specific key first (`tooSmall.string`, then `tooSmall.default`), and a key your catalog lacks shows the schema library's own text. `required` is used for a missing value, for an empty string or list under `min(1)`, and for an empty text input where a number or date is expected.

Every message gets `{field}`: the label you give (`labels: { email: 'labels.email' }`, itself translated), or the field name made readable (`firstName` is "First name"). The values are `{minimum}`, `{maximum}`, `{expected}`, `{format}`, `{divisor}`, `{keys}` and `{count}`, which picks the plural form where the library has one.

To change one message, write it in the schema: `.min(8, 'Pick a longer name')` is shown as written. Your own keys go through `msg`, which also takes a list of keys, tried in order:

```ts
z.string().refine(isFree, msg('errors.taken', { name }, 'Already taken'))
```

Keep the messages under another name with `formPlugin, { i18n, keyPrefix: 'myForms' }`. Per component tree: `provideFormConfig(computed(() => ({ i18n })))`. Per form: `useForm({ i18n })`. A schema used on its own, outside a form, keeps its library's default text. Keys for `msg` complete once you register them:

```ts
declare module 'vael-form' {
  interface Register {
    messageKeys: 'errors.taken' | 'errors.members'
  }
}
```

Other schema libraries (Yup, Joi, Effect...) show their own text as it is; use `msg` in those schemas.

## Reusable inputs

A field is a typed object, so reuse is a prop:

```vue
<!-- TextField.vue -->
<script setup lang="ts">
import type { Field } from 'vael-form'
defineProps<{ field: Field<string>; label: string }>()
</script>
<template>
  <label :for="field.id">{{ label }}</label>
  <input v-model="field.value" v-bind="field.attrs" />
  <p :id="field.errorId" class="error">{{ field.error }}</p>
  <!-- always there: see "Errors that move the page" -->
</template>

<!-- <TextField :field="form.field('email')" label="Email" /> -->
```

## In child components

`const { model, errors, attrs } = useFormContext<typeof schema>()` gives a child component the same typed form, and `useFormContext<typeof schema>().field('email')` one field. `useField(() => props.name)` is for a reusable input that binds by name.

## Develop

```sh
pnpm install
pnpm test        # VDOM, Vapor, and Vapor inside VDOM
pnpm typecheck   # includes the type-level tests in tests/types
pnpm size        # minified, gzipped; pnpm build also runs publint and attw
pnpm play        # also play:vapor, play:vapor-interop
```
