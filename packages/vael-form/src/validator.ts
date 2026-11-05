import type { StandardSchemaV1 } from '@standard-schema/spec'
import { messagesOf } from './issues'
import { isSchema, schemaRule } from './schema-rule'
import type { Message } from './issues'
import { expand, getIn, toSegments } from './path'
import type { RuleFn, RuleResult, ValidateMap } from './types'

type Loose = (value: unknown, context: never) => RuleResult | Promise<RuleResult>

const isPromise = (value: unknown): value is PromiseLike<unknown> =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as PromiseLike<unknown>).then === 'function'

interface Job {
  path: string
  value: unknown
  rules: readonly Loose[]
}

/**
 * Plain functions as a Standard Schema, for validating without a schema library:
 *
 *     const signup = validator<Values>({ email: [required, email], age: (v) => v >= 18 || 'Too young' })
 *
 * It is a schema like any other: `useForm({ schema: signup })`, a server's
 * `signup['~standard'].validate(body)`, a test. A rule returns a message (or `msg('key')`), several,
 * or nothing/`true` when the value is fine. An array of rules runs in order and the first to fail is
 * the error. A rule that returns a promise makes the whole validation async.
 */
export function validator<T>(rules: ValidateMap<T>): StandardSchemaV1<T, T> {
  const entries = Object.entries(rules) as [string, Loose | readonly Loose[]][]

  const jobs = (values: unknown): Job[] =>
    entries.flatMap(([key, list]) =>
      (key === '' ? [''] : expand(values, key.split('.'))).map((path) => ({
        path,
        value: getIn(values, toSegments(path)),
        rules: (Array.isArray(list) ? list : [list]).map((rule) =>
          isSchema(rule) ? (schemaRule(rule) as unknown as Loose) : rule,
        ),
      })),
    )

  return {
    '~standard': {
      version: 1,
      vendor: 'vael-form',
      validate(values) {
        const signal = new AbortController().signal
        const issues: StandardSchemaV1.Issue[] = []
        const all = jobs(values)

        /** The messages of one path: the first rule to fail, or none. */
        const check = (job: Job, from = 0): Message[] | Promise<Message[]> => {
          for (let i = from; i < job.rules.length; i++) {
            const result = (job.rules[i] as RuleFn<unknown, unknown>)(job.value, {
              values: values as never,
              path: job.path,
              signal,
            })
            if (isPromise(result))
              return Promise.resolve(result).then((awaited) => {
                const messages = messagesOf(awaited)
                return messages.length ? messages : check(job, i + 1)
              })
            const messages = messagesOf(result)
            if (messages.length) return messages
          }
          return []
        }

        const done = (): StandardSchemaV1.Result<T> =>
          issues.length ? { issues } : { value: values as T }

        const next = (
          at: number,
        ): StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>> => {
          for (let i = at; i < all.length; i++) {
            const job = all[i]!
            const messages = check(job)
            const add = (list: Message[]) => {
              const path = job.path ? job.path.split('.') : []
              // A schema rule's issue keeps its fields and its library, for the app's catalog.
              for (const message of list)
                issues.push(
                  typeof message === 'string'
                    ? { message, path }
                    : ({
                        ...message.source,
                        message: message.message,
                        path,
                        vendor: message.vendor,
                      } as StandardSchemaV1.Issue),
                )
            }
            if (isPromise(messages))
              return messages.then((list) => {
                add(list)
                return next(i + 1)
              })
            add(messages)
          }
          return done()
        }
        return next(0)
      },
    },
  }
}
