# vael-form

## 0.0.6

### Patch Changes

- [#13](https://github.com/Mini-Sylar/vael-form/pull/13) [`f13ec9d`](https://github.com/Mini-Sylar/vael-form/commit/f13ec9d90613a618713865bd78fab2d61b91b7b6) Thanks [@Mini-Sylar](https://github.com/Mini-Sylar)! - ## Fixes

  - **`aria-required` on a nullable field:** a field that takes `null`, such as `z.number().nullable()`, Valibot's `v.nullable(...)` or ArkType's `'number | null'`, accepts an empty answer, so it no longer gets `aria-required`. A field whose schema turns `null` away again, such as `.nullable().pipe(z.number())`, keeps it. A `.refine()` or `.transform()` that rejects `null` can't be read from the schema, so that field gets none.
  - **`aria-required` on an email or a URL:** a required string whose format or pattern turns `''` away, such as `z.email()`, `v.pipe(v.string(), v.url())` or ArkType's `'string.email'`, now gets `aria-required`. One whose pattern takes `''`, such as `z.hex()` or `z.base64()`, doesn't.
  - **No `min`/`max` from Zod's `.int()`:** `z.number().int()` no longer puts `min` and `max` of ±9007199254740991 on `attrs`. A bound that is only the safe-integer range, or infinite, is left off; a real bound such as `.min(1)` stays.
  - **An integer's exclusive bounds:** `.positive()`, `.gt()` and `.lt()` on an integer (Valibot's `gtValue` and `ltValue`, ArkType's `'0 < number.integer < 10'`) now give `min` and `max`: the next whole number inside the bound. With both kinds of bound, as Valibot allows, the tighter one wins.
  - **Valibot limits:** `v.length(4)` gives `minlength` and `maxlength` (`aria-required` for a list), `v.safeInteger()` counts as an integer, and a field in `v.exactOptional`, `v.nonOptional`, `v.nonNullable` or `v.nonNullish` gets its limits and the right `aria-required`. A Valibot group that may be `null` and is missing from the values is no longer filled in as `{}`, so it shows one error for the group, as Zod's and ArkType's do.
  - **One message for a whole number:** an integer check in Zod 3, Valibot and ArkType now uses your catalog's `invalidType.int`, as Zod 4's does. Before, ArkType said "must be a multiple of 1", Valibot used `invalidFormat` and Zod 3 `invalidType.default`.
  - **An exact length and an exclusive bound:** Valibot's `v.length(4)`, `v.gtValue(3)` and `v.ltValue(10)`, and ArkType's `'string == 4'`, now use your catalog's `tooSmall` and `tooBig` (with `inclusive: false` for an exclusive bound), as Zod's do. Before, they showed the library's own text.
  - **Words and bytes:** Valibot's `minWords`, `maxWords`, `minBytes` and `maxBytes` no longer use the "characters" message; they fall back to `tooSmall.default` and `tooBig.default` (or `tooSmall.words`, `tooBig.bytes` and the like, if your catalog has them).
  - **A rule that failed, then passed:** after a rule threw (the network was down), a submit that runs it again and gets an answer now goes through. Before, it threw the old error again.
  - **Changing a list through `model`:** `members.value.splice(1, 1)`, `unshift`, `reverse`, `sort` and the other array methods on a model list are list changes, as `field('members').remove` is: the rows keep their `item.key` (so `v-for` doesn't remount them), touched state and server errors. `splice`, `reverse`, `fill` and the others move the rows by position, so a list of equal values (`['a', 'a']`) is right too; a row `fill` or `copyWithin` wrote is a new row. Like `field('members').push`, a change through `model` counts as touching the list, so the list's own error (`.max(3)`) shows at once. Before, `splice` and the like wrote the model's own row views into the values, so rows came out empty or the page hung, and a `push` gave every row a new key. A row read from `model` and written back (`members.value = members.value.filter(...)`) is stored as plain data.
  - **Rules after a list change:** `remove`, `move`, `insert` and the like (on `field` or on `model`) move each row's rule answer and pending call with the row, so `members.*.email` isn't called again for a passing row whose value didn't change. Before, every row after the change ran its rule again, one API call each. A row whose rule failed is still checked again, as its error may be about another row: "already in the list" clears once the other copy is removed, and shows until the new answer. That check waits for `debounce`, so quick list changes ask once. A removed row's pending call, and a check a newer list change replaced, are aborted, and a row whose value changed is still checked.
  - **A row's default after a list change:** a list's row is now compared with its own default, found by its `item.key`, wherever it has moved. A rule skips a row that still holds its default, `field('members.2').reset()` puts back that row's own default, and a row's `dirty` (and `showErrors: 'input'`) compares with it; a row added since has none. Before, each used the default at the row's index, so after a `remove` or `move` a row that still held its default was checked again, counted as dirty and showed its errors, and its `reset()` gave it another row's default. `reset()`, `field('members').reset()`, `setValues` and a whole list written with `setValue('members', rows)` or `members.value = rows` line the rows up with the defaults again, by position.
  - **Resetting a row with no default:** `field('members.2').reset()`, or a field in it, on a row added since the defaults keeps its value and clears its errors, touched and edited state. Before, it set the row to `undefined`, leaving a hole in the list.
  - **Server errors after a list change:** a row's server error that moved with it (`remove`, `move`, `swap`) now has its new path in `allErrors`, and a later `setErrors` no longer puts it back at the old one.
  - **Groups in a union:** a group in a discriminated union's active branch (`card.number` when `type` is `'card'`), and a group in a list's rows (a nullable list's too), is filled in as the form's own groups are, so a missing group shows its fields' errors instead of one error for the group that no input shows, with Zod, Valibot (`v.variant`) and ArkType.
  - **`aria-required` in a union:** a field in a union reads its limits and `aria-required` from the active branch (by `type` in a discriminated union, Valibot's `v.variant` or an ArkType union), so a key that is a number in one branch and may be `null` in another is required only in the first. Before a branch is picked, the field gets `aria-required` only if every branch requires it.
  - **A refetch with the same data:** `defaultValues` that load again with equal data no longer reset the form, so a failed submit's errors stay on screen.

## 0.0.5

### Patch Changes

- [#11](https://github.com/Mini-Sylar/vael-form/pull/11) [`7e3e437`](https://github.com/Mini-Sylar/vael-form/commit/7e3e43726ce77855d8ad2308af24f7a6c20ce924) Thanks [@Mini-Sylar](https://github.com/Mini-Sylar)! - ## Fixes

  - **Limits on a nullable field:** a field that may be `null`, such as Zod's `z.number().int().min(1).nullable()` or ArkType's `'1 <= number.integer | null'`, now gets its `min`, `max`, `step`, `minlength` and `maxlength` on `attrs`. Before, only Valibot's did.

  ## Docs
  - A control that can be emptied writes `null`: a number input you clear, a `clearable` select, a date picker. Give its field a schema that takes `null`: `.nullable()` when empty is a valid answer, or `.nullable().pipe(z.number())` when the field is required, so `null` shows the field's "required" message. Then vue-tsc with `strictTemplates` accepts the `v-model` too.

## 0.0.4

### Patch Changes

- [#9](https://github.com/Mini-Sylar/vael-form/pull/9) [`5557bb0`](https://github.com/Mini-Sylar/vael-form/commit/5557bb0ff8360f15109eb6c831c702fd78c93d0c) Thanks [@Mini-Sylar](https://github.com/Mini-Sylar)! - ## Fixes

  - **Focus on a failed submit:** when the first invalid field is a group that can't take focus, such as a `<fieldset>` of checkboxes or a `role="radiogroup"` element, the form now focuses the group's checked radio, or its first enabled control, so a screen reader announces the field and its error. Before, focus stayed where it was. This works for a submit event and for `handleSubmit()` called from code.
  - **Server errors:** an error set with `setErrors` on a group now clears when a field inside the group changes (`setErrors({ address: '…' })`, then the user edits `address.street`). A list's own error now clears on a list operation (`push`, `remove`, `move`, …), and its rows' errors move with the rows. Errors on other fields, and the form's own error, stay until the next submit.
  - **`field.untouch()`** hides the field's errors after a submit too, until the field is left again or the form is submitted again. Before, it had no effect once the form had been submitted. `field.reset()` does the same, so a field reset after a submit doesn't show an error for its default value.

  ## Docs
  - `attrs` limits, `aria-required`, and groups that exist before the data loads come from Zod 4 (classic), Valibot and ArkType. Zod Mini and Zod 3 map their errors to your catalog, but need defaults for nested groups (`address: {}`).
  - A locale switch checks the form again. The message parameters now list every value (`{path}`, `{values}`, `{origin}`, Zod's `{prefix}`, `{suffix}`, `{includes}`; Valibot's `{requirement}`).
  - An Effect 3 schema becomes a Standard Schema with `Schema.standardSchemaV1`; Effect 4 uses `Schema.toStandardSchemaV1`.
  - `provideFormConfig` replaces the app's config for its component tree; it isn't merged.
  - After a save, `form.reset(form.values.value)` makes what was saved the new defaults.

## 0.0.3

### Patch Changes

- [#6](https://github.com/Mini-Sylar/vael-form/pull/6) [`a0e5150`](https://github.com/Mini-Sylar/vael-form/commit/a0e51505e6c17039602eff56a9bd1cc0427c126a) Thanks [@Mini-Sylar](https://github.com/Mini-Sylar)! - ## Fixes

  - **Steps:** `validate('account')` shows the step’s field errors when the form has no `defaultValues` for that group. Before, the schema saw the group as missing and reported one error on the group itself, so the step didn’t advance and showed nothing. A required group the data doesn’t have yet is now checked as an empty object, read from the schema (Zod, Valibot, ArkType). Your values and `dirty` don’t change, and an optional group stays optional.
  - **Messages:** a choice not made yet, such as an unchosen radio or a cleared select, shows `required` (“Plan is required”) instead of `invalidValue`. This covers Zod’s `enum` and `literal`, Valibot’s `picklist`, `literal`, `enum` and `variant`, and ArkType’s unions of values. A value outside the options still shows `invalidValue`.
  - **Types:** `model` has the fields of every branch of a union at the top of the schema, as `errors` and `attrs` already did. With a discriminated union on `method`, `model.number` and `model.iban` are both there.
  - **Types:** `FieldAttrs` declares the attributes it carries from the schema: `aria-required`, `minlength`, `maxlength`, `min`, `max` and `step`.
  - **README:** `showErrors: 'input'` shows an error as soon as the value changes, or once the field is left.

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
