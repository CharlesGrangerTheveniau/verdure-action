// test/report.test.mjs
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateComment = vi.fn(async () => ({}))
const mockUpdateComment = vi.fn(async () => ({}))
const mockListComments = vi.fn(async () => ({ data: [] }))
const mockCreateCheckRun = vi.fn(async () => ({}))

vi.mock('@actions/github', () => ({
  default: {
    getOctokit: vi.fn(() => ({
      rest: {
        issues: {
          listComments: mockListComments,
          createComment: mockCreateComment,
          updateComment: mockUpdateComment
        },
        checks: { create: mockCreateCheckRun }
      }
    })),
    context: {
      repo: { owner: 'verdure-io', repo: 'test-repo' },
      payload: { pull_request: { number: 42, head: { sha: 'deadbeef' } } }
    }
  }
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn((path) => {
      if (path.includes('verdure-diff.json')) {
        return JSON.stringify({ has_baseline: false })
      }
      if (path.includes('verdure-scan.json')) {
        return JSON.stringify({
          co2_swd_grams: 0.42,
          total_bytes: 450000,
          green_hosting: true
        })
      }
      return actual.readFileSync(path)
    })
  }
})

describe('report.mjs — no baseline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GITHUB_EVENT_NAME = 'pull_request'
    process.env.VERDURE_TOKEN = 'fake-token'
    process.env.VERDURE_FAIL_ON_REGRESSION = 'true'
  })

  it('posts a new comment when none exists', async () => {
    mockListComments.mockResolvedValueOnce({ data: [] })
    const { runReport } = await import('../src/report.mjs')
    await runReport()
    expect(mockCreateComment).toHaveBeenCalledOnce()
    expect(mockCreateComment.mock.calls[0][0].body).toContain('<!-- verdure -->')
  })

  it('updates existing comment instead of posting new one', async () => {
    mockListComments.mockResolvedValueOnce({
      data: [{ id: 99, body: '<!-- verdure --> old content' }]
    })
    const { runReport } = await import('../src/report.mjs')
    await runReport()
    expect(mockUpdateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 99 })
    )
    expect(mockCreateComment).not.toHaveBeenCalled()
  })

  it('creates a Check Run with neutral conclusion when no baseline', async () => {
    const { runReport } = await import('../src/report.mjs')
    await runReport()
    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conclusion: 'neutral',
        head_sha: 'deadbeef'
      })
    )
  })
})
