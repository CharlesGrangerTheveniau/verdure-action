// test/diff.test.mjs
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeFileSync, readFileSync } from 'fs'

const mockUpload = vi.fn(async () => ({}))
const mockDownload = vi.fn(async () => ({}))

// Mock @actions/artifact
vi.mock('@actions/artifact', () => ({
  DefaultArtifactClient: vi.fn(() => ({
    uploadArtifact: mockUpload,
    downloadArtifact: mockDownload
  }))
}))

// Mock @actions/github
vi.mock('@actions/github', () => ({
  default: {
    getOctokit: vi.fn(() => ({
      rest: {
        actions: {
          listArtifactsForRepo: vi.fn(async () => ({
            data: { artifacts: [] }
          }))
        }
      }
    })),
    context: {
      repo: { owner: 'verdure-io', repo: 'test-repo' }
    }
  }
}))

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
  it('uploads artifact when on main branch push', async () => {
    process.env.GITHUB_EVENT_NAME = 'push'
    process.env.GITHUB_REF = 'refs/heads/main'

    writeFileSync('verdure-scan.json', JSON.stringify(baseline))

    const { runBaseline } = await import('../src/diff.mjs')
    await runBaseline()

    expect(mockUpload).toHaveBeenCalledWith(
      'verdure-baseline',
      expect.arrayContaining(['verdure-scan.json']),
      expect.any(String),
      { retentionDays: 90 }
    )
  })
})

describe('diff.mjs — no baseline found', () => {
  it('writes has_baseline: false diff and sets regression output to none', async () => {
    process.env.GITHUB_EVENT_NAME = 'pull_request'
    process.env.GITHUB_BASE_REF = 'main'

    writeFileSync('verdure-scan.json', JSON.stringify(baseline))

    const { runDiff } = await import('../src/diff.mjs')
    await runDiff({ carbonBudget: null, weightBudget: null })

    const diff = JSON.parse(readFileSync('verdure-diff.json', 'utf8'))
    expect(diff.has_baseline).toBe(false)
  })
})
