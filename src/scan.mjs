// src/scan.mjs
import { writeFileSync, readFileSync } from 'fs'
import { parse } from 'node-html-parser'
import { co2 } from '@tgwf/co2'
import core from '@actions/core'
import { normalizeUrl } from './lib/normalize.mjs'
import { fetchAndAnalyzeSourceMap } from './lib/sourcemap.mjs'

const CO2JS_VERSION = JSON.parse(
  readFileSync(new URL('../node_modules/@tgwf/co2/package.json', import.meta.url), 'utf8')
).version

const CONCURRENCY = 10
const TIMEOUT_MS = 5000

/**
 * Detect asset type from URL extension
 */
function assetType(url) {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
  if (['js', 'mjs'].includes(ext)) return 'script'
  if (['css'].includes(ext)) return 'style'
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif'].includes(ext)) return 'image'
  if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) return 'font'
  return 'other'
}

/**
 * Get transfer size of a single asset URL.
 * Tries HEAD first; falls back to GET + abort after reading headers.
 */
async function getAssetSize(assetUrl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(assetUrl, { method: 'HEAD', signal: controller.signal })
    clearTimeout(timeout)
    const cl = res.headers.get('content-length')
    if (cl && parseInt(cl, 10) > 0) return parseInt(cl, 10)

    // Fallback: GET with its own timeout
    const controller2 = new AbortController()
    const timeout2 = setTimeout(() => controller2.abort(), TIMEOUT_MS)
    try {
      const res2 = await fetch(assetUrl, { signal: controller2.signal })
      clearTimeout(timeout2)
      const buf = await res2.arrayBuffer()
      return buf.byteLength
    } catch {
      clearTimeout(timeout2)
      return 0
    }
  } catch {
    clearTimeout(timeout)
    return 0
  }
}

/**
 * Run concurrently in chunks of CONCURRENCY
 */
async function mapConcurrent(items, fn) {
  const results = []
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const chunk = items.slice(i, i + CONCURRENCY)
    results.push(...await Promise.all(chunk.map(fn)))
  }
  return results
}

/**
 * Check green hosting via Green Web Foundation API (non-fatal)
 */
async function checkGreenHosting(hostname) {
  try {
    const res = await fetch(`https://api.thegreenwebfoundation.org/greencheck/${hostname}`)
    if (!res.ok) return null
    const { green } = await res.json()
    return Boolean(green)
  } catch {
    return null
  }
}

/**
 * Main scan function. Exported for testing.
 */
