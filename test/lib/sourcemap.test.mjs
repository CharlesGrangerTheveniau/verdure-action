import { describe, it, expect } from 'vitest'
import { extractPackage, analyzeSourceMap } from '../../src/lib/sourcemap.mjs'

describe('extractPackage', () => {
  it('extracts unscoped package name from node_modules path', () => {
    expect(extractPackage('node_modules/react/index.js')).toBe('react')
  })

  it('extracts scoped package name from node_modules path', () => {
    expect(extractPackage('node_modules/@mui/material/Button.js')).toBe('@mui/material')
  })

  it('handles Windows-style backslash paths', () => {
    expect(extractPackage('node_modules\\lodash\\chunk.js')).toBe('lodash')
  })

  it('returns __app__ for first-party source files', () => {
    expect(extractPackage('src/App.jsx')).toBe('__app__')
    expect(extractPackage('./src/components/Button.tsx')).toBe('__app__')
  })

  it('returns null for webpack runtime internals', () => {
    expect(extractPackage('webpack/runtime/chunk_loaded')).toBeNull()
  })

  it('returns null for rollup virtual modules', () => {
    expect(extractPackage('\x00commonjsHelpers.js')).toBeNull()
  })

  it('returns null for vite internals', () => {
    expect(extractPackage('vite/preload-helper')).toBeNull()
  })
})

describe('analyzeSourceMap', () => {
  const makeMap = (sources, sourcesContent) => ({ sources, sourcesContent })

  it('groups sources by package and scales to asset bytes', () => {
    const map = makeMap(
      ['node_modules/react/index.js', 'node_modules/react-dom/client.js', 'src/App.jsx'],
      ['x'.repeat(1000), 'x'.repeat(3000), 'x'.repeat(1000)]
    )
    const result = analyzeSourceMap(map, 100000)
    expect(result[0].package).toBe('react-dom')
    expect(result[0].pct).toBe(60)
    expect(result[1].package).toBe('react')
  })

  it('returns null when sources array is empty', () => {
    expect(analyzeSourceMap({ sources: [] }, 100000)).toBeNull()
  })

  it('drops contributors under 1%', () => {
    const sources = Array.from({ length: 200 }, (_, i) =>
      i === 0 ? 'node_modules/big-lib/index.js' : `node_modules/tiny-${i}/index.js`
    )
    const sourcesContent = sources.map((_, i) => 'x'.repeat(i === 0 ? 10000 : 1))
    const result = analyzeSourceMap({ sources, sourcesContent }, 1000000)
    expect(result.find(p => p.package === 'big-lib')).toBeDefined()
    // tiny packages with <1% share should be filtered out
    result.forEach(p => expect(p.pct).toBeGreaterThanOrEqual(1))
  })

  it('falls back to weight 1 when sourcesContent is absent', () => {
    const map = { sources: ['node_modules/a/index.js', 'node_modules/b/index.js'] }
    const result = analyzeSourceMap(map, 100000)
    expect(result).not.toBeNull()
    expect(result[0].pct).toBe(50)
  })
})
