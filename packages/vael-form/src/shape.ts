import type { StandardSchemaV1 } from '@standard-schema/spec'
import { isIndex, isPlainObject } from './path'
import type { Segments } from './path'

/** What a schema says about a value, in JSON Schema's words: enough to know a group and its limits. */
type Loose = Record<string, any>

export interface Shape {
  type?: string | string[]
  properties?: Record<string, Shape>
  required?: string[]
  items?: Shape
  anyOf?: Shape[]
  oneOf?: Shape[]
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  format?: string
  /** A JSON Schema pattern, or a Valibot action's own RegExp. */
  pattern?: string | RegExp
  multipleOf?: number
  minItems?: number
  /** A literal, such as a union's discriminator. */
  const?: unknown
  /** A branch's discriminators, its `const` properties: read once. */
  consts?: [string, Shape][]
  /** Valibot's own schema, whose pipe holds its limits. */
  node?: Loose
  /** Valibot's `nullable` or `nullish` wrapper around this value, whose pipe can rule `null` out. */
  nullable?: Loose
}

// Valibot's wrappers whose key may be left out of its object.
const OPTIONAL = ['optional', 'exact_optional', 'nullish', 'undefinedable']

// Valibot has no JSON Schema of its own: its schemas are plain objects, read here the same way.
// `node` keeps the Valibot schema, for the limits in its pipe (read by the `limits` chunk).
function fromValibot(schema: Loose): Shape | undefined {
  const type = schema.type as string
  // `non_nullable` and the like take back the `null` the wrapper inside them allowed.
  const non = type.startsWith('non_')
  if (non || type === 'nullable' || type === 'nullish') {
    const inner = fromValibot(schema.wrapped)
    // `non_optional` takes back only the `undefined`.
    const nullable = type === 'non_optional' ? inner?.nullable : non ? undefined : schema
    return inner && { ...inner, nullable }
  }
  if (OPTIONAL.includes(type)) return fromValibot(schema.wrapped)
  if (type.endsWith('object')) {
    const properties: Record<string, Shape> = {}
    const required: string[] = []
    for (const [key, entry] of Object.entries(schema.entries as Loose)) {
      properties[key] = fromValibot(entry) ?? {}
      if (!OPTIONAL.includes(entry.type)) required.push(key)
    }
    return { type: 'object', properties, required }
  }
  if (type === 'array') return { type, items: fromValibot(schema.item), node: schema }
  if (type === 'variant' || type === 'union')
    return { anyOf: (schema.options as Loose[]).map((option) => fromValibot(option) ?? {}) }
  if (['string', 'number', 'boolean'].includes(type)) return { type, node: schema }
  if (type === 'picklist' || type === 'enum') return { type: 'string' }
  if (type === 'literal') return { const: schema.literal }
  return undefined
}

/** The schema's shape, when its library can say: Zod and ArkType through JSON Schema, Valibot read directly. */
export function shapeOf(schema: StandardSchemaV1, side = 'input'): Shape | undefined {
  const standard = schema['~standard'] as Loose
  try {
    const shape = standard.jsonSchema?.[side]({
      target: 'draft-2020-12',
      // A date or a transform has no JSON Schema: it reads as "anything", not as a failure.
      libraryOptions: { unrepresentable: 'any' },
    })
    if (shape) return shape
  } catch {}
  return standard.vendor === 'valibot' ? fromValibot(schema as Loose) : undefined
}

export const has = (shape: Shape | undefined, type: string): boolean =>
  !!shape &&
  ([shape.type].flat().includes(type) ||
    !![...(shape.anyOf ?? []), ...(shape.oneOf ?? [])].some((branch) => has(branch, type)))

/** A child's shape: an object's property (in any branch of a union) or a list's item. */
export function child(shape: Shape | undefined, key: string): Shape | undefined {
  if (!shape) return undefined
  if (isIndex(key) && shape.items) return shape.items
  if (shape.properties?.[key]) return shape.properties[key]
  for (const branch of [...(shape.anyOf ?? []), ...(shape.oneOf ?? [])]) {
    const found = child(branch, key)
    if (found) return found
  }
  return undefined
}

export function shapeAt(root: Shape | undefined, segments: Segments): Shape | undefined {
  let shape = root
  for (const key of segments) shape = child(shape, key)
  return shape
}

export const isObjectShape = (shape: Shape | undefined): boolean => has(shape, 'object')
export const isListShape = (shape: Shape | undefined): boolean => has(shape, 'array')

/** The one branch of a union whose discriminators (its `const` properties) the value matches. */
export function branchOf(shape: Shape | undefined, value: unknown): Shape | undefined {
  const fits = (shape?.anyOf ?? shape?.oneOf)?.filter(
    (branch) =>
      branch.properties &&
      // Read once: a wide branch would cost every field each keystroke.
      (branch.consts ??= Object.entries(branch.properties).filter(
        ([, prop]) => 'const' in prop,
      )).every(([key, prop]) => (value as Loose | undefined)?.[key] === prop.const),
  )
  return fits?.length === 1 ? fits[0] : shape
}

/**
 * The values as the schema should see them: a required group the data doesn't have yet is an
 * empty object, so its fields report their own errors instead of the group reporting one. Returns
 * `value` itself when nothing is missing.
 */
export function withGroups(given: Shape | undefined, value: unknown): unknown {
  const shape = branchOf(given, value)
  if (shape?.type !== 'object' || !shape.properties) return value
  if (value !== undefined && !isPlainObject(value)) return value
  let out = value as Record<string, unknown> | undefined
  for (const [key, prop] of Object.entries(shape.properties)) {
    const current = out?.[key]
    const child = branchOf(prop, current)!
    // A list's rows have their groups too.
    if (child.type === 'array' && child.items && Array.isArray(current)) {
      const rows = current.map((row) => (isPlainObject(row) ? withGroups(child.items, row) : row))
      if (rows.some((row, i) => row !== current[i])) out = { ...out, [key]: rows }
      continue
    }
    const missing = current === undefined && !!shape.required?.includes(key)
    // A missing group that may be `null` isn't made: it has one error, for the group.
    if (
      child.type !== 'object' ||
      (missing ? child.nullable || has(prop, 'null') : !isPlainObject(current))
    )
      continue
    const next = withGroups(child, missing ? {} : current)
    if (next !== current) out = { ...out, [key]: next }
  }
  return out ?? {}
}
