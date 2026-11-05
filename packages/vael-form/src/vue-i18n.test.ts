import { effectScope, nextTick, watchEffect } from 'vue'
import { beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { z } from 'zod'
import { msg } from './i18n'
import { useForm } from './use-form'

beforeAll(() => import('./standard'))

const messages = {
  en: { 'errors.min': '{field} needs {min}+ characters', 'labels.name': 'Name' },
  fr: { 'errors.min': '{field} doit avoir {min}+ caractères', 'labels.name': 'Nom' },
}
const schema = z.object({ name: z.string().min(5, msg('errors.min', { min: 5 })) })

// One setup line for every vue-i18n mode: `i18n.global`.
describe.each([
  ['composition', false],
  ['legacy', true],
] as const)('vue-i18n %s mode', (_, legacy) => {
  it('translates, follows the locale, and sees messages loaded later', async () => {
    const i18n = createI18n({
      legacy,
      locale: 'en',
      fallbackLocale: 'en',
      messages: structuredClone(messages),
    })
    const form = effectScope().run(() =>
      useForm({
        schema,
        defaultValues: { name: 'abc' },
        i18n: i18n.global as never,
        labels: { name: 'labels.name' },
        showErrors: 'input',
      }),
    )!
    const seen: (string | undefined)[] = []
    effectScope().run(() => watchEffect(() => seen.push(form.field('name').error)))
    form.field('name').value = 'abcd'
    await nextTick()
    await new Promise((r) => setTimeout(r, 5))
    expect(form.field('name').error).toBe('Name needs 5+ characters')

    if (legacy) (i18n.global as unknown as { locale: string }).locale = 'fr'
    else (i18n.global.locale as unknown as { value: string }).value = 'fr'
    await nextTick()
    await new Promise((r) => setTimeout(r, 5))
    expect(form.field('name').error).toBe('Nom doit avoir 5+ caractères')
    expect(seen.at(-1)).toBe('Nom doit avoir 5+ caractères')

    i18n.global.mergeLocaleMessage('fr', { 'labels.name': 'Prénom' })
    await nextTick()
    expect(form.field('name').error).toBe('Prénom doit avoir 5+ caractères')
  })
})
