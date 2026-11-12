import { shallowRef } from 'vue'
import { z } from 'zod'
import { useForm } from '../../src'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ArrayField, Field, FieldTree, FormModel, ModelRef, Path, PathValue } from '../../src'
import { FIELD_KEY_LIST } from '../../src/constants'
import type { Equal, Expect } from './utils'

type In<S extends z.ZodType> = z.input<S>
type Has<T, P extends string> = P extends Path<T> ? true : false

// Compile-time tests for the schema shapes real apps have. A failure here is a type that lies.

// 1 optional / nullable groups
const optGroup = z.object({
  address: z.object({ street: z.string() }).optional(),
  bill: z.object({ vat: z.string() }).nullable(),
})
type OG = In<typeof optGroup>
export type c1 = [
  Expect<Equal<Has<OG, 'address.street'>, true>>,
  Expect<Equal<Has<OG, 'bill.vat'>, true>>,
  Expect<Equal<PathValue<OG, 'address.street'>, string>>,
  Expect<Equal<FieldTree<OG>['address']['street'], Field<string>>>,
  Expect<Equal<FieldTree<OG>['bill']['vat'], Field<string>>>,
]

// 2 tuple
// tuples are one field; their positions are paths
const tup = z.object({ range: z.tuple([z.string(), z.number()]) })
type TP = In<typeof tup>
export const tf2 = useForm({ schema: tup }).field('range')
export type c2 = [
  Expect<Equal<typeof tf2, Field<[string, number]>>>,
  Expect<Equal<PathValue<TP, 'range.0'>, string>>,
  Expect<Equal<PathValue<TP, 'range.1'>, number>>,
]

// 3 nested arrays
const nested = z.object({
  grid: z.array(z.array(z.number())),
  rows: z.array(z.object({ cells: z.array(z.object({ v: z.string() })) })),
})
type NA = In<typeof nested>
export type c3 = [
  Expect<Equal<Has<NA, 'grid.0.1'>, true>>,
  Expect<Equal<PathValue<NA, 'rows.0.cells.1.v'>, string>>,
  Expect<Equal<FieldTree<NA>['grid'] extends ArrayField<number[]> ? true : false, true>>,
]
const nf = useForm({ schema: nested })
export const n1 = nf.field('rows').items[0]!.field.cells.items[0]!.field.v
export type c3b = [Expect<Equal<typeof n1, Field<string>>>]

// 4 array of discriminated unions
const pay = z.discriminatedUnion('type', [
  z.object({ type: z.literal('card'), number: z.string() }),
  z.object({ type: z.literal('bank'), iban: z.string() }),
])
const list = z.object({ payments: z.array(pay) })
const lf = useForm({ schema: list })
export const u1 = lf.field('payments').items[0]!.field.iban
export const u2 = lf.field('payments').items[0]!.field.number
export const u3 = lf.field('payments.0.iban')
export type c4 = [
  Expect<Equal<typeof u1, Field<string>>>,
  Expect<Equal<typeof u2, Field<string>>>,
  Expect<Equal<typeof u3, Field<string>>>,
]

// 5 record
const rec = z.object({ prices: z.record(z.string(), z.object({ amount: z.number() })) })
type RC = In<typeof rec>
export type c5 = [
  Expect<Equal<PathValue<RC, 'prices.eur.amount'>, number>>,
  Expect<Equal<Has<RC, 'prices.eur.amount'>, true>>,
]
const rf = useForm({ schema: rec })
export const r1 = rf.field('prices.eur.amount')
export type c5b = [Expect<Equal<typeof r1, Field<number>>>]

// 6 intersection
const inter = z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }))
type IN = In<typeof inter>
export type c6 = [Expect<Equal<Has<IN, 'a'>, true>>, Expect<Equal<Has<IN, 'b'>, true>>]

// 7 recursive
type TreeNode = { name: string; children: TreeNode[] }
const node: z.ZodType<TreeNode, TreeNode> = z.lazy(() =>
  z.object({ name: z.string(), children: z.array(node) }),
)
const tree = z.object({ root: node })
type TR = In<typeof tree>
export type c7 = [
  Expect<Equal<Has<TR, 'root.name'>, true>>,
  Expect<Equal<Has<TR, 'root.children.0.children.1.name'>, true>>,
]
const tf = useForm({ schema: tree })
export const t1 = tf.field('root.children.0.children.1.name')
export type c7b = [Expect<Equal<typeof t1, Field<string>>>]

