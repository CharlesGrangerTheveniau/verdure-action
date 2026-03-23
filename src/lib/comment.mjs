import { buildSuggestions } from './suggestions.mjs'

const isScanEmpty = (scan) => !scan?.total_bytes
const isVercelUrl = (url) => typeof url === 'string' && url.includes('.vercel.app')

const getGrade = (grams) => {
  if (grams < 0.095) return { label: 'A+', dot: '🟢' }
  if (grams < 0.19)  return { label: 'A',  dot: '🟢' }
  if (grams < 0.28)  return { label: 'B',  dot: '🟡' }
  if (grams < 0.50)  return { label: 'C',  dot: '🟠' }
  return                        { label: 'D',  dot: '🔴' }
}

const formatBytes = (bytes) => {
  if (bytes == null) return '—'
  const kb = Math.round(bytes / 1024)
  return `${kb} KB`
}

const formatGrams = (g) => {
  if (g == null) return '—'
  return `${g.toFixed(2)}g`
}

const formatGreenHosting = (val) => {
  if (val === true) return '✅ Yes'
  if (val === false) return '❌ No'
  return '— (unknown)'
}

const formatDelta = (pct, bytes) => {
  if (pct == null) return bytes > 0 ? `+${formatBytes(bytes)}` : formatBytes(Math.abs(bytes))
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct}%`
}

const renderTopAssets = (assets = []) => {
  const top = [...assets].sort((a, b) => b.bytes - a.bytes).slice(0, 5)
  if (top.length === 0) return ''
  return [
    '',
    '**Top assets by weight**',
    '| Asset | Type | Size |',
    '|---|---|---|',
    ...top.map(a => {
      const name = a.normalized_url.split('/').pop()
      return `| \`${name}\` | ${a.type} | ${formatBytes(a.bytes)} |`
    })
  ].join('\n')
}

const renderSuggestions = (scan) => {
  const items = buildSuggestions(scan)
  if (items.length === 0) return ''
  return [
    '',
    '**Suggestions**',
    ...items.map(s => `- ${s}`)
  ].join('\n')
}

const renderBundleBreakdown = (assets = []) => {
  const bundles = assets
    .filter(a => a.type === 'script' && a.packages?.length > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 2)

  if (bundles.length === 0) return ''

  return bundles.map(asset => {
    const name = asset.normalized_url.split('/').pop()
    const deps = asset.packages.filter(p => p.package !== '__app__')
    const app  = asset.packages.find(p => p.package === '__app__')
    const rows = [
      ...deps.map(p => `| \`${p.package}\` | ${formatBytes(p.bytes)} | ${p.pct}% |`),
      ...(app ? [`| app code | ${formatBytes(app.bytes)} | ${app.pct}% |`] : [])
    ]
    return [
      '',
      `**Bundle breakdown** — \`${name}\` (${formatBytes(asset.bytes)})`,
      '| Package | Approx. size | Share |',
      '|---|---|---|',
      ...rows,
      '<sub>Sizes are approximate — based on unminified source proportions</sub>'
    ].join('\n')
  }).join('\n')
}

/**
 * Renders the PR comment markdown from a diff result and current scan.
 * Always includes the <!-- verdure --> marker for upsert detection.
 *
 * @param {object} diff  — verdure-diff.json (or { has_baseline: false })
 * @param {object} scan  — verdure-scan.json
 * @returns {string} GitHub Markdown
 */
