import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { MaybeRefOrGetter, Raw, Ref } from 'vue'

/** Values that are one field, not a group of fields. */
export type Leaf =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Date
  | File
  | Blob
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any function
  | ((...args: any[]) => any)

type IsAny<T> = 0 extends 1 & T ? true : false

/** A list of any length, as opposed to a tuple with fixed positions. */
type IsList<V> = [V] extends [never]
  ? false
  : [V] extends [readonly unknown[]]
    ? V extends readonly unknown[]
      ? number extends V['length']
        ? true
        : false
      : false
    : false

type ListItem<V> = V extends readonly (infer U)[] ? U : never

/** The value without `undefined`; `null` is a value a field can hold. */
type Present<V> = Exclude<V, undefined>

type KeysOfUnion<T> = T extends unknown ? keyof T : never

type ValueOfKey<T, K> = T extends unknown ? (K extends keyof T ? T[K] : never) : never

export type DeepPartial<T> = T extends Leaf
  ? T
  : T extends readonly unknown[]
    ? number extends T['length']
      ? DeepPartial<T[number]>[]
      : { [K in keyof T]: DeepPartial<T[K]> }
    : { [K in keyof T]?: DeepPartial<T[K]> }

// A recursive schema (a comment tree) has no end; past this depth any suffix is accepted.
type MaxDepth = 12

type PathOf<
  K extends string | number,
  V,
  D extends unknown[],
  X extends string | number,
> = V extends Leaf ? `${K}` : `${K}` | `${K}.${Path<V, D, X>}`

/**
 * Every path into `T`: `'email'`, `'address.street'`, `` `items.${number}.name` ``. `X` is what
 * stands for a list index: a number, or `'*'` for the paths of `rules`.
 */
export type Path<T, D extends unknown[] = [], X extends string | number = number> =
  IsAny<T> extends true
    ? string
    : unknown extends T
      ? string
      : D['length'] extends MaxDepth
        ? string
        : T extends readonly unknown[]
          ? number extends T['length']
            ? PathOf<X, T[number], [...D, 0], X>
            : {
                [I in keyof T & `${number}`]: PathOf<I, T[I], [...D, 0], X>
              }[keyof T & `${number}`]
          : T extends Leaf
            ? never
            : { [K in keyof T & string]-?: PathOf<K, T[K], [...D, 0], X> }[keyof T & string]

type ListPathValue<U, P extends string> = P extends `${infer K}.${infer R}`
  ? K extends `${number}` | '*'
    ? PathValue<NonNullable<U>, R>
    : never
  : P extends `${number}` | '*'
    ? U
    : never

type KeyPathValue<T, P extends string> = P extends `${infer K}.${infer R}`
  ? K extends keyof T
    ? PathValue<NonNullable<T[K]>, R>
    : never
  : P extends keyof T
    ? T[P]
    : never

/** The type at `P` in `T`; `''` is the whole value. */
export type PathValue<T, P extends string> = P extends ''
  ? T
  : IsAny<T> extends true
    ? any // eslint-disable-line @typescript-eslint/no-explicit-any -- an untyped schema stays untyped
    : unknown extends T
      ? unknown
      : T extends readonly unknown[]
        ? number extends T['length']
          ? ListPathValue<T[number], P>
          : KeyPathValue<T, P>
        : KeyPathValue<T, P>

export type InferInput<S extends StandardSchemaV1> = StandardSchemaV1.InferInput<S>
export type InferOutput<S extends StandardSchemaV1> = StandardSchemaV1.InferOutput<S>

// Message keys autocomplete once an app registers them:
//   declare module 'vael-form' { interface Register { messageKeys: 'errors.required' | 'errors.min' } }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmented by the app
export interface Register {}

export type MessageKey = Register extends { messageKeys: infer K extends string } ? K : string

export type MessageParams = Record<string, unknown>

/** vue-i18n's `useI18n()` fits as is; so does `{ t }` over any dictionary. */
export interface FormI18n {
  t: (key: string, params?: MessageParams, options?: Record<string, unknown>) => string
  /** The current locale; the form checks again when it changes. */
  locale?: MaybeRefOrGetter<string>
}

