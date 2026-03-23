/**
 * Builds a structured diff from two verdure-scan.json objects.
 * Assets are matched by normalized_url.
 * Does NOT compute regression flags — that is regression.mjs's job.
 */
export function buildDiff(baseline, current) {
  const baseMap = new Map(baseline.assets.map(a => [a.normalized_url, a]))
  const currMap = new Map(current.assets.map(a => [a.normalized_url, a]))

  const changes = []

  // Added and changed
  for (const [key, curr] of currMap) {
    const base = baseMap.get(key)
    if (!base) {
      changes.push({
        normalized_url: key,
        type: curr.type,
        bytes_before: null,
        bytes_after: curr.bytes,
        delta_bytes: curr.bytes,
        delta_pct: null,
        status: 'added'
      })
    } else if (base.bytes !== curr.bytes) {
      const delta_bytes = curr.bytes - base.bytes
      const delta_pct = Math.round((delta_bytes / base.bytes) * 100)
      changes.push({
        normalized_url: key,
        type: curr.type,
        bytes_before: base.bytes,
        bytes_after: curr.bytes,
        delta_bytes,
        delta_pct,
        status: 'changed'
      })
    }
  }

  // Removed
  for (const [key, base] of baseMap) {
    if (!currMap.has(key)) {
      changes.push({
        normalized_url: key,
        type: base.type,
        bytes_before: base.bytes,
        bytes_after: null,
        delta_bytes: -base.bytes,
        delta_pct: null,
        status: 'removed'
      })
    }
  }

  // Sort by absolute delta descending
  changes.sort((a, b) => Math.abs(b.delta_bytes) - Math.abs(a.delta_bytes))

  const carbon_delta_grams = parseFloat(
    (current.co2_swd_grams - baseline.co2_swd_grams).toFixed(4)
  )
  const carbon_delta_pct = Math.round(
    ((current.co2_swd_grams - baseline.co2_swd_grams) / baseline.co2_swd_grams) * 100
  )
  const weight_delta_bytes = current.total_bytes - baseline.total_bytes
  const weight_delta_pct = Math.round(
    ((current.total_bytes - baseline.total_bytes) / baseline.total_bytes) * 100
  )

  return {
    has_baseline: true,
    // regression and budget_exceeded are set by regression.mjs after this
    regression: { carbon: false, weight: false },
    budget_exceeded: { carbon: false, weight: false },
    carbon_before_grams: baseline.co2_swd_grams,
    carbon_after_grams: current.co2_swd_grams,
    carbon_delta_grams,
    carbon_delta_pct,
    weight_before_bytes: baseline.total_bytes,
    weight_after_bytes: current.total_bytes,
    weight_delta_bytes,
    weight_delta_pct,
    green_hosting_before: baseline.green_hosting,
    green_hosting_after: current.green_hosting,
    top_changes: changes.slice(0, 5),
    all_changes: changes
  }
}
