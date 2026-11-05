import { isIndex } from './path'
import type { Segments } from './path'
import { has, shapeAt } from './shape'
import type { Shape } from './shape'

// Its own chunk: the limits only matter once an input's attrs are read.

const VALIBOT_LIMITS: Record<string, keyof Shape> = {
  min_length: 'minLength',
  max_length: 'maxLength',
  non_empty: 'minLength',
  min_value: 'minimum',
  max_value: 'maximum',
  multiple_of: 'multipleOf',
}

/** A Valibot value's limits, from its pipe, in JSON Schema's words. */
function withPipe(shape: Shape): Shape {
  const out: Shape = { ...shape }
  for (const action of (shape.node?.pipe ?? []) as Record<string, any>[]) {
    const key = VALIBOT_LIMITS[action.type]
    if (key === 'minLength' && out.type === 'array') out.minItems = action.requirement ?? 1
    else if (key) (out as Record<string, unknown>)[key] = action.requirement ?? 1
    if (action.type === 'integer') out.type = 'integer'
  }
  return out
}

/** The attributes a schema implies for an input: limits, and `aria-required` for a value that can't be left empty. */
function attrsFor(
  given: Shape | undefined,
  required: boolean,
): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {}
  if (!given) return attrs
  const shape = withPipe(given)
  const text = has(shape, 'string')
  // A string may be '' unless it has a minimum; a boolean is never "missing"; a list needs an item.
  if (
    required &&
    !has(shape, 'boolean') &&
    (!text || (shape.minLength ?? 0) > 0) &&
    (!has(shape, 'array') || (shape.minItems ?? 0) > 0)
  )
    attrs['aria-required'] = true
  if (text) {
    if (shape.minLength !== undefined) attrs.minlength = shape.minLength
    if (shape.maxLength !== undefined) attrs.maxlength = shape.maxLength
  }
  if (has(shape, 'number') || has(shape, 'integer')) {
    if (shape.minimum !== undefined) attrs.min = shape.minimum
    if (shape.maximum !== undefined) attrs.max = shape.maximum
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
): Record<string, string | number | boolean> {
  return attrsFor(shapeAt(root, segments), requiredAt(root, segments))
}
