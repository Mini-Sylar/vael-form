---
'vael-form': patch
---

## Fixes

- **Limits on a nullable field:** a field that may be `null`, such as Zod's `z.number().int().min(1).nullable()` or ArkType's `'1 <= number.integer | null'`, now gets its `min`, `max`, `step`, `minlength` and `maxlength` on `attrs`. Before, only Valibot's did.

## Docs

- A control that can be emptied writes `null`: a number input you clear, a `clearable` select, a date picker. Give its field a schema that takes `null`: `.nullable()` when empty is a valid answer, or `.nullable().pipe(z.number())` when the field is required, so `null` shows the field's "required" message. Then vue-tsc with `strictTemplates` accepts the `v-model` too.