/**
 * When a field's errors show. Every mode shows them after a submit, and keeps them live from then on.
 * - `'edited'` (the default): once the field has been changed and left, so passing over an empty
 *   field says nothing.
 * - `'blur'`: once the field is left, even if it was never changed.
 * - `'input'`: as soon as the field's value changed or it was left.
 * - `'submit'`: only after the first submit.
 */
export type ShowErrors = 'edited' | 'blur' | 'input' | 'submit'

/**
 * One mode for every field, or a mode per path with `default` for the rest. A group's mode covers
 * everything under it and the nearest path wins: `{ default: 'blur', members: 'submit', 'members.0.name': 'input' }`.
 * A top-level field named `default` can't be set apart.
 */
export type ShowErrorsFor<I = unknown> =
  | ShowErrors
  | ({ default?: ShowErrors } & { [P in Path<I>]?: ShowErrors })

/** What `app.use(formPlugin, config)` or `provideFormConfig` hands every form below it. */
export interface FormConfig {
  i18n?: FormI18n
  showErrors?: ShowErrorsFor
  /** The namespace of the form's messages in your catalog. Default `'formKit'`. */
  keyPrefix?: string
}

/** A problem with one path. `message` is the final text, in the current locale. */
export interface FormError {
  path: string
  message: string
}

// A type alias, so it can be spread into a function that takes a `Record<string, unknown>`.
export type FieldAttrs = {
  readonly id: string
  readonly name: string
  readonly 'aria-invalid': true | undefined
  readonly 'aria-describedby': string | undefined
  /** Marks the field as left once focus moves out of what the attrs are on. */
  readonly onFocusout: (event?: FocusEvent) => void
  /** The id for the element that shows the error (`aria-describedby` points at it). Not spread onto the input. */
  readonly errorId: string
  /** From the schema, once it has loaded (Zod, Valibot, ArkType): a value that can't be left empty. */
  readonly 'aria-required'?: true
  /** From the schema: a text value's length limits. */
  readonly minlength?: number
  readonly maxlength?: number
  /** From the schema: a number's limits, and `multipleOf` as the step. */
  readonly min?: number
  readonly max?: number
  readonly step?: number
}

/** What `field.watch` hands its handler. */
export interface FieldChange<T> {
  value: T | undefined
  oldValue: T | undefined
}

export interface FieldWatchOptions {
  /** Milliseconds to wait after the last change. Default 0. */
  debounce?: number
  /** Also run once now, with the current value. */
  immediate?: boolean
}

export interface Field<T = unknown> {
  readonly path: string
  readonly id: string
  /** The `id` for the element that shows the error; `aria-describedby` points at it. */
  readonly errorId: string
  /** `undefined` until the form or the user sets it. Works with `v-model`. */
  value: T | undefined
  /** The first error to show, or `undefined`. Follows the form's `showErrors`. */
  readonly error: string | undefined
  /** Every error to show. */
  readonly errors: readonly string[]
  /** Every error, shown or not: for a live checklist of rules before the field is touched. */
  readonly allErrors: readonly FormError[]
  readonly touched: boolean
  /** Whether the value differs from the form's default value. */
  readonly dirty: boolean
  /** No errors at this path or under it. */
  readonly valid: boolean
  /** A rule for this path (or under it) is waiting to run, or running. */
  readonly pending: boolean
  /**
   * Runs `handler` when the value changes by a user edit or `setValue`; not on `reset()`, `setValues()`
   * or loaded defaults. Batched per tick. Its own writes to this field don't run it again. Stops
   * with the component, or when you call what it returns.
   */
  watch(handler: (change: FieldChange<T>) => unknown, options?: FieldWatchOptions): () => void
  /** Spread on the input (or a group's `<fieldset>`): `id`, `name`, `aria-invalid`, `aria-describedby` and `onFocusout`. */
  readonly attrs: FieldAttrs
  /** Validates the form, shows this field's errors, and says whether it's valid. */
  validate(): Promise<boolean>
  touch(): void
  /** Forgets that the field was touched, and hides its errors until it is left again. */
  untouch(): void
  reset(value?: T): void
}

export interface ArrayItem<T> {
  /** Stable across moves and removals: use it as the `v-for` key. */
  readonly key: string
  readonly index: number
  readonly field: FieldTree<T>
}

