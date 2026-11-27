import { shallowRef, watch } from 'vue'
import type { EffectScope, Ref, ShallowRef } from 'vue'
import { getIn, isIndex } from './path'
import type { Segments } from './path'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { branchOf, child, has, shapeOf } from './shape'
import type { Shape } from './shape'

// Its own chunk: the limits only matter once an input's attrs are read.

const VALIBOT_LIMITS: Record<string, keyof Shape> = {
  min_length: 'minLength',
  max_length: 'maxLength',
  non_empty: 'minLength',
  min_value: 'minimum',
  max_value: 'maximum',
  gt_value: 'exclusiveMinimum',
  lt_value: 'exclusiveMaximum',
  multiple_of: 'multipleOf',
}

/** A Valibot value's limits, from its pipe, in JSON Schema's words. */
function withPipe(shape: Shape): Shape {
  const out: Shape = { ...shape }
  for (const action of (shape.node?.pipe ?? []) as Record<string, any>[]) {
    const { type, requirement } = action
    const key = VALIBOT_LIMITS[type]
    // An exact `length` is both limits.
    if (type === 'length') out.minLength = out.maxLength = requirement
    if ((key === 'minLength' || type === 'length') && out.type === 'array')
      out.minItems = requirement ?? 1
    else if (key) (out as Record<string, unknown>)[key] = requirement ?? 1
    if (type.endsWith('integer')) out.type = 'integer'
    // `email`, `regex` and the like: a pattern that '' may not match.
    if (requirement instanceof RegExp) out.pattern = requirement
    if (type === 'url') out.format = 'uri'
  }
  return out
}

/** A `nullable` value's own shape: JSON Schema puts it in a union with `null`. */
function withoutNull(shape: Shape): Shape {
  const branches = shape.anyOf ?? shape.oneOf
  const rest = branches?.filter((branch) => branch.type !== 'null')
  return rest?.length === 1 && branches!.length === 2 ? rest[0]! : shape
}

const outputs = new WeakMap<object, Shape | undefined>()

type Pick = (union: Shape, path: Segments) => Shape | undefined

/** The form's values, as a ref and as read without tracking. */
interface FormValues {
  readonly values: Ref<unknown>
  readonly latest: unknown
}

interface Choice {
  union: Shape
  path: Segments
  /** The value at `path` the branch was read from. */
  at: unknown
  pick: ShallowRef<Shape | undefined>
}

// Each form's active branch per union and path, set only when it changes: other keystrokes don't reach attrs.
const choices = new WeakMap<object, Map<string, Choice>>()
let unions = 0

const picker =
  ({ values, latest }: FormValues, scope?: EffectScope): Pick =>
  (union, path) => {
    let all = choices.get(values)
    if (!all && scope?.active) {
      const made = (all = new Map())
      choices.set(values, made)
      // One watcher per form, in its scope: it stops with the form, not with the component that read attrs first.
      scope.run(() =>
        watch(
          values,
          (now) => {
            for (const one of made.values()) {
              const at = getIn(now, one.path)
              if (at !== one.at) one.pick.value = branchOf(one.union, (one.at = at))
            }
          },
          { flush: 'sync' },
        ),
      )
    }
    // A form made outside a scope reads the values itself.
    if (!all) return branchOf(union, getIn(values.value, path))
    const key = `${(union.id ??= ++unions)}:${path}`
    let one = all.get(key)
    if (!one) {
      // Not a dependency of attrs: the watcher is.
      const at = getIn(latest, path)
      all.set(key, (one = { union, path, at, pick: shallowRef(branchOf(union, at)) }))
    }
    return one.pick.value
  }

/** The shapes the parent of the last key may have: a union's active branch (by its discriminators), else each branch. */
function parents(
  shape: Shape | undefined,
  segments: Segments,
  pick: Pick,
  at: Segments = [],
): Shape[] {
  const branches = shape?.anyOf ?? shape?.oneOf
  if (branches) {
    const active = pick(shape!, at)
    return (active === shape ? branches : [active!]).flatMap((one) =>
      parents(one, segments, pick, at),
    )
  }
  if (!shape || segments.length < 2) return shape ? [shape] : []
  const [key, ...rest] = segments
  return parents(child(shape, key!), rest, pick, [...at, key!])
}

