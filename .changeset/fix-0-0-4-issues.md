---
'vael-form': patch
---

## Fixes

- **Focus on a failed submit:** when the first invalid field is a group that can't take focus, such as a `<fieldset>` of checkboxes or a `role="radiogroup"` element, the form now focuses the group's checked radio, or its first enabled control, so a screen reader announces the field and its error. Before, focus stayed where it was. This works for a submit event and for `handleSubmit()` called from code.
- **Server errors:** an error set with `setErrors` on a group now clears when a field inside the group changes (`setErrors({ address: '…' })`, then the user edits `address.street`). A list's own error now clears on a list operation (`push`, `remove`, `move`, …), and its rows' errors move with the rows. Errors on other fields, and the form's own error, stay until the next submit.
- **`field.untouch()`** hides the field's errors after a submit too, until the field is left again or the form is submitted again. Before, it had no effect once the form had been submitted. `field.reset()` does the same, so a field reset after a submit doesn't show an error for its default value.

## Docs

- `attrs` limits, `aria-required`, and groups that exist before the data loads come from Zod 4 (classic), Valibot and ArkType. Zod Mini and Zod 3 map their errors to your catalog, but need defaults for nested groups (`address: {}`).
- A locale switch checks the form again. The message parameters now list every value (`{path}`, `{values}`, `{origin}`, Zod's `{prefix}`, `{suffix}`, `{includes}`; Valibot's `{requirement}`).
- An Effect 3 schema becomes a Standard Schema with `Schema.standardSchemaV1`; Effect 4 uses `Schema.toStandardSchemaV1`.
- `provideFormConfig` replaces the app's config for its component tree; it isn't merged.
- After a save, `form.reset(form.values.value)` makes what was saved the new defaults.
