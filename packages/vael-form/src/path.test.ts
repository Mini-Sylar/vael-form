import { describe, expect, it } from 'vitest'
import { ancestors, getIn, isEqual, setIn, snapshot, toSegments } from './path'

describe('path', () => {
  it('splits and walks paths', () => {
    expect(toSegments('')).toEqual([])
    expect(toSegments('a.0.b')).toEqual(['a', '0', 'b'])
    expect(getIn({ a: [{ b: 1 }] }, toSegments('a.0.b'))).toBe(1)
    expect(getIn({ a: null }, toSegments('a.b'))).toBeUndefined()
  })

  it('lists a path and everything above it', () => {
    expect(ancestors('')).toEqual([''])
    expect(ancestors('a.b.c')).toEqual(['', 'a', 'a.b', 'a.b.c'])
  })

  it('sets without touching the original, sharing what did not change', () => {
    const root = { a: { b: 1 }, c: { d: 2 }, list: [{ n: 1 }] }
    const next = setIn(root, toSegments('a.b'), 5) as typeof root
    expect(next.a.b).toBe(5)
    expect(root.a.b).toBe(1)
    expect(next.c).toBe(root.c)

    const same = setIn(root, toSegments('a.b'), 1)
    expect(same).toBe(root)
  })

  it('creates arrays for numeric keys and objects for the rest', () => {
    expect(setIn(undefined, toSegments('a.0.b'), 1)).toEqual({ a: [{ b: 1 }] })
  })

  it('reports each array it copies', () => {
    const list = [{ n: 1 }]
    const seen: unknown[][] = []
    const next = setIn({ list }, toSegments('list.0.n'), 2, (from, to) => seen.push(from, to)) as {
      list: unknown[]
    }
    expect(seen).toEqual([list, next.list])
  })

  it('compares deeply, and copies plain data only', () => {
    expect(isEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(isEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(isEqual(new Date(5), new Date(5))).toBe(true)
    const date = new Date()
    const copy = snapshot({ date, list: [1] })
    expect(copy.date).toBe(date)
    expect(copy.list).not.toBe(snapshot({ list: [1] }).list)
  })
})
