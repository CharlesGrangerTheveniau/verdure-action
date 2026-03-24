// test/lib/playwright-scan.test.mjs
import { describe, it, expect, vi } from 'vitest'

vi.mock('@tgwf/co2', () => ({
  co2: vi.fn().mockImplementation(() => ({
    perByte: vi.fn().mockReturnValue(0.5)
  }))
}))

vi.mock('../../src/lib/sourcemap.mjs', () => ({
  fetchAndAnalyzeSourceMap: vi.fn().mockResolvedValue(null)
}))

vi.mock('../../src/lib/normalize.mjs', () => ({
  normalizeUrl: vi.fn(url => url.split('/').pop())
}))

/**
 * Creates a mock Playwright page.
 * Fire responses from inside page.goto.mockImplementation so they are
 * processed before scanUrlWithPage returns (see inFlight pattern).
 */
function makeMockPage() {
  const handlers = {}
  const page = {
    on: vi.fn((event, handler) => { handlers[event] = handler }),
    goto: vi.fn().mockResolvedValue({}),
    waitForLoadState: vi.fn().mockResolvedValue({}),
    _fireResponse: (response) => handlers['response']?.(response)
  }
  return page
}

function makeMockResponse({ url, resourceType = 'script', contentLength = '50000', status = 200 }) {
  return {
    url: () => url,
    status: () => status,
    request: () => ({ resourceType: () => resourceType }),
    headers: () => contentLength ? { 'content-length': contentLength } : {},
    body: vi.fn().mockResolvedValue(Buffer.alloc(parseInt(contentLength || '0')))
  }
}

describe('playwright-scan.mjs — scanUrlWithPage()', () => {
  it('collects assets from response events and returns scan shape', async () => {
    const { scanUrlWithPage } = await import('../../src/lib/playwright-scan.mjs')
    const page = makeMockPage()

    page.goto.mockImplementation(async () => {
      page._fireResponse(makeMockResponse({ url: 'https://example.com/app.js', contentLength: '80000' }))
      page._fireResponse(makeMockResponse({ url: 'https://example.com/styles.css', resourceType: 'stylesheet', contentLength: '15000' }))
    })

    const result = await scanUrlWithPage(page, 'https://example.com')

    expect(result.total_bytes).toBe(95000)
    expect(result.assets).toHaveLength(2)
    expect(result.scan_engine).toBe('playwright')
    expect(result.assets[0].type).toBe('script')
    expect(result.assets[1].type).toBe('style')
  })

  it('skips responses with non-200 status', async () => {
    const { scanUrlWithPage } = await import('../../src/lib/playwright-scan.mjs')
    const page = makeMockPage()

    page.goto.mockImplementation(async () => {
      page._fireResponse(makeMockResponse({ url: 'https://example.com/missing.js', status: 404, contentLength: '0' }))
    })

    const result = await scanUrlWithPage(page, 'https://example.com')
    expect(result.assets).toHaveLength(0)
  })

  it('skips data:, blob:, chrome-extension:, and about: URLs', async () => {
    const { scanUrlWithPage } = await import('../../src/lib/playwright-scan.mjs')
    const page = makeMockPage()

    page.goto.mockImplementation(async () => {
      page._fireResponse(makeMockResponse({ url: 'data:image/png;base64,abc', resourceType: 'image', contentLength: '1000' }))
      page._fireResponse(makeMockResponse({ url: 'blob:https://example.com/video', resourceType: 'media', contentLength: '5000' }))
      page._fireResponse(makeMockResponse({ url: 'chrome-extension://abc/bg.js', contentLength: '2000' }))
      page._fireResponse(makeMockResponse({ url: 'about:blank', resourceType: 'document', contentLength: '0' }))
    })

    const result = await scanUrlWithPage(page, 'https://example.com')
    expect(result.assets).toHaveLength(0)
  })

  it('falls back to body byteLength when content-length header is missing', async () => {
    const { scanUrlWithPage } = await import('../../src/lib/playwright-scan.mjs')
    const page = makeMockPage()

    page.goto.mockImplementation(async () => {
      page._fireResponse({
        url: () => 'https://example.com/chunk.js',
        status: () => 200,
        request: () => ({ resourceType: () => 'script' }),
        headers: () => ({}),
        body: vi.fn().mockResolvedValue(Buffer.alloc(42000))
      })
    })

    const result = await scanUrlWithPage(page, 'https://example.com')
    expect(result.assets[0].bytes).toBe(42000)
  })

  it('marks cross-origin responses as third_party', async () => {
    const { scanUrlWithPage } = await import('../../src/lib/playwright-scan.mjs')
    const page = makeMockPage()

    page.goto.mockImplementation(async () => {
      page._fireResponse(makeMockResponse({ url: 'https://cdn.google.com/analytics.js', contentLength: '30000' }))
    })

    const result = await scanUrlWithPage(page, 'https://example.com')
    expect(result.assets[0].third_party).toBe(true)
  })
})
