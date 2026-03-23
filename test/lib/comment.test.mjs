import { describe, it, expect } from 'vitest'
import { renderComment } from '../../src/lib/comment.mjs'

const noBaselineScan = {
  co2_swd_grams: 0.42,
  total_bytes: 450000,
  green_hosting: true,
  assets: [],
  summary: { third_party_bytes: 0, third_party_count: 0 }
}

const scanWithAssets = {
  co2_swd_grams: 1.01,
  total_bytes: 2483 * 1024,
  green_hosting: false,
  assets: [
    { normalized_url: 'vendor.js',  type: 'script', bytes: 1200 * 1024, third_party: false, url: 'https://example.com/vendor.js' },
    { normalized_url: 'hero.jpg',   type: 'image',  bytes: 450 * 1024,  third_party: false, url: 'https://example.com/hero.jpg' },
    { normalized_url: 'app.css',    type: 'style',  bytes: 80 * 1024,   third_party: false, url: 'https://example.com/app.css' },
    { normalized_url: 'analytics.js', type: 'script', bytes: 95 * 1024, third_party: true,  url: 'https://cdn.example.com/analytics.js' }
  ],
  summary: { third_party_bytes: 95 * 1024, third_party_count: 1 }
}

const baseDiff = {
  has_baseline: true,
  regression: { carbon: false, weight: false },
  budget_exceeded: { carbon: false, weight: false },
  carbon_before_grams: 0.38,
  carbon_after_grams: 0.47,
  carbon_delta_grams: 0.09,
  carbon_delta_pct: 21,
  weight_before_bytes: 450000,
  weight_after_bytes: 534000,
  weight_delta_bytes: 84000,
  weight_delta_pct: 18,
  green_hosting_before: true,
  green_hosting_after: true,
  top_changes: [],
  all_changes: []
}

describe('renderComment', () => {
  it('includes the <!-- verdure --> marker', () => {
    const comment = renderComment({ has_baseline: false }, noBaselineScan)
    expect(comment).toContain('<!-- verdure -->')
  })

  it('renders no-baseline message when has_baseline is false', () => {
    const comment = renderComment({ has_baseline: false }, noBaselineScan)
    expect(comment).toContain('No baseline yet')
    expect(comment).toContain('0.42g')
    expect(comment).toContain('439 KB') // 450000 / 1024 = 439.453125 → 439 KB
  })

  it('renders before/after table when has_baseline is true', () => {
    const comment = renderComment(baseDiff, noBaselineScan)
    expect(comment).toContain('<!-- verdure -->')
    expect(comment).toContain('0.38g')
    expect(comment).toContain('0.47g')
    expect(comment).toContain('+21%')
  })

  it('shows ⚠️ on carbon regression', () => {
    const diff = { ...baseDiff, regression: { carbon: true, weight: false } }
    const comment = renderComment(diff, noBaselineScan)
    expect(comment).toContain('⚠️')
    expect(comment).toContain('regression detected')
  })

  it('shows ✅ green hosting when true', () => {
    const comment = renderComment(baseDiff, noBaselineScan)
    expect(comment).toContain('✅ Yes')
  })

  it('shows ❌ when green_hosting_after is false', () => {
    const diff = { ...baseDiff, green_hosting_after: false }
    const comment = renderComment(diff, noBaselineScan)
    expect(comment).toContain('❌ No')
  })

  it('shows — (unknown) when green_hosting is null', () => {
    const diff = { ...baseDiff, green_hosting_after: null }
    const comment = renderComment(diff, noBaselineScan)
    expect(comment).toContain('— (unknown)')
  })

  it('renders added asset in top_changes table', () => {
    const diff = {
      ...baseDiff,
      top_changes: [{
        normalized_url: 'images/banner.webp',
        type: 'image',
        bytes_before: null,
        bytes_after: 18000,
        delta_bytes: 18000,
        delta_pct: null,
        status: 'added'
      }]
    }
    const comment = renderComment(diff, noBaselineScan)
    expect(comment).toContain('banner.webp')
    expect(comment).toContain('new')
  })

  it('shows top assets table in no-baseline comment', () => {
    const comment = renderComment({ has_baseline: false }, scanWithAssets)
    expect(comment).toContain('Top assets by weight')
    expect(comment).toContain('vendor.js')
    expect(comment).toContain('hero.jpg')
    expect(comment).toContain('1200 KB')
  })

  it('shows suggestions for legacy image format and large JS bundle', () => {
    const comment = renderComment({ has_baseline: false }, scanWithAssets)
    expect(comment).toContain('Suggestions')
    expect(comment).toContain('hero.jpg')
    expect(comment).toContain('WebP/AVIF')
    expect(comment).toContain('vendor.js')
    expect(comment).toContain('code-splitting')
  })

  it('renders removed asset with negative delta', () => {
    const diff = {
      ...baseDiff,
      top_changes: [{
        normalized_url: 'fonts/old.woff2',
        type: 'font',
        bytes_before: 24000,
        bytes_after: null,
        delta_bytes: -24000,
        delta_pct: null,
        status: 'removed'
      }]
    }
    const comment = renderComment(diff, noBaselineScan)
    expect(comment).toContain('old.woff2')
    expect(comment).toContain('removed')
  })
})
