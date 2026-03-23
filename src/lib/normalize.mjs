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

  // Strip hex content hashes: 8+ hex chars preceded by . or -
  // Covers webpack/CRA: bundle.abc123de.js, main-abc123def456.js
  // Requires 8+ chars to avoid false positives (e.g. facade, decade).
  path = path.replace(/[.\-][0-9a-fA-F]{8,}(?=[.\-]|$)/g, '')

  // Strip Vite-style base64 hashes: exactly 8 alphanumeric chars preceded by -
  // Vite hashes like -DWSxftZm contain uppercase letters; real words (vendors, runtime) don't.
  // Condition: requires at least one uppercase letter to avoid stripping word-like segments.
  path = path.replace(/-([a-zA-Z0-9]{8})(?=\.[a-zA-Z0-9])/g, (match, hash) =>
    /[A-Z]/.test(hash) ? '' : match
  )

  // Strip leading slash
  return path.replace(/^\//, '')
}
