// src/lib/suggestions.mjs

const MAX_SUGGESTIONS = 3

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`

/**
 * Returns up to MAX_SUGGESTIONS deterministic, rule-based suggestion strings
 * derived from a verdure-scan.json object. No LLM required.
 *
 * @param {object} scan — verdure-scan.json
 * @returns {string[]} markdown-formatted suggestion strings
 */
export function buildSuggestions(scan) {
  const suggestions = []
  const assets = scan.assets ?? []

  // Rule 1: Images not in modern format (WebP/AVIF) over 50 KB
  const heavyLegacyImages = assets
    .filter(a => a.type === 'image' && a.bytes > 50 * 1024)
    .filter(a => !/\.(webp|avif)(\?|$)/i.test(a.url))
    .sort((a, b) => b.bytes - a.bytes)

  for (const img of heavyLegacyImages) {
    if (suggestions.length >= MAX_SUGGESTIONS) break
    const name = img.normalized_url.split('/').pop()
    suggestions.push(`\`${name}\` (${kb(img.bytes)}) — convert to WebP/AVIF, estimated −60% size`)
  }

  // Rule 2: Large JS bundles over 200 KB
  if (suggestions.length < MAX_SUGGESTIONS) {
    const heavyScripts = assets
      .filter(a => a.type === 'script' && a.bytes > 200 * 1024)
      .sort((a, b) => b.bytes - a.bytes)

    for (const script of heavyScripts) {
      if (suggestions.length >= MAX_SUGGESTIONS) break
      const name = script.normalized_url.split('/').pop()
      suggestions.push(`\`${name}\` (${kb(script.bytes)}) — consider code-splitting or lazy loading`)
    }
  }

  // Rule 3: Heavy third-party payload
  if (suggestions.length < MAX_SUGGESTIONS) {
    const { third_party_bytes = 0, third_party_count = 0 } = scan.summary ?? {}
    if (third_party_bytes > 100 * 1024) {
      suggestions.push(
        `${kb(third_party_bytes)} from ${third_party_count} third-party script${third_party_count !== 1 ? 's' : ''} — review if all are necessary`
      )
    } else if (third_party_count > 3) {
      suggestions.push(
        `${third_party_count} third-party requests detected — each adds latency and carbon overhead`
      )
    }
  }

  return suggestions
}
