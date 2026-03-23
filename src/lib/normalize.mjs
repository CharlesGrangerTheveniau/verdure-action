/**
 * Strips content hashes and query strings from an asset URL.
 * If given a full https URL, extracts the pathname first.
 *
 * Examples:
 *   bundle.a1b2c3d4.js      → bundle.js
 *   main-abc123de.js        → main.js
 *   hero.webp?v=1234        → hero.webp
 *   https://cdn.com/app.js  → app.js
 */
export function normalizeUrl(url) {
  let path = url

  // Extract pathname from full URLs
  try {
    path = new URL(url).pathname
  } catch {
    // not a full URL — use as-is
  }

  // Strip query string
  path = path.split('?')[0]

  // Strip content hashes: hex sequences of 8+ chars preceded by . or -
  // and followed by . or - or end of string.
  // Requires 8+ chars to avoid false positives on short hex-looking words (e.g. facade, decade).
  // Covers: bundle.abc123de.js, main-abc123def456.js
  path = path.replace(/[.\-][0-9a-fA-F]{8,}(?=[.\-]|$)/g, '')

  // Strip leading slash
  return path.replace(/^\//, '')
}
