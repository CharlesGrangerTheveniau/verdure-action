// src/lib/sourcemap.mjs

const MAX_SOURCEMAP_BYTES = 15 * 1024 * 1024 // 15 MB — skip maps larger than this
const TIMEOUT_MS = 10000

/**
 * Extract npm package name from a source map file path, or '__app__' for
 * first-party code, or null for bundler internals to skip.
 */
export function extractPackage(sourcePath) {
  if (!sourcePath) return null

  // Skip bundler runtime internals
  if (/^(webpack|rollup|vite|parcel)[/\\]/.test(sourcePath)) return null
  if (sourcePath.startsWith('\x00')) return null // rollup virtual modules (e.g. \0commonjsHelpers)

  // node_modules: capture scoped (@org/pkg) or unscoped (pkg) name
  const match = sourcePath.match(/node_modules[/\\](@[^/\\]+[/\\][^/\\]+|[^@/\\][^/\\]*)/)
  if (match) return match[1].replace(/\\/g, '/')

  return '__app__'
}

/**
 * Given a parsed source map and the asset's transfer size in bytes,
 * returns an array of { package, bytes, pct } sorted by bytes desc.
 * Uses sourcesContent string lengths as a proportional weight proxy.
 *
 * @param {object} map — parsed source map JSON (v3)
 * @param {number} assetBytes — transfer size of the JS asset
 * @returns {{ package: string, bytes: number, pct: number }[] | null}
 */
export function analyzeSourceMap(map, assetBytes) {
  const sources = map.sources ?? []
  const content = map.sourcesContent ?? []
  if (sources.length === 0) return null

  const rawByPkg = new Map()
  for (let i = 0; i < sources.length; i++) {
    const pkg = extractPackage(sources[i])
    if (pkg === null) continue
    const weight = content[i]?.length ?? 1 // fallback: 1 char if no sourcesContent
    rawByPkg.set(pkg, (rawByPkg.get(pkg) ?? 0) + weight)
  }
  if (rawByPkg.size === 0) return null

  const totalRaw = [...rawByPkg.values()].reduce((s, v) => s + v, 0)
  return [...rawByPkg.entries()]
    .map(([pkg, raw]) => ({
      package: pkg,
      pct: Math.round((raw / totalRaw) * 100),
      bytes: Math.round((raw / totalRaw) * assetBytes)
    }))
    .filter(p => p.pct >= 1) // drop sub-1% contributors
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8)
}

/**
 * Tries to fetch and parse the source map for a given JS asset URL.
 * Returns null non-fatally if the map doesn't exist, is too large, or times out.
 *
 * @param {string} assetUrl
 * @param {number} assetBytes
 * @param {Record<string, string>} [headers] — optional headers (e.g. bypass auth)
 * @returns {Promise<{ package: string, bytes: number, pct: number }[] | null>}
 */
export async function fetchAndAnalyzeSourceMap(assetUrl, assetBytes, headers = {}) {
  const mapUrl = assetUrl + '.map'

  // HEAD check: verify map exists and isn't oversized before downloading
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    const head = await fetch(mapUrl, { method: 'HEAD', headers, signal: ctrl.signal })
    clearTimeout(t)
    if (!head.ok) return null
    const cl = head.headers.get('content-length')
    if (cl && parseInt(cl, 10) > MAX_SOURCEMAP_BYTES) return null
  } catch {
    return null
  }

  // Fetch and parse
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const res = await fetch(mapUrl, { headers, signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return null
    const map = await res.json()
    return analyzeSourceMap(map, assetBytes)
  } catch {
    return null
  }
}
