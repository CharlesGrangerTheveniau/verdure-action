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

  // Strip content hashes: hex sequences of 6+ chars preceded by . or -
  // and followed by . or end of string
  // Covers: bundle.abc123de.js, main-abc123de.js
  path = path.replace(/[.\-][0-9a-fA-F]{6,}(?=[.\-]|$)/g, '')

  // Strip leading slash
  return path.replace(/^\//, '')
}
