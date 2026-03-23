// test/scan.test.mjs
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

describe('scan.mjs — parseSitemap()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns <loc> values from a regular sitemap', async () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://example.com/</loc></url>
      <url><loc>https://example.com/about</loc></url>
    </urlset>`
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => xml })

    const { parseSitemap } = await import('../src/scan.mjs')
    const urls = await parseSitemap('https://example.com/sitemap.xml')
    expect(urls).toEqual(['https://example.com/', 'https://example.com/about'])
  })

  it('handles a sitemap index by fetching child sitemaps', async () => {
    const indexXml = `<?xml version="1.0"?><sitemapindex>
      <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
    </sitemapindex>`
    const childXml = `<?xml version="1.0"?><urlset>
      <url><loc>https://example.com/page1</loc></url>
      <url><loc>https://example.com/page2</loc></url>
    </urlset>`
    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => indexXml })
      .mockResolvedValueOnce({ ok: true, text: async () => childXml })

    const { parseSitemap } = await import('../src/scan.mjs')
    const urls = await parseSitemap('https://example.com/sitemap.xml')
    expect(urls).toEqual(['https://example.com/page1', 'https://example.com/page2'])
  })

  it('caps results at 20 URLs', async () => {
    const locs = Array.from({ length: 30 }, (_, i) => `<url><loc>https://example.com/page${i}</loc></url>`).join('\n')
    const xml = `<?xml version="1.0"?><urlset>${locs}</urlset>`
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => xml })

    const { parseSitemap } = await import('../src/scan.mjs')
    const urls = await parseSitemap('https://example.com/sitemap.xml')
    expect(urls).toHaveLength(20)
  })

  it('returns [] when fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'))

    const { parseSitemap } = await import('../src/scan.mjs')
    const urls = await parseSitemap('https://example.com/sitemap.xml')
    expect(urls).toEqual([])
  })

  it('returns [] when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, text: async () => '' })

    const { parseSitemap } = await import('../src/scan.mjs')
    const urls = await parseSitemap('https://example.com/sitemap.xml')
    expect(urls).toEqual([])
  })
})

describe('scan.mjs — scanUrls()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GITHUB_SHA = 'abc123'
    process.env.GITHUB_EVENT_NAME = 'push'
  })

  // Helper: mock a full page scan (HTML + 2 assets + GWF check)
  function mockPageScan({ appJsBytes = 50000, cssBytes = 10000, green = true } = {}) {
    mockFetch
      .mockResolvedValueOnce({ text: async () => '<html></html>', ok: true })  // HTML
      .mockResolvedValueOnce({ status: 200, headers: { get: (h) => h === 'content-length' ? String(appJsBytes) : null } })  // app.js HEAD
      .mockResolvedValueOnce({ status: 200, headers: { get: (h) => h === 'content-length' ? String(cssBytes) : null } })   // styles.css HEAD
      .mockResolvedValueOnce({ ok: true, json: async () => ({ green }) })      // GWF
  }

  it('calls scanUrl for each URL and sets pages_scanned', async () => {
    mockPageScan()
    mockPageScan()

    const { scanUrls } = await import('../src/scan.mjs')
    const result = await scanUrls(['https://example.com', 'https://example.com/about'])
    expect(result.pages_scanned).toBe(2)
    expect(result.scanned_urls).toEqual(['https://example.com', 'https://example.com/about'])
  })

  it('deduplicates assets keeping max bytes for the same normalized_url', async () => {
    // Page 1: app.js = 50000, styles.css = 10000
    mockPageScan({ appJsBytes: 50000, cssBytes: 10000 })
    // Page 2: app.js = 80000 (larger — should win), styles.css = 10000
    mockPageScan({ appJsBytes: 80000, cssBytes: 10000 })

    const { scanUrls } = await import('../src/scan.mjs')
    const result = await scanUrls(['https://example.com', 'https://example.com/about'])

    // Should deduplicate to 2 assets, not 4
    expect(result.assets).toHaveLength(2)
    const jsAsset = result.assets.find(a => a.type === 'script')
    expect(jsAsset.bytes).toBe(80000)
  })

  it('sets total_bytes to the average across pages', async () => {
    // Page 1: 60000 total, Page 2: 90000 total → avg = 75000
    mockPageScan({ appJsBytes: 50000, cssBytes: 10000 })  // total 60000
    mockPageScan({ appJsBytes: 80000, cssBytes: 10000 })  // total 90000

    const { scanUrls } = await import('../src/scan.mjs')
    const result = await scanUrls(['https://example.com', 'https://example.com/about'])
    expect(result.total_bytes).toBe(75000)
  })

  it('throws when all URLs fail to scan', async () => {
    mockFetch.mockRejectedValue(new Error('connection refused'))

    const { scanUrls } = await import('../src/scan.mjs')
    await expect(scanUrls(['https://example.com'])).rejects.toThrow('All URLs failed to scan')
  })
})
