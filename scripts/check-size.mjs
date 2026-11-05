// Fails when the minified library grows past its budget (gzip, bytes). The size script builds it first.
// The core is every chunk a form loads; the rules chunk only loads for a form with `rules`, and the
// catalog chunk (how a schema library's errors map to the app's messages) only for an app with i18n,
// and the validator chunk only for a form validated by `validate` rules.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const dir = '.size'
const budgets = {
  core: 8704,
  rules: 1536,
  catalog: 1792,
  validator: 1280,
  limits: 1024,
  schemaRule: 512,
  nuxt: 1024,
}
const lazy = {
  rules: 'rules-',
  catalog: 'standard-',
  validator: 'validator',
  limits: 'limits-',
  schemaRule: 'schema-rule',
  // the Nuxt module runs in Nuxt's build, not in the app
  nuxt: 'nuxt',
}

const files = readdirSync(dir).filter((file) => file.endsWith('.js'))
const gzip = (names) => gzipSync(Buffer.concat(names.map((n) => readFileSync(join(dir, n))))).length
const isLazy = (file) => Object.values(lazy).some((prefix) => file.startsWith(prefix))
const sizes = { core: gzip(files.filter((file) => !isLazy(file))) }
for (const [name, prefix] of Object.entries(lazy))
  sizes[name] = gzip(files.filter((file) => file.startsWith(prefix)))

let failed = false
for (const [name, budget] of Object.entries(budgets)) {
  const size = sizes[name]
  const ok = size <= budget
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${size} B gzip (budget ${budget} B)`)
  if (!ok) failed = true
}
process.exit(failed ? 1 : 0)
