// src/lib/playwright-scan.mjs
import { readFileSync } from 'fs'
import { co2 } from '@tgwf/co2'
import { normalizeUrl } from './normalize.mjs'
import { fetchAndAnalyzeSourceMap } from './sourcemap.mjs'

const CO2JS_VERSION = JSON.parse(
  readFileSync(new URL('../../node_modules/@tgwf/co2/package.json', import.meta.url), 'utf8')
).version

const SKIPPED_PROTOCOLS = ['data:', 'blob:', 'chrome-extension:', 'about:']

function mapResourceType(playwrightType) {
  if (playwrightType === 'script') return 'script'
  if (playwrightType === 'stylesheet') return 'style'
  if (playwrightType === 'image') return 'image'
  if (playwrightType === 'font') return 'font'
  return 'other'
}

/**
 * Scan a URL using an already-open (and optionally authenticated) Playwright page.
 * Registers a response listener, navigates, waits for network idle, then calculates CO₂.
 *
 * IMPORTANT — async response handling: Playwright fires response events asynchronously
 * and does not await their handlers. We collect each handler's Promise into `inFlight`
 * and await them all after waitForLoadState to ensure body() reads complete before
 * we calculate totals. Without this, assets that required body() fallback would be missed.
 *
 * @param {import('playwright').Page} page - An open Playwright page (auth already done if needed)
 * @param {string} url - The URL to navigate to and scan
 * @returns {Promise<object>} Scan result in the standard verdure JSON shape
 */
export async function scanUrlWithPage(page, url) {
  const base = new URL(url)
  const assets = []
  const inFlight = []  // tracks async response handler Promises

  page.on('response', (response) => {
    // Push the async work into inFlight — do NOT make the handler itself async,
    // as Playwright does not await it. We await inFlight after navigation instead.
    inFlight.push((async () => {
      const responseUrl = response.url()

      if (SKIPPED_PROTOCOLS.some(p => responseUrl.startsWith(p))) return
      if (response.status() < 200 || response.status() >= 300) return

      const resourceType = response.request().resourceType()
      if (resourceType === 'document' || resourceType === 'xhr' || resourceType === 'fetch') return

      let bytes = 0
      const headers = response.headers()
      const cl = headers['content-length']
      if (cl && parseInt(cl, 10) > 0) {
        bytes = parseInt(cl, 10)
      } else {
        try {
          const body = await response.body()
          bytes = body.byteLength
        } catch {
          bytes = 0
        }
      }

      let responseHostname
      try { responseHostname = new URL(responseUrl).hostname } catch { return }

      assets.push({
        url: responseUrl,
        normalized_url: normalizeUrl(responseUrl),
        type: mapResourceType(resourceType),
        bytes,
        third_party: responseHostname !== base.hostname
      })
    })())
  })

  await page.goto(url)
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 })
  } catch {
    // networkidle timed out (polling/websockets) — proceed with assets collected so far
    console.warn('verdure: networkidle timeout — proceeding with assets collected so far')
  }

  // Ensure all async response handlers (including body() reads) have completed
  await Promise.all(inFlight)

  // Enrich large JS bundles with source map package breakdown (non-fatal)
  await Promise.all(
    assets
      .filter(a => a.type === 'script' && a.bytes > 200 * 1024)
      .map(async a => {
        a.packages = await fetchAndAnalyzeSourceMap(a.url, a.bytes, {})
      })
  )

  const total_bytes = assets.reduce((sum, a) => sum + a.bytes, 0)

  const swd = new co2({ model: 'swd' })
  const oneByte = new co2({ model: '1byte' })

  let sha = process.env.GITHUB_SHA ?? ''
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    try {
      const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
      sha = event.pull_request?.head?.sha ?? sha
    } catch { /* use GITHUB_SHA */ }
  }

  return {
    url,
    sha,
    timestamp: new Date().toISOString(),
    co2js_version: CO2JS_VERSION,
    scan_engine: 'playwright',
    green_hosting: null, // set and CO₂ recalculated by scanUrlPlaywright() after this returns
    co2_swd_grams: swd.perByte(total_bytes, false),
    co2_one_byte_grams: oneByte.perByte(total_bytes, false),
    total_bytes,
    assets,
    summary: {
      asset_count: assets.length,
      js_bytes: assets.filter(a => a.type === 'script').reduce((s, a) => s + a.bytes, 0),
      css_bytes: assets.filter(a => a.type === 'style').reduce((s, a) => s + a.bytes, 0),
      image_bytes: assets.filter(a => a.type === 'image').reduce((s, a) => s + a.bytes, 0),
      third_party_bytes: assets.filter(a => a.third_party).reduce((s, a) => s + a.bytes, 0),
      third_party_count: assets.filter(a => a.third_party).length
    }
  }
}
