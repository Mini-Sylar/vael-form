import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Message } from './issues'

// Only the rules and validator chunks use it, so it stays out of the core.

export const isSchema = (value: unknown): value is StandardSchemaV1 =>
  typeof value === 'object' && value !== null && '~standard' in value

/** A schema for one value, as a rule: what it finds wrong, as issues. */
export function schemaRule(schema: StandardSchemaV1) {
  const vendor = schema['~standard'].vendor
  const issues = (result: StandardSchemaV1.Result<unknown>): Message[] =>
    (result.issues ?? []).map((issue) => ({ message: issue.message, source: issue, vendor }))
  return (value: unknown): Message[] | Promise<Message[]> => {
    const result = schema['~standard'].validate(value)
    return result instanceof Promise ? result.then(issues) : issues(result)
  }
}