export interface ArrayField<T> extends Field<T[]> {
  readonly items: readonly ArrayItem<T>[]
  push(value: T): void
  insert(index: number, value: T): void
  remove(index: number): void
  move(from: number, to: number): void
  swap(a: number, b: number): void
  replace(values: T[]): void
  /** Removes every item. */
  clear(): void
}

/** The field for a value of type `V`: a list gets list methods. */
export type FieldFor<V> = unknown extends V
  ? Field<unknown>
  : [IsList<NonNullable<V>>] extends [true]
    ? ArrayField<ListItem<NonNullable<V>>>
    : Field<Present<V>>

/**
 * `form.fields`: a group is its children, a list is an `ArrayField`, everything else a `Field`
 * (a tuple is one field). A union of groups has the children of every branch. A group's own
 * errors are on `form.field('group')`.
 */
export type FieldTree<T> = unknown extends T
  ? Field<unknown>
  : [IsList<NonNullable<T>>] extends [true]
    ? ArrayField<ListItem<NonNullable<T>>>
    : [NonNullable<T>] extends [Leaf | readonly unknown[]]
      ? Field<Present<T>>
      : [NonNullable<T>] extends [object]
        ? {
            readonly [K in KeysOfUnion<NonNullable<T>> & string]-?: FieldTree<
              ValueOfKey<NonNullable<T>, K>
            >
          }
        : Field<Present<T>>

/** A list's rows: values stay what they are, groups become objects you can write to. */
type ModelRow<U> = [NonNullable<U>] extends [Leaf | readonly unknown[]] ? U : ModelFor<U>

/** What `v-model` binds to: a leaf may be unset, a group is an object of these, a list an array of them. */
export type ModelFor<V> = unknown extends V
  ? any
  : [IsList<NonNullable<V>>] extends [true]
    ? ModelRow<ListItem<NonNullable<V>>>[]
    : [NonNullable<V>] extends [Leaf | readonly unknown[]]
      ? V | undefined
      : [NonNullable<V>] extends [object]
        ? { [K in KeysOfUnion<NonNullable<V>> & string]-?: ModelFor<ValueOfKey<NonNullable<V>, K>> }
        : V | undefined

/** A field's `v-model` ref, with a `watch` that only hears the user (not a reset or a load). Script only. */
export type ModelRef<T> = Ref<T> & {
  watch(handler: (change: FieldChange<T>) => unknown, options?: FieldWatchOptions): () => void
}

/** `form.model`: a ref per top-level field; any name when the schema doesn't say. */
export type FormModel<I> = unknown extends I
  ? Record<string, ModelRef<any>>
  : { readonly [K in KeysOfUnion<I> & string]-?: ModelRef<ModelFor<ValueOfKey<I, K>>> }

/** `errors` and `attrs`: the schema's shape with `L` at each field (a list is one field). */
type Tree<T, L> = unknown extends T
  ? Record<string, any>
  : [NonNullable<T>] extends [Leaf | readonly unknown[]]
    ? L
    : [NonNullable<T>] extends [object]
      ? {
          readonly [K in KeysOfUnion<NonNullable<T>> & string]-?: Tree<
            ValueOfKey<NonNullable<T>, K>,
            L
          >
        }
      : L

/** The message to show at each field, or `undefined`: `errors.email`, `errors.address.street`. */
export type FormErrors<I> = Tree<I, string | undefined>
/** What to spread on each input: `v-bind="attrs.email"`. */
export type FormAttrs<I> = Tree<I, FieldAttrs>

/** `form.fields`; any field name when the schema doesn't say. */
export type FormFields<I> = unknown extends I ? Record<string, Field<unknown>> : FieldTree<I>

export interface SubmitContext<S extends StandardSchemaV1> {
  form: Form<S>
  /** The submit event, when the handler was called from one. */
  event: Event | undefined
  /**
   * The `<form>` the submit came from. `event.currentTarget` is already null by the time a handler
   * that waited for validation runs, so this is the one to read.
   */
  element: HTMLFormElement | null
  /** The button that submitted, so `<button name="action" value="draft">` is `submitter.value`. */
  submitter: HTMLElement | null
}