export async function scanUrl(url) {
  const pageRes = await fetch(url)
  const html = await pageRes.text()
  const root = parse(html)
  const base = new URL(url)

  const rawUrls = [
    ...root.querySelectorAll('script[src]').map(el => el.getAttribute('src')),
    ...root.querySelectorAll('link[rel=stylesheet]').map(el => el.getAttribute('href')),
    ...root.querySelectorAll('img[src]').map(el => el.getAttribute('src')),
    ...root.querySelectorAll('link[rel=preload]').map(el => el.getAttribute('href'))
  ].filter(Boolean)

  const resolvedUrls = rawUrls.map(u => {
    try { return new URL(u, base).href } catch { return null }
  }).filter(Boolean)

  const assets = await mapConcurrent(resolvedUrls, async (assetUrl) => {
    const bytes = await getAssetSize(assetUrl)
    return {
      url: assetUrl,
      normalized_url: normalizeUrl(assetUrl),
      type: assetType(assetUrl),
      bytes,
      third_party: new URL(assetUrl).hostname !== base.hostname
    }
  })

  // Enrich large JS bundles with source map package breakdown (non-fatal)
  await Promise.all(
    assets
      .filter(a => a.type === 'script' && a.bytes > 200 * 1024)
      .map(async a => {
        a.packages = await fetchAndAnalyzeSourceMap(a.url, a.bytes)
      })
  )

  const total_bytes = assets.reduce((sum, a) => sum + a.bytes, 0)
  const green_hosting = await checkGreenHosting(base.hostname)

  const swd = new co2({ model: 'swd' })
  const oneByte = new co2({ model: '1byte' })

  // On pull_request events, use the PR head SHA; on push, use GITHUB_SHA
  let sha = process.env.GITHUB_SHA ?? ''
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    try {
      const event = JSON.parse(
        await import('fs').then(fs => fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
      )
      sha = event.pull_request?.head?.sha ?? sha
    } catch { /* use GITHUB_SHA as fallback */ }
  }

  return {
    url,
    sha,
    timestamp: new Date().toISOString(),
    co2js_version: CO2JS_VERSION,
    green_hosting,
    co2_swd_grams: swd.perByte(total_bytes, green_hosting ?? false),
    co2_one_byte_grams: oneByte.perByte(total_bytes, green_hosting ?? false),
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

const MAX_SITEMAP_URLS = 20

/**
 * Fetch and parse a sitemap.xml, returning up to MAX_SITEMAP_URLS <loc> values.
 * Handles sitemap index files (one level of nesting). Non-fatal: returns [] on failure.
 */
export async function parseSitemap(sitemapUrl) {
  try {
    const res = await fetch(sitemapUrl)
    if (!res.ok) return []
    const xml = await res.text()

    // Sitemap index: contains <sitemapindex> — recurse into child sitemaps
    if (xml.includes('<sitemapindex')) {
      const childUrls = [...xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map(m => m[1])
      const nested = await Promise.all(childUrls.slice(0, 5).map(parseSitemap))
      return nested.flat().slice(0, MAX_SITEMAP_URLS)
    }

    // Regular sitemap
    return [...xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)]
      .map(m => m[1])
      .slice(0, MAX_SITEMAP_URLS)
  } catch {
    return []
  }
}

/**
 * Scan multiple URLs sequentially, deduplicate assets, and return a merged result.
 * total_bytes is the average per-page bytes (preserves "per visit" carbon semantics).
 */
export async function scanUrls(urls) {
  const scans = []
  for (const url of urls) {
    try { scans.push(await scanUrl(url)) } catch { /* skip failed pages */ }
  }
  if (scans.length === 0) throw new Error('All URLs failed to scan')

  // Deduplicate assets — keep max bytes for same normalized_url
  const assetMap = new Map()
  for (const scan of scans) {
    for (const asset of scan.assets) {
      const existing = assetMap.get(asset.normalized_url)
      if (!existing || asset.bytes > existing.bytes) {
        assetMap.set(asset.normalized_url, asset)
      }
    }
  }
  const assets = [...assetMap.values()]

  // Average per-page bytes for carbon semantics
  const avg_bytes = Math.round(scans.reduce((s, sc) => s + sc.total_bytes, 0) / scans.length)
  const green_hosting = scans[0].green_hosting  // same host, checked once

  const swd = new co2({ model: 'swd' })
  const oneByte = new co2({ model: '1byte' })

  return {
    ...scans[0],                          // sha, timestamp, url
    green_hosting,
    co2_swd_grams: swd.perByte(avg_bytes, green_hosting ?? false),
    co2_one_byte_grams: oneByte.perByte(avg_bytes, green_hosting ?? false),
    total_bytes: avg_bytes,
    pages_scanned: scans.length,
    scanned_urls: scans.map(s => s.url),
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

// Entry point when run as a script (skipped during Vitest runs)
if (!process.env.VITEST) {
  const sitemapUrl = process.env.VERDURE_SITEMAP_URL
  const primaryUrl = process.env.VERDURE_URL

  let urls = sitemapUrl ? await parseSitemap(sitemapUrl) : []
  if (primaryUrl && !urls.includes(primaryUrl)) urls.unshift(primaryUrl)
  if (urls.length === 0) { console.error('VERDURE_URL or VERDURE_SITEMAP_URL is required'); process.exit(1) }

  const scan = urls.length === 1 ? await scanUrl(urls[0]) : await scanUrls(urls)
  writeFileSync('verdure-scan.json', JSON.stringify(scan, null, 2))

  core.setOutput('carbon-grams', scan.co2_swd_grams.toString())
  core.setOutput('page-weight-kb', Math.round(scan.total_bytes / 1024).toString())

  console.log(`✅ Scan complete: ${scan.co2_swd_grams.toFixed(3)}g CO₂ · ${Math.round(scan.total_bytes / 1024)} KB`)
}
