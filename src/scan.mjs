// src/scan.mjs
import { writeFileSync } from 'fs'
import { parse } from 'node-html-parser'
import { co2 } from '@tgwf/co2'
import core from '@actions/core'
import { normalizeUrl } from './lib/normalize.mjs'

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

    // Fallback: GET and read content-length from response
    const res2 = await fetch(assetUrl)
    const buf = await res2.arrayBuffer()
    return buf.byteLength
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

// Entry point when run as a script (skipped during Vitest runs)
if (!process.env.VITEST) {
  const url = process.env.VERDURE_URL
  if (!url) { console.error('VERDURE_URL is required'); process.exit(1) }

  const scan = await scanUrl(url)
  writeFileSync('verdure-scan.json', JSON.stringify(scan, null, 2))

  core.setOutput('carbon-grams', scan.co2_swd_grams.toString())
  core.setOutput('page-weight-kb', Math.round(scan.total_bytes / 1024).toString())

  console.log(`✅ Scan complete: ${scan.co2_swd_grams.toFixed(3)}g CO₂ · ${Math.round(scan.total_bytes / 1024)} KB`)
}
