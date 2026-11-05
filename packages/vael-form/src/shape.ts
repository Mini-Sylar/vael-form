import type { StandardSchemaV1 } from '@standard-schema/spec'
import { isIndex } from './path'
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
  multipleOf?: number
  minItems?: number
  /** Valibot's own schema, whose pipe holds its limits. */
  node?: Loose
}

// Valibot has no JSON Schema of its own: its schemas are plain objects, read here the same way.
// `node` keeps the Valibot schema, for the limits in its pipe (read by the `limits` chunk).
function fromValibot(schema: Loose): Shape | undefined {
  const type = schema.type as string
  if (['optional', 'nullable', 'nullish', 'undefinedable'].includes(type))
    return fromValibot(schema.wrapped)
  if (type.endsWith('object')) {
    const properties: Record<string, Shape> = {}
    const required: string[] = []
    for (const [key, entry] of Object.entries(schema.entries as Loose)) {
      properties[key] = fromValibot(entry) ?? {}
      if (!['optional', 'nullish', 'undefinedable'].includes(entry.type)) required.push(key)
    }
    return { type: 'object', properties, required }
  }
  if (type === 'array') return { type, items: fromValibot(schema.item), node: schema }
  if (type === 'variant' || type === 'union')
    return { anyOf: (schema.options as Loose[]).map((option) => fromValibot(option) ?? {}) }
  if (['string', 'number', 'boolean'].includes(type)) return { type, node: schema }
  if (type === 'picklist' || type === 'enum') return { type: 'string' }
  return undefined
}

/** The schema's shape, when its library can say: Zod and ArkType through JSON Schema, Valibot read directly. */
export function shapeOf(schema: StandardSchemaV1): Shape | undefined {
  const standard = schema['~standard'] as Loose
  try {
    const shape = standard.jsonSchema?.input({
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
function child(shape: Shape | undefined, key: string): Shape | undefined {
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
