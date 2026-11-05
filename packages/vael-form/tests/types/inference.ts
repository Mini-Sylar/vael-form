// Compile-time tests: `pnpm typecheck` fails when an inference or a path stops working.
import { type } from 'arktype'
import * as v from 'valibot'
import { useForm, useField, useFormContext, msg } from '../../src'
import type { ArrayField, Field, Form, FormI18n, Path, PathValue } from '../../src'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import type { Equal, Expect } from './utils'

const zodSchema = z.object({
  email: z.string().email(),
  age: z.coerce.number(),
  address: z.object({ street: z.string(), zip: z.string().optional() }),
  tags: z.array(z.string()),
  items: z.array(z.object({ name: z.string(), qty: z.number() })),
  agree: z.boolean(),
  born: z.date(),
})
type ZodInput = z.input<typeof zodSchema>

// Paths
type ZodPaths = Path<ZodInput>
export type _paths = [
  Expect<Equal<'email' extends ZodPaths ? true : false, true>>,
  Expect<Equal<'address.street' extends ZodPaths ? true : false, true>>,
  Expect<Equal<'address.zip' extends ZodPaths ? true : false, true>>,
  Expect<Equal<'items.0.name' extends ZodPaths ? true : false, true>>,
  Expect<Equal<'tags.3' extends ZodPaths ? true : false, true>>,
  Expect<Equal<'nope' extends ZodPaths ? true : false, false>>,
  Expect<Equal<'address.nope' extends ZodPaths ? true : false, false>>,
  Expect<Equal<'born.getTime' extends ZodPaths ? true : false, false>>,
]
export type _values = [
  Expect<Equal<PathValue<ZodInput, 'email'>, string>>,
  Expect<Equal<PathValue<ZodInput, 'address.zip'>, string | undefined>>,
  Expect<Equal<PathValue<ZodInput, 'items.0.qty'>, number>>,
  Expect<Equal<PathValue<ZodInput, 'tags'>, string[]>>,
  Expect<Equal<PathValue<ZodInput, 'born'>, Date>>,
]

// The form, from Zod
const form = useForm({ schema: zodSchema, defaultValues: { email: '' } })
export const _email = form.field('email')
export const _street = form.field('address.street')
export const _tags = form.field('tags')
export const _items = form.field('items')
export type _fields = [
  Expect<Equal<typeof _email, Field<string>>>,
  Expect<Equal<typeof _street, Field<string>>>,
  Expect<Equal<typeof _tags, ArrayField<string>>>,
  Expect<Equal<typeof _email.value, string | undefined>>,
  Expect<Equal<(typeof _items.items)[number]['field']['name'], Field<string>>>,
]

// By path
export const _byPath = form.field('items.0.qty')
export const _byPathArray = form.field('items')
export type _field = [
  Expect<Equal<typeof _byPath, Field<number>>>,
  Expect<Equal<typeof _byPathArray, ArrayField<{ name: string; qty: number }>>>,
]
form.setValue('address.street', 'Main St')
// @ts-expect-error -- wrong type for the path
form.setValue('address.street', 3)
// @ts-expect-error -- no such path
form.field('address.nope')
// @ts-expect-error -- no such field
void form.field('nope')

// onSubmit gets the schema's OUTPUT (age was coerced to a number)
useForm({
  schema: zodSchema,
  onSubmit: (values, { submitter }) => {
    type Out = [
      Expect<Equal<typeof values.age, number>>,
      Expect<Equal<typeof submitter, HTMLElement | null>>,
    ]
    return null as unknown as Out
  },
})
const _submitNow = form.handleSubmit()
const _submitWith = form.handleSubmit((values, { submitter }) => {
  // the schema's output and the same context as onSubmit
  const age: number = values.age
  const button: HTMLElement | null = submitter
  return [age, button]
})
export type _handler = [
  Expect<Equal<typeof _submitNow, Promise<boolean>>>,
  Expect<Equal<typeof _submitWith, (event?: Event) => Promise<boolean>>>,
]

// setErrors completes paths
form.setErrors({ email: 'taken', 'address.street': ['too long'] })
// @ts-expect-error -- not a path
form.setErrors({ emial: 'taken' })

// Labels complete paths
useForm({ schema: zodSchema, labels: { email: 'Email', 'address.street': 'Street' } })
// @ts-expect-error -- not a path
useForm({ schema: zodSchema, labels: { emial: 'Email' } })

// Valibot
const valibotSchema = v.object({ name: v.string(), nested: v.object({ n: v.number() }) })
const valibotForm = useForm({ schema: valibotSchema })
export const _vname = valibotForm.field('name')
export const _vn = valibotForm.field('nested.n')
export type _valibot = [
  Expect<Equal<typeof _vname, Field<string>>>,
  Expect<Equal<typeof _vn, Field<number>>>,
]

// ArkType
const arkSchema = type({ name: 'string', 'nick?': 'string', list: 'string[]' })
const arkForm = useForm({ schema: arkSchema })
export const _aname = arkForm.field('name')
export const _anick = arkForm.field('nick')
export type _ark = [
  Expect<Equal<typeof _aname, Field<string>>>,
  Expect<Equal<typeof _anick, Field<string>>>,
]

// Context: the schema types the paths
export const _ctx = useFormContext<typeof zodSchema>().field('address.zip')
export const _any = useField<number>('qty')
export type _context = [
  Expect<Equal<typeof _ctx, Field<string>>>,
  Expect<Equal<typeof _any, Field<number>>>,
]

// vue-i18n's composer is a FormI18n as it is
export function _i18n(): FormI18n {
  return useI18n()
}
export const _msg = msg('errors.min', { min: 3 }, 'At least {min}')

// Destructuring: fields from form.fields, methods from the form; schema keys never clash
const _dEmail = form.field('email')
const _dAddress = form.field('address.street')
const { reset: _dReset } = form
export type _destructured = [
  Expect<Equal<typeof _dEmail, Field<string>>>,
  Expect<Equal<typeof _dAddress, Field<string>>>,
  Expect<Equal<typeof _dReset, Form<typeof zodSchema>['reset']>>,
]
const clash = useForm({ schema: z.object({ values: z.string(), name: z.string() }) })
export type _clash = [
  Expect<Equal<ReturnType<typeof clash.field<'name'>>, Field<string>>>,
  Expect<Equal<ReturnType<typeof clash.field<'values'>>, Field<string>>>,
  Expect<
    Equal<
      typeof clash.values,
      Form<z.ZodObject<{ values: z.ZodString; name: z.ZodString }>>['values']
    >
  >,
]
