// test/diff.test.mjs
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'fs'

const mockSetOutput = vi.fn()
const mockSetFailed = vi.fn()

vi.mock('@actions/core', () => ({ default: { setOutput: mockSetOutput, setFailed: mockSetFailed } }))

const baseline = {
  url: 'https://example.com',
  sha: 'abc',
  timestamp: '2026-01-01T00:00:00Z',
  green_hosting: true,
  co2_swd_grams: 0.40,
  co2_one_byte_grams: 0.36,
  total_bytes: 400000,
  assets: [{ url: 'https://example.com/app.js', normalized_url: 'app.js', type: 'script', bytes: 100000, third_party: false }],
  summary: { asset_count: 1, js_bytes: 100000, css_bytes: 0, image_bytes: 0, third_party_bytes: 0, third_party_count: 0 }
}

describe('diff.mjs — baseline mode', () => {
  it('runBaseline completes without error (upload handled by action step)', async () => {
    process.env.GITHUB_EVENT_NAME = 'push'
    process.env.GITHUB_REF = 'refs/heads/main'

    writeFileSync('verdure-scan.json', JSON.stringify(baseline))

    const { runBaseline } = await import('../src/diff.mjs')
    await expect(runBaseline()).resolves.toBeUndefined()
  })
})

describe('diff.mjs — no baseline found', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    if (existsSync('./.verdure-baseline')) {
      rmSync('./.verdure-baseline', { recursive: true })
    }
  })

  it('writes has_baseline: false diff and sets regression output to none', async () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request'
    process.env.GITHUB_BASE_REF = 'main'

    writeFileSync('verdure-scan.json', JSON.stringify(baseline))

    const { runDiff } = await import('../src/diff.mjs')
    await runDiff({ carbonBudget: null, weightBudget: null })

    const diff = JSON.parse(readFileSync('verdure-diff.json', 'utf8'))
    expect(diff.has_baseline).toBe(false)
    expect(mockSetOutput).toHaveBeenCalledWith('regression', 'none')
  })
})

describe('diff.mjs — baseline present', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mkdirSync('./.verdure-baseline', { recursive: true })
    writeFileSync('./.verdure-baseline/verdure-scan.json', JSON.stringify(baseline))
  })

  it('computes diff when baseline file exists', async () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request'

    writeFileSync('verdure-scan.json', JSON.stringify(baseline))

    const { runDiff } = await import('../src/diff.mjs')
    await runDiff({ carbonBudget: null, weightBudget: null })

    const diff = JSON.parse(readFileSync('verdure-diff.json', 'utf8'))
    expect(diff.has_baseline).toBe(true)
    expect(mockSetOutput).toHaveBeenCalledWith('regression', 'false')
  })
})