// 8 Date File Map Set
const misc = z.object({
  when: z.date(),
  file: z.instanceof(File),
  tags: z.set(z.string()),
  m: z.map(z.string(), z.number()),
})
type MI = In<typeof misc>
export type c8 = [
  Expect<Equal<Has<MI, 'when.getTime'>, false>>,
  Expect<Equal<Has<MI, 'file.name'>, false>>,
  Expect<Equal<Has<MI, 'tags.size'>, false>>,
  Expect<Equal<Has<MI, 'm.size'>, false>>,
]

// 9 input vs output
const io = z.object({
  n: z.string().transform((s) => Number(s)),
  d: z.number().default(5),
  c: z.coerce.date(),
})
const iof = useForm({
  schema: io,
  onSubmit: (v) => void (v satisfies { n: number; d: number; c: Date }),
})
export const i1 = iof.field('n')
export const i2 = iof.field('d')
export type c9 = [Expect<Equal<typeof i1, Field<string>>>, Expect<Equal<typeof i2, Field<number>>>]

// 10 enum, literal, nullable primitive, brand
const prim = z.object({
  role: z.enum(['a', 'b']),
  nick: z.string().nullable(),
  id: z.string().brand<'Id'>(),
})
const pf = useForm({ schema: prim })
export const p1 = pf.field('role')
export const p2 = pf.field('nick')
export const p3 = pf.field('id')
export type c10 = [
  Expect<Equal<typeof p1, Field<'a' | 'b'>>>,
  Expect<Equal<typeof p2, Field<string | null>>>,
]

// 11 nullable / optional array
const oa = z.object({
  list: z.array(z.string()).optional(),
  nl: z.array(z.object({ x: z.string() })).nullable(),
})
const of = useForm({ schema: oa })
export const o1 = of.field('list')
export const o2 = of.field('nl').items[0]!.field.x
export type c11 = [Expect<Equal<typeof o2, Field<string>>>]

// 12 setValue / initial typing
nf.setValue('rows.0.cells.1.v', 'x')
// @ts-expect-error a number is not a string
nf.setValue('rows.0.cells.1.v', 1)
nf.setValue('rows.0.cells', [{ v: 'x' }])
useForm({ schema: nested, defaultValues: { rows: [{ cells: [{ v: 'a' }] }] } })
// @ts-expect-error bad initial
useForm({ schema: nested, defaultValues: { rows: [{ cells: [{ v: 1 }] }] } })

// 14 untyped and loose schemas still work
const anyForm = useForm({ schema: {} as StandardSchemaV1 })
export const a1 = anyForm.field('whatever')
export const a2 = anyForm.field('x.y.z')
const loose = useForm({ schema: z.object({ meta: z.any(), data: z.unknown() }) })
export type c14 = [
  Expect<Equal<typeof a1, Field<unknown>>>,
  Expect<Equal<typeof a2, Field<unknown>>>,
  Expect<Equal<ReturnType<typeof loose.field<'meta'>>, Field<unknown>>>,
  Expect<Equal<ReturnType<typeof loose.field<'data'>>, Field<unknown>>>,
]

// 15 nullable keeps null; nullish too
const nul = useForm({ schema: z.object({ nick: z.string().nullable(), n: z.number().nullish() }) })
export type c15 = [
  Expect<Equal<ReturnType<typeof nul.field<'nick'>>, Field<string | null>>>,
  Expect<Equal<ReturnType<typeof nul.field<'n'>>, Field<number | null>>>,
]

// 13 labels / serverIssues typed
useForm({ schema: nested, labels: { 'rows.0.cells.0.v': 'x' } })
nf.setErrors({ 'rows.0.cells.0.v': 'bad' })

// 16 a schema in a ref keeps its fields typed
const refSchema = shallowRef(z.object({ title: z.string() }))
export const refForm = useForm({ schema: refSchema })
export type c16 = [Expect<Equal<ReturnType<typeof refForm.field<'title'>>, Field<string>>>]

