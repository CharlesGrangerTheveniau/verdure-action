import { describe, it, expect } from 'vitest'
import { normalizeUrl } from '../../src/lib/normalize.mjs'

describe('normalizeUrl', () => {
  it('strips 8-char hex hash between dots', () => {
    expect(normalizeUrl('bundle.a1b2c3d4.js')).toBe('bundle.js')
  })

  it('strips longer hex hash between dots', () => {
    expect(normalizeUrl('main.abc123def456.js')).toBe('main.js')
  })

  it('strips hex hash after hyphen before extension', () => {
    expect(normalizeUrl('_next/chunks/main-abc123de.js')).toBe('_next/chunks/main.js')
  })

  it('strips query strings', () => {
    expect(normalizeUrl('hero.webp?v=1234')).toBe('hero.webp')
  })

  it('leaves already-clean filenames unchanged', () => {
    expect(normalizeUrl('styles.css')).toBe('styles.css')
  })

  it('extracts pathname from full https URL then normalises', () => {
    expect(normalizeUrl('https://example.com/_next/static/bundle.abc123de.js'))
      .toBe('_next/static/bundle.js')
  })

  it('strips leading slash from extracted pathname', () => {
    expect(normalizeUrl('https://example.com/app.js'))
      .toBe('app.js')
  })

  it('returns empty string for root path', () => {
    expect(normalizeUrl('https://example.com/')).toBe('')
  })
})