/** What `onSubmit` gets: the context, and the submitted values as a `FormData`. */
export interface SubmittedContext<S extends StandardSchemaV1> extends SubmitContext<S> {
  /**
   * The values as multipart, ready for `fetch`: nested names like `address.street` and
   * `members.0.name`, `File`s kept, dates as ISO strings, booleans as `'true'` / `'false'`,
   * `null` and `undefined` left out, and the pressed submit button's name and value.
   */
  readonly formData: FormData
}

export type ServerErrors<I> =
  | readonly { path?: string; message: string }[]
  | { [P in Path<I>]?: string | readonly string[] }

/** A form is made of refs and is `Raw`, so a Pinia store doesn't type its `valid` as a boolean. */
export type Form<S extends StandardSchemaV1 = StandardSchemaV1> = Raw<FormShape<S>>

interface FormShape<S extends StandardSchemaV1> {
  /**
   * A ref per field, to destructure for `v-model`: `const { email } = form.model`, then
   * `<input v-model="email" />`. A group is a ref to an object you can write to (`address.street`)
   * and a list to an array, so `v-model="row.name"` works in a `v-for`. Groups need a default
   * (`address: {}`) to be there before they are written. `email.watch(...)` is in the script only.
   */
  readonly model: FormModel<InferInput<S>>
  /** The message to show at each field: `{{ errors.email }}`. */
  readonly errors: FormErrors<InferInput<S>>
  /** What to spread on each input: `v-bind="attrs.email"`. */
  readonly attrs: FormAttrs<InferInput<S>>
  /**
   * One field by path, with everything about it: its `watch`, `touch`, `validate`, list operations
   * and a group's own error. `''` is the form itself: `form.field('').error` is an error no field owns.
   */
  field<P extends Path<InferInput<S>> | ''>(path: P): FieldFor<PathValue<InferInput<S>, P>>
  /**
   * Runs `handler` when the value at `path` changes by a user edit or `setValue`: any field, a
   * group or a list. Not for `reset()`, `setValues()` or loaded defaults. A top-level field also
   * has it on its ref (`email.watch(...)`). Call it as `form.watch`, so it doesn't shadow Vue's.
   */
  watch<P extends Path<InferInput<S>>>(
    path: P,
    handler: (change: FieldChange<PathValue<InferInput<S>, P>>) => unknown,
    options?: FieldWatchOptions,
  ): () => void
  readonly values: Readonly<Ref<DeepPartial<InferInput<S>>>>
  setValue<P extends Path<InferInput<S>>>(path: P, value: PathValue<InferInput<S>, P>): void
  /** Replaces every value. */
  setValues(values: DeepPartial<InferInput<S>>): void
  /** The errors to show, in order: a summary for the top of the form. */
  readonly errorList: Readonly<Ref<readonly FormError[]>>
  /** Every error, shown or not: for a live checklist of rules before the field is touched. */
  readonly allErrors: Readonly<Ref<readonly FormError[]>>
  readonly valid: Readonly<Ref<boolean>>
  readonly dirty: Readonly<Ref<boolean>>
  readonly touched: Readonly<Ref<boolean>>
  /** An async schema or a rule is still running. */
  readonly pending: Readonly<Ref<boolean>>
  readonly submitting: Readonly<Ref<boolean>>
  readonly submitCount: Readonly<Ref<number>>
  /** Validates, shows the errors under `path` (or all), and says whether they are valid. */
  validate(path?: Path<InferInput<S>>): Promise<boolean>
  /**
   * The handler for `<form @submit>`. It prevents the default and validates; when valid it calls
   * `onSubmit` with the schema's output, otherwise it focuses the first invalid field and calls
   * `onInvalid`. Says whether the form was valid.
   */
  handleSubmit(event?: Event): Promise<boolean>
  /**
   * With your own function, it returns the handler for `<form @submit>`: `fn` gets the schema's output
   * and the same context as `onSubmit`, and replaces it for this call.
   */
  handleSubmit(
    onSubmit: (values: InferOutput<S>, context: SubmittedContext<S>) => unknown,
  ): (event?: Event) => Promise<boolean>
  /** Back to the default values (or `values`, which become the new defaults), with nothing touched. */
  reset(values?: DeepPartial<InferInput<S>>): void
  /** Errors from outside the schema, like a server's. A field's next change clears its own. */
  setErrors(errors: ServerErrors<InferInput<S>>): void
  clearErrors(): void
}

