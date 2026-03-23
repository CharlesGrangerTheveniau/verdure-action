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

/**
 * Renders the PR comment markdown from a diff result and current scan.
 * Always includes the <!-- verdure --> marker for upsert detection.
 *
 * @param {object} diff  — verdure-diff.json (or { has_baseline: false })
 * @param {object} scan  — verdure-scan.json
 * @returns {string} GitHub Markdown
 */
export function renderComment(diff, scan) {
  if (!diff.has_baseline) {
    return [
      '<!-- verdure -->',
      '## 🌿 Verdure',
      '',
      'No baseline found ℹ️ — the next push to main will save one.',
      'This PR shows current stats only — no diff available yet.',
      '',
      `CO₂ / visit: **${formatGrams(scan.co2_swd_grams)}** · ` +
      `Page weight: **${formatBytes(scan.total_bytes)}** · ` +
      `Green hosting: ${formatGreenHosting(scan.green_hosting)}`
    ].join('\n')
  }

  const hasRegression = diff.regression.carbon || diff.regression.weight
  const hasBudgetExceeded = diff.budget_exceeded.carbon || diff.budget_exceeded.weight

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
        `> ⚠️ Regression detected`,
        '> [Verdure](https://github.com/verdure-io/verdure) · SWD model · [methodology](https://sustainablewebdesign.org/calculating-digital-emissions/)'
      ].join('\n')
    : [
        '',
        '> ✅ No regression detected',
        '> [Verdure](https://github.com/verdure-io/verdure) · SWD model · [methodology](https://sustainablewebdesign.org/calculating-digital-emissions/)'
      ].join('\n')

  return [
    '<!-- verdure -->',
    '## 🌿 Verdure',
    '',
    '| | Before | After | Δ |',
    '|---|---|---|---|',
    carbonRow,
    weightRow,
    greenRow,
    changesTable,
    footer
  ].join('\n')
}