export function renderComment(diff, scan) {
  if (isScanEmpty(scan)) {
    const vercel = isVercelUrl(scan?.url)
    const warning = vercel
      ? 'Scan returned 0 KB — your Vercel preview is likely protected by Vercel Authentication.\n> Enable **Protection Bypass for Automation** in your Vercel project settings, or disable preview protection.'
      : 'Scan returned 0 KB — the URL may require authentication or returned an empty response.'
    return [
      '<!-- verdure -->',
      '## 🌿 Verdure — ⚠️ Scan failed',
      '',
      '> [!WARNING]',
      `> ${warning}`,
      '',
      `Scanned: \`${scan?.url ?? 'unknown'}\``,
      '',
      '<sub>[Verdure](https://github.com/CharlesGrangerTheveniau/verdure-action)</sub>'
    ].join('\n')
  }

  if (!diff.has_baseline) {
    const grade = getGrade(scan.co2_swd_grams)
    return [
      '<!-- verdure -->',
      `## 🌿 Verdure — ${grade.dot} Grade **${grade.label}**`,
      '',
      '> [!NOTE]',
      '> No baseline yet — the next push to `main` will save one. Showing current stats only.',
      '',
      '| Metric | Value |',
      '|---|---|',
      `| 🌍 CO₂ / visit | **${formatGrams(scan.co2_swd_grams)}** |`,
      `| ⚖️ Page weight | **${formatBytes(scan.total_bytes)}** |`,
      `| 🌱 Green hosting | ${formatGreenHosting(scan.green_hosting)} |`,
      renderTopAssets(scan.assets),
      renderBundleBreakdown(scan.assets),
      renderSuggestions(scan),
      '',
      `<sub>[Verdure](https://github.com/CharlesGrangerTheveniau/verdure-action) · SWD model · [methodology](https://sustainablewebdesign.org/calculating-digital-emissions/)</sub>`
    ].join('\n')
  }

  const hasRegression = diff.regression.carbon || diff.regression.weight
  const hasBudgetExceeded = diff.budget_exceeded.carbon || diff.budget_exceeded.weight
  const grade = getGrade(diff.carbon_after_grams)

  const carbonRow = [
    '| 🌍 CO₂ / visit',
    `${formatGrams(diff.carbon_before_grams)}`,
    `${formatGrams(diff.carbon_after_grams)}`,
    diff.regression.carbon
      ? `**${formatDelta(diff.carbon_delta_pct)} ⚠️**`
      : formatDelta(diff.carbon_delta_pct)
  ].join(' | ') + ' |'

  const weightRow = [
    '| ⚖️ Page weight',
    formatBytes(diff.weight_before_bytes),
    formatBytes(diff.weight_after_bytes),
    diff.regression.weight
      ? `**${formatDelta(diff.weight_delta_pct)} ⚠️**`
      : formatDelta(diff.weight_delta_pct)
  ].join(' | ') + ' |'

  const greenRow = `| 🟢 Green hosting | ${formatGreenHosting(diff.green_hosting_before)} | ${formatGreenHosting(diff.green_hosting_after)} | — |`

  const changesTable = diff.top_changes.length > 0
    ? [
        '',
        '**Biggest changes**',
        '| Asset | Before | After | Δ |',
        '|---|---|---|---|',
        ...diff.top_changes.map(c => {
          const name = c.normalized_url.split('/').pop()
          const before = c.bytes_before != null ? formatBytes(c.bytes_before) : '—'
          const after = c.bytes_after != null ? formatBytes(c.bytes_after) : '—'
          const delta = c.status === 'added' ? 'new'
            : c.status === 'removed' ? `removed −${formatBytes(Math.abs(c.delta_bytes))}`
            : `${c.delta_bytes > 0 ? '+' : ''}${formatBytes(Math.abs(c.delta_bytes))} (${c.delta_bytes > 0 ? '+' : ''}${c.delta_pct}%)`
          return `| \`${name}\` | ${before} | ${after} | ${delta} |`
        })
      ].join('\n')
    : ''

  const footer = hasRegression || hasBudgetExceeded
    ? [
        '',
        '> [!WARNING]',
        '> Carbon or weight regression detected — this PR increases your site\'s footprint.',
        '',
        `<sub>[Verdure](https://github.com/CharlesGrangerTheveniau/verdure-action) · SWD model · [methodology](https://sustainablewebdesign.org/calculating-digital-emissions/)</sub>`
      ].join('\n')
    : [
        '',
        `<sub>✅ No regression · [Verdure](https://github.com/CharlesGrangerTheveniau/verdure-action) · SWD model · [methodology](https://sustainablewebdesign.org/calculating-digital-emissions/)</sub>`
      ].join('\n')

  return [
    '<!-- verdure -->',
    `## 🌿 Verdure — ${grade.dot} Grade **${grade.label}**`,
    '',
    '| | Before | After | Δ |',
    '|---|---|---|---|',
    carbonRow,
    weightRow,
    greenRow,
    changesTable,
    renderTopAssets(scan.assets),
    renderBundleBreakdown(scan.assets),
    renderSuggestions(scan),
    footer
  ].join('\n')
}
