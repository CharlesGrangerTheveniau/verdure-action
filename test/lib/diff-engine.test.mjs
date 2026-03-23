import { describe, it, expect } from 'vitest'
import { buildDiff } from '../../src/lib/diff-engine.mjs'

const scan = (overrides = {}) => ({
  co2_swd_grams: 0.40,
  co2_one_byte_grams: 0.36,
  total_bytes: 400000,
  green_hosting: true,
  assets: [],
  ...overrides
})

const asset = (normalized_url, bytes, type = 'script') => ({
  url: `https://example.com/${normalized_url}`,
  normalized_url,
  type,
  bytes,
  third_party: false
})

describe('buildDiff', () => {
  it('returns has_baseline: true', () => {
    const diff = buildDiff(scan(), scan())
    expect(diff.has_baseline).toBe(true)
  })

  it('produces no top_changes when assets are unchanged', () => {
    const a = scan({ assets: [asset('app.js', 100)] })
    const b = scan({ assets: [asset('app.js', 100)] })
    expect(buildDiff(a, b).top_changes).toHaveLength(0)
  })

  it('marks a new asset as added with null bytes_before', () => {
    const baseline = scan({ assets: [] })
    const current = scan({ assets: [asset('new.js', 50000)] })
    const diff = buildDiff(baseline, current)
    expect(diff.top_changes[0]).toMatchObject({
      normalized_url: 'new.js',
      status: 'added',
      bytes_before: null,
      bytes_after: 50000,
      delta_bytes: 50000,
      delta_pct: null
    })
  })

  it('marks a removed asset with null bytes_after and negative delta', () => {
    const baseline = scan({ assets: [asset('old.js', 80000)] })
    const current = scan({ assets: [] })
    const diff = buildDiff(baseline, current)
    expect(diff.top_changes[0]).toMatchObject({
      normalized_url: 'old.js',
      status: 'removed',
      bytes_before: 80000,
      bytes_after: null,
      delta_bytes: -80000,
      delta_pct: null
    })
  })

  it('marks a grown asset as changed with correct delta', () => {
    const baseline = scan({ assets: [asset('app.js', 100000)] })
    const current = scan({ assets: [asset('app.js', 150000)] })
    const diff = buildDiff(baseline, current)
    expect(diff.top_changes[0]).toMatchObject({
      status: 'changed',
      bytes_before: 100000,
      bytes_after: 150000,
      delta_bytes: 50000,
      delta_pct: 50
    })
  })

  it('sorts top_changes by absolute delta_bytes descending', () => {
    const baseline = scan({ assets: [asset('small.js', 10000), asset('big.js', 100000)] })
    const current = scan({ assets: [asset('small.js', 11000), asset('big.js', 200000)] })
    const diff = buildDiff(baseline, current)
    expect(diff.top_changes[0].normalized_url).toBe('big.js')   // +100000
    expect(diff.top_changes[1].normalized_url).toBe('small.js') // +1000
  })

  it('caps top_changes at 5 entries', () => {
    const assets = Array.from({ length: 10 }, (_, i) => asset(`f${i}.js`, 1000 * (i + 1)))
    const baseline = scan({ assets })
    const current = scan({ assets: assets.map(a => ({ ...a, bytes: a.bytes * 2 })) })
    expect(buildDiff(baseline, current).top_changes).toHaveLength(5)
  })

  it('includes before/after carbon and weight values', () => {
    const baseline = scan({ co2_swd_grams: 0.40, total_bytes: 400000, green_hosting: true })
    const current = scan({ co2_swd_grams: 0.50, total_bytes: 500000, green_hosting: false })
    const diff = buildDiff(baseline, current)
    expect(diff.carbon_before_grams).toBe(0.40)
    expect(diff.carbon_after_grams).toBe(0.50)
    expect(diff.weight_before_bytes).toBe(400000)
    expect(diff.weight_after_bytes).toBe(500000)
    expect(diff.green_hosting_before).toBe(true)
    expect(diff.green_hosting_after).toBe(false)
  })

  it('computes carbon and weight deltas', () => {
    const baseline = scan({ co2_swd_grams: 0.40, total_bytes: 400000 })
    const current = scan({ co2_swd_grams: 0.50, total_bytes: 500000 })
    const diff = buildDiff(baseline, current)
    expect(diff.carbon_delta_pct).toBe(25)
    expect(diff.weight_delta_bytes).toBe(100000)
    expect(diff.weight_delta_pct).toBe(25)
  })
})