/** Whether a value that may be `null` comes out of the schema as something else, so empty still fails. */
function nullRuledOut(given: Shape, outs: () => (Shape | undefined)[]): boolean {
  // Valibot: a schema later in the wrapper's pipe, such as `v.number()`, that takes no `null`.
  if (given.nullable)
    return (given.nullable.pipe ?? [])
      .slice(1)
      .some(
        (item: Record<string, any>) =>
          item.kind === 'schema' && !['nullable', 'nullish', 'any', 'unknown'].includes(item.type),
      )
  // Zod and ArkType: the output's JSON Schema, in each branch the value may be in; a transform reads as "anything".
  // A branch without the key doesn't count, as it doesn't for `aria-required`.
  const list = outs().filter(Boolean)
  return (
    !!list[0] &&
    list.every((out) => !!out && !!(out.type ?? out.anyOf ?? out.oneOf) && !has(out, 'null'))
  )
}

/** A bound that is only the safe-integer range (Zod's `.int()`) or infinite isn't a real limit. */
const bound = (value: number | undefined) =>
  value !== undefined && Math.abs(value) < Number.MAX_SAFE_INTEGER ? value : undefined

/** The tighter of two bounds, either of which may be missing (`undefined` or `NaN`). */
const tighter = (pick: (a: number, b: number) => number, a?: number, b = NaN) =>
  a === undefined ? b : b === b ? pick(a, b) : a

/** A string the schema's pattern (else its format) says can't be ''; Zod's `hex` has a format and takes ''. */
function notBlank(shape: Shape): boolean {
  try {
    if (shape.pattern !== undefined) return !new RegExp(shape.pattern).test('')
  } catch {}
  return !!shape.format
}

/** The attributes a schema implies for an input: limits, and `aria-required` for a value that can't be left empty. */
function attrsFor(
  given: Shape | undefined,
  required: boolean,
  outs: () => (Shape | undefined)[],
): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {}
  if (!given) return attrs
  // A value that takes `null` takes "empty", unless the schema turns `null` away after all.
  if ((has(given, 'null') || given.nullable) && !nullRuledOut(given, outs)) required = false
  const shape = withPipe(withoutNull(given))
  const text = has(shape, 'string')
  // A string may be '' unless its minimum, format or pattern says no; a boolean is never "missing"; a list needs an item.
  if (
    required &&
    !has(shape, 'boolean') &&
    (!text || (shape.minLength ?? 0) > 0 || notBlank(shape)) &&
    (!has(shape, 'array') || (shape.minItems ?? 0) > 0)
  )
    attrs['aria-required'] = true
  if (text) {
    if (shape.minLength !== undefined) attrs.minlength = shape.minLength
    if (shape.maxLength !== undefined) attrs.maxlength = shape.maxLength
  }
  if (has(shape, 'number') || has(shape, 'integer')) {
    // An integer's exclusive bound is the next whole number; a decimal's has no HTML form.
    const step = has(shape, 'integer') ? 1 : NaN
    // Valibot can have both: the tighter wins.
    const min = bound(tighter(Math.max, shape.minimum, (shape.exclusiveMinimum ?? NaN) + step))
    const max = bound(tighter(Math.min, shape.maximum, (shape.exclusiveMaximum ?? NaN) - step))
    if (min !== undefined) attrs.min = min
    if (max !== undefined) attrs.max = max
    if (shape.multipleOf !== undefined) attrs.step = shape.multipleOf
  }
  return attrs
}

/** The attributes the schema implies for the input at `segments`, read from the union branch `values` are in. */
export function limitsAt(
  root: Shape,
  segments: Segments,
  schema: StandardSchemaV1,
  form: FormValues,
  scope?: EffectScope,
): Record<string, string | number | boolean> {
  const key = segments[segments.length - 1]
  if (key === undefined) return {}
  const pick = picker(form, scope)
  const outs = () => {
    if (!outputs.has(schema)) outputs.set(schema, shapeOf(schema, 'output'))
    return parents(outputs.get(schema), segments, pick).map((parent) => child(parent, key))
  }
  // With no branch picked: the first branch's limits, and `aria-required` only if every branch has it.
  const all = parents(root, segments, pick).flatMap((parent) => {
    const given = child(parent, key)
    return given ? [attrsFor(given, isIndex(key) || !!parent.required?.includes(key), outs)] : []
  })
  const attrs = { ...all[0] }
  if (!all.every((one) => one['aria-required'])) delete attrs['aria-required']
  return attrs
}
