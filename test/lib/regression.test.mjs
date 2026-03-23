import { describe, it, expect } from 'vitest'
import { detectRegression } from '../../src/lib/regression.mjs'

const diff = (overrides = {}) => ({
  carbon_delta_pct: 0,
  weight_delta_pct: 0,
  carbon_after_grams: 0.40,
  weight_after_bytes: 400000,
  ...overrides
})

describe('detectRegression', () => {
  it('returns no regression when both deltas are 0', () => {
    const result = detectRegression(diff(), {})
    expect(result.regression.carbon).toBe(false)
    expect(result.regression.weight).toBe(false)
  })

  it('detects carbon regression above 5% threshold', () => {
    const result = detectRegression(diff({ carbon_delta_pct: 6 }), {})
    expect(result.regression.carbon).toBe(true)
  })

  it('does not flag carbon regression at exactly 5%', () => {
    const result = detectRegression(diff({ carbon_delta_pct: 5 }), {})
    expect(result.regression.carbon).toBe(false)
  })

  it('detects weight regression above 5% threshold', () => {
    const result = detectRegression(diff({ weight_delta_pct: 10 }), {})
    expect(result.regression.weight).toBe(true)
  })

  it('does not flag regression for negative delta (improvement)', () => {
    const result = detectRegression(diff({ carbon_delta_pct: -20 }), {})
    expect(result.regression.carbon).toBe(false)
  })

  it('flags carbon budget exceeded when value exceeds budget', () => {
    const result = detectRegression(
      diff({ carbon_after_grams: 0.60 }),
      { carbonBudget: 0.50 }
    )
    expect(result.budget_exceeded.carbon).toBe(true)
  })

  it('does not flag budget when value is under budget', () => {
    const result = detectRegression(
      diff({ carbon_after_grams: 0.40 }),
      { carbonBudget: 0.50 }
    )
    expect(result.budget_exceeded.carbon).toBe(false)
  })

  it('flags weight budget exceeded when value exceeds budget (in KB)', () => {
    const result = detectRegression(
      diff({ weight_after_bytes: 600000 }),
      { weightBudget: 500 }   // 500 KB = 512000 bytes
    )
    expect(result.budget_exceeded.weight).toBe(true)
  })

  it('returns budget_exceeded false when no budgets are set', () => {
    const result = detectRegression(diff({ carbon_after_grams: 99, weight_after_bytes: 99999999 }), {})
    expect(result.budget_exceeded.carbon).toBe(false)
    expect(result.budget_exceeded.weight).toBe(false)
  })
})
