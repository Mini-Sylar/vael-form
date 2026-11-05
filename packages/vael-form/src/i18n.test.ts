import { describe, expect, it } from 'vitest'
import { humanize, interpolate, msg, parseMessage, translate } from './i18n'

describe('msg', () => {
  it('is a plain string that parses back', () => {
    expect(typeof msg('errors.required')).toBe('string')
    expect(parseMessage(msg('errors.required'))).toEqual({ keys: ['errors.required'] })
    expect(parseMessage(msg('errors.min', { min: 3 }, 'At least {min}'))).toEqual({
      keys: ['errors.min'],
      params: { min: 3 },
      fallback: 'At least {min}',
    })
  })

  it('carries a list of keys, most specific first', () => {
    expect(parseMessage(msg(['a.b.c', 'a.b'], { n: 1 }))).toEqual({
      keys: ['a.b.c', 'a.b'],
      params: { n: 1 },
      fallback: undefined,
    })
    expect(parseMessage(msg(['a.b.c', 'a.b']))).toEqual({ keys: ['a.b.c', 'a.b'] })
  })

  it('leaves ordinary messages alone', () => {
    expect(parseMessage('Required')).toBeUndefined()
  })
})

describe('translate', () => {
  const t = (key: string) => ({ 'errors.min': 'At least {min}' })[key] ?? key

  it('fills placeholders and reports a missing key as undefined', () => {
    expect(interpolate('At least {min}, {nope}', { min: 3 })).toBe('At least 3, {nope}')
    expect(translate({ t }, ['errors.min'], { min: 3 })).toBe('At least 3')
    expect(translate({ t }, ['errors.gone'], {})).toBeUndefined()
    expect(translate(undefined, ['errors.min'], {})).toBeUndefined()
  })
})

describe('translate with a key list', () => {
  const t = (key: string) => ({ 'form.too_small': 'Too short: {minimum}' })[key] ?? key

  it('uses the first key the catalog has', () => {
    expect(translate({ t }, ['form.too_small.string', 'form.too_small'], { minimum: 3 })).toBe(
      'Too short: 3',
    )
    expect(translate({ t }, ['form.a', 'form.b'], {})).toBeUndefined()
  })

  it('hands a numeric count to the library as the plural', () => {
    const seen: unknown[] = []
    const spy = (key: string, _params?: unknown, options?: unknown) => (seen.push(options), key)
    translate({ t: spy }, ['k'], { count: 2 })
    translate({ t: spy }, ['k'], { count: 'two' })
    expect(seen[0]).toMatchObject({ plural: 2 })
    expect(seen[1]).not.toHaveProperty('plural')
  })
})

describe('humanize', () => {
  it('makes a label from a field name', () => {
    expect(humanize('email')).toBe('Email')
    expect(humanize('firstName')).toBe('First name')
    expect(humanize('first_name')).toBe('First name')
    expect(humanize('zip-code')).toBe('Zip code')
    expect(humanize('0')).toBe('0')
  })
})