// 17 showErrors takes a mode, or a mode per typed path
useForm({ schema: nested, showErrors: 'input' })
useForm({
  schema: nested,
  showErrors: { default: 'blur', 'rows.0.cells': 'submit', grid: 'input' },
})
// @ts-expect-error not a path of the schema
useForm({ schema: nested, showErrors: { default: 'blur', nope: 'input' } })
// @ts-expect-error not a mode
useForm({ schema: nested, showErrors: { grid: 'change' } })
useForm({ schema: {} as StandardSchemaV1, showErrors: { anything: 'input' } })

// 18 the keys a field answers to are exactly the keys of `ArrayField`, so a rename can't leave one behind
export type c18 = [Expect<Equal<(typeof FIELD_KEY_LIST)[number], keyof ArrayField<unknown>>>]

// 19 validate rules, without a schema library: typed paths, typed values, typed by defaultValues
const plain = useForm({
  defaultValues: { email: '', age: 0, members: [{ name: '' }] },
  validate: {
    email: [(v) => !v && 'Required', (v) => v.includes('@') || 'Not an email'],
    age: (v) => v >= 18 || 'Too young',
    'members.*.name': (v, { path }) => !v && `Name ${path} is required`,
    '': (values) => values.members.length > 0 || 'Add a member',
  },
})
export type c19 = [
  Expect<Equal<ReturnType<typeof plain.field<'email'>>, Field<string>>>,
  Expect<Equal<ReturnType<typeof plain.field<'age'>>, Field<number>>>,
]
// @ts-expect-error not a path of the values
useForm({ defaultValues: { email: '' }, validate: { nope: () => 'x' } })
// @ts-expect-error the rule gets a number here
useForm({ defaultValues: { age: 0 }, validate: { age: (v) => v.toUpperCase() } })
// a union is named, and narrowed in a rule through the values
type Payment = { type: 'card'; number: string } | { type: 'bank'; iban: string }
const union = useForm<Payment>({
  defaultValues: { type: 'card', number: '' },
  validate: { iban: (v, { values }) => values.type === 'bank' && !v && 'Required' },
})
export type c19b = [Expect<Equal<ReturnType<typeof union.field<'iban'>>, Field<string>>>]
// onSubmit's context has the values as FormData
useForm({
  schema: z.object({ a: z.string() }),
  onSubmit: (_values, { formData, element }) => {
    type T = [
      Expect<Equal<typeof formData, FormData>>,
      Expect<Equal<typeof element, HTMLFormElement | null>>,
    ]
    return null as unknown as T
  },
})

// 20 form.model: what v-model binds to
const mdl = z.object({
  name: z.string(),
  age: z.number().optional(),
  address: z.object({ street: z.string() }),
  tags: z.array(z.string()),
  rows: z.array(z.object({ n: z.number() })),
})
type M = FormModel<In<typeof mdl>>
export type c20 = [
  Expect<Equal<M['name'], ModelRef<string | undefined>>>,
  Expect<Equal<M['age'], ModelRef<number | undefined>>>,
  Expect<Equal<M['address']['value']['street'], string | undefined>>,
  Expect<Equal<M['tags'], ModelRef<string[]>>>,
  Expect<Equal<M['rows']['value'][number]['n'], number | undefined>>,
  Expect<Equal<FormModel<unknown>, Record<string, ModelRef<any>>>>,
]
const modelForm = useForm({ schema: mdl, defaultValues: { name: '' } })
export const modelName: ModelRef<string | undefined> = modelForm.model.name
// a discriminated union at the top: model has every branch's fields, like errors and attrs
const payModel = useForm({
  schema: z.discriminatedUnion('method', [
    z.object({ method: z.literal('card'), number: z.string() }),
    z.object({ method: z.literal('bank'), iban: z.string() }),
  ]),
  defaultValues: { method: 'card', number: '' },
})
export type c30 = [
  Expect<Equal<typeof payModel.model.number, ModelRef<string | undefined>>>,
  Expect<Equal<typeof payModel.model.iban, ModelRef<string | undefined>>>,
  Expect<Equal<typeof payModel.model.method, ModelRef<'card' | 'bank' | undefined>>>,
]
// attrs carries the schema's limits
const limited = useForm({ schema: z.object({ title: z.string().max(40), n: z.number().min(1) }) })
export type c31 = [
  Expect<Equal<typeof limited.attrs.title.maxlength, number | undefined>>,
  Expect<Equal<typeof limited.attrs.n.min, number | undefined>>,
  Expect<Equal<(typeof limited.attrs.title)['aria-required'], true | undefined>>,
]