/** What `useFormContext` gets, before it is typed. */
export type FormContext = Form<StandardSchemaV1>

/** What a rule gets besides the value. */
export interface RuleContext<I> {
  /** Every value in the form. */
  values: DeepPartial<I>
  /** The path being checked, with its list indexes: `members.2.email`. */
  path: string
  /** Aborted when the value changes before the rule is done: pass it to `fetch`. */
  signal: AbortSignal
}

/** The error to show, several, or nothing when the value is fine. */
export type RuleResult = string | readonly string[] | boolean | null | undefined

export type RuleFn<V, I> = (value: V, context: RuleContext<I>) => RuleResult | Promise<RuleResult>

/** A check: a function, or a schema for this one value (`z.email()`), whose errors read like the form's. */
export type RuleCheck<V, I> = RuleFn<V, I> | StandardSchemaV1<V, unknown>

/** A rule is its check, or the check with when it runs. */
export type RuleInput<V, I> =
  | RuleCheck<V, I>
  | {
      run: RuleCheck<V, I>
      /** `'change'` (default) as the value settles; `'blur'` when the field is left. */
      on?: 'change' | 'blur'
      /** Overrides the form's `debounce` for this rule. */
      debounce?: number
    }

/** Rules by path; `*` stands for any list index: `'members.*.email'`. */
export type Rules<I> = {
  [P in Path<I> | Path<I, [], '*'>]?: RuleInput<PathValue<I, P>, I>
}

export interface UseFormOptions<S extends StandardSchemaV1> {
  /**
   * A stable id for the inputs' ids, when the form isn't made in a component (a store): without one
   * the ids come from a counter, which a server render and the browser may count differently.
   */
  id?: string
  /** Any Standard Schema: Zod, Valibot, ArkType, Yup, Joi, Effect... A ref swaps it at runtime, for forms built from data. */
  schema: S | Ref<S>
  /** Starting values. A ref or getter that changes resets the form, unless the user has edited it: a ref from `useFetch` or a query is how data loaded later gets in. */
  defaultValues?: MaybeRefOrGetter<DeepPartial<InferInput<S>> | undefined>
  /** Called by `form.handleSubmit` with the schema's output, once the form is valid. */
  onSubmit?: (values: InferOutput<S>, context: SubmittedContext<S>) => unknown
  /** Called by `form.handleSubmit` when the form is not valid. */
  onInvalid?: (errors: readonly FormError[], context: SubmitContext<S>) => unknown
  /**
   * Checks a schema shouldn't hold: an API call, the app's state. A rule runs when the schema has no
   * error at its path and the value is not the default one; its errors count like the schema's.
   */
  rules?: Rules<InferInput<S>>
  /** Milliseconds to wait after the last change before a rule runs. Default 0. */
  debounce?: number
  /** Default `'edited'`, or what the app's `FormConfig` says. A value here replaces the app's, it isn't merged. */
  showErrors?: ShowErrorsFor<InferInput<S>>
  /** Field names for `{field}` in messages, as text or an i18n key. */
  labels?: { [P in Path<InferInput<S>>]?: string }
  /** Overrides the app's i18n for this form. */
  i18n?: FormI18n
}

/** One rule, or several that run in order: the first to fail is the error shown. */
export type RuleList<V, I> = RuleCheck<V, I> | readonly RuleCheck<V, I>[]

/**
 * Rules by path, for validating without a schema library. `*` stands for any list index
 * (`'members.*.name'`) and `''` is the form itself.
 */
export type ValidateMap<I> = {
  [P in Path<I> | Path<I, [], '*'> | '']?: RuleList<PathValue<I, P>, I>
}

/** The options for a form validated by `validate` rules, whose values are `T`. */
export interface PlainFormOptions<T> extends Omit<
  UseFormOptions<StandardSchemaV1<T, T>>,
  'schema' | 'defaultValues'
> {
  /** The starting values: they also give the form its type, or name it with `useForm<Values>`. */
  defaultValues?: MaybeRefOrGetter<DeepPartial<T> | T | undefined>
  /** Plain functions by path; reuse them and compose them as you like. */
  validate: ValidateMap<T>
}
