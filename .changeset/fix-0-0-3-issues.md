---
'vael-form': patch
---

## Fixes

- **Steps:** `validate('account')` shows the step’s field errors when the form has no `defaultValues` for that group. Before, the schema saw the group as missing and reported one error on the group itself, so the step didn’t advance and showed nothing. A required group the data doesn’t have yet is now checked as an empty object, read from the schema (Zod, Valibot, ArkType). Your values and `dirty` don’t change, and an optional group stays optional.
- **Messages:** a choice not made yet, such as an unchosen radio or a cleared select, shows `required` (“Plan is required”) instead of `invalidValue`. This covers Zod’s `enum` and `literal`, Valibot’s `picklist`, `literal`, `enum` and `variant`, and ArkType’s unions of values. A value outside the options still shows `invalidValue`.
- **Types:** `model` has the fields of every branch of a union at the top of the schema, as `errors` and `attrs` already did. With a discriminated union on `method`, `model.number` and `model.iban` are both there.
- **Types:** `FieldAttrs` declares the attributes it carries from the schema: `aria-required`, `minlength`, `maxlength`, `min`, `max` and `step`.
- **README:** `showErrors: 'input'` shows an error as soon as the value changes, or once the field is left.
