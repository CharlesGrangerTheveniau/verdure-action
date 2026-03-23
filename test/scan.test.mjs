// test/scan.test.mjs
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock node-html-parser
vi.mock('node-html-parser', () => ({
  parse: vi.fn(() => ({
    querySelectorAll: vi.fn((selector) => {
      if (selector === 'script[src]') return [{ getAttribute: (attr) => attr === 'src' ? '/app.js' : null }]
      if (selector === 'link[rel=stylesheet]') return [{ getAttribute: (attr) => attr === 'href' ? '/styles.css' : null }]
      if (selector === 'img[src]') return []
      if (selector === 'link[rel=preload]') return []
      return []
    })
  }))
}))

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('scan.mjs — scanUrl()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GITHUB_SHA = 'abc123'
    process.env.GITHUB_EVENT_NAME = 'push'
  })

  it('returns co2_swd_grams, total_bytes, and assets from a page', async () => {
    // Page HTML fetch
    mockFetch
      .mockResolvedValueOnce({
        text: async () => '<html></html>',
        ok: true
      })
      // HEAD for /app.js
      .mockResolvedValueOnce({
        status: 200,
        headers: { get: (h) => h === 'content-length' ? '50000' : null }
      })
      // HEAD for /styles.css
      .mockResolvedValueOnce({
        status: 200,
        headers: { get: (h) => h === 'content-length' ? '10000' : null }
      })
      // GWF check
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ green: true })
      })

    const { scanUrl } = await import('../src/scan.mjs')
    const result = await scanUrl('https://example.com')

    expect(result.total_bytes).toBe(60000)
    expect(result.green_hosting).toBe(true)
    expect(result.co2_swd_grams).toBeGreaterThan(0)
    expect(result.assets).toHaveLength(2)
    expect(result.assets[0].normalized_url).toBe('app.js')
  })

  it('sets green_hosting to null when GWF check fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ text: async () => '<html></html>', ok: true })
      .mockResolvedValueOnce({ status: 200, headers: { get: () => '1000' } })  // app.js HEAD
      .mockResolvedValueOnce({ status: 200, headers: { get: () => '500' } })   // styles.css HEAD
      .mockRejectedValueOnce(new Error('GWF timeout'))                          // GWF check

    const { scanUrl } = await import('../src/scan.mjs')
    const result = await scanUrl('https://example.com')
    expect(result.green_hosting).toBeNull()
  })
})
