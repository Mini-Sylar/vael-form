import { isIndex } from './path'
import type { Segments } from './path'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { has, shapeAt, shapeOf } from './shape'
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

/** Whether a value that may be `null` comes out of the schema as something else, so empty still fails. */
function nullRuledOut(given: Shape, schema: StandardSchemaV1, segments: Segments): boolean {
  // Valibot: a schema later in the wrapper's pipe, such as `v.number()`, that takes no `null`.
  if (given.nullable)
    return (given.nullable.pipe ?? [])
      .slice(1)
      .some(
        (item: Record<string, any>) =>
          item.kind === 'schema' && !['nullable', 'nullish', 'any', 'unknown'].includes(item.type),
      )
  // Zod and ArkType: the output's JSON Schema. A transform or refine reads as "anything" or as nullable.
  if (!outputs.has(schema)) outputs.set(schema, shapeOf(schema, 'output'))
  const out = shapeAt(outputs.get(schema), segments)
  return !!out && !!(out.type ?? out.anyOf ?? out.oneOf) && !has(out, 'null')
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
  schema: StandardSchemaV1,
  segments: Segments,
): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {}
  if (!given) return attrs
  // A value that takes `null` takes "empty", unless the schema turns `null` away after all.
  if ((has(given, 'null') || given.nullable) && !nullRuledOut(given, schema, segments))
    required = false
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

/** Whether the key at the end of `segments` must be there, by its parent's `required`. */
function requiredAt(root: Shape | undefined, segments: Segments): boolean {
  if (!segments.length) return false
  const parent = shapeAt(root, segments.slice(0, -1))
  const key = segments[segments.length - 1]!
  if (isIndex(key)) return true
  const branches = parent ? [parent, ...(parent.anyOf ?? []), ...(parent.oneOf ?? [])] : []
  return branches.some((branch) => branch.required?.includes(key))
}

/** The attributes the schema implies for the input at `segments`. */
export function limitsAt(
  root: Shape,
  segments: Segments,
  schema: StandardSchemaV1,
): Record<string, string | number | boolean> {
  return attrsFor(shapeAt(root, segments), requiredAt(root, segments), schema, segments)
}
