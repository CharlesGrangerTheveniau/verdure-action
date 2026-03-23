// src/lib/regression.mjs

const REGRESSION_THRESHOLD_PCT = 5

/**
 * Given a diff result and optional budget inputs, returns regression and
 * budget_exceeded flags. Merges with the diff object in diff.mjs.
 *
 * @param {object} diff — output of buildDiff()
 * @param {{ carbonBudget?: number, weightBudget?: number }} budgets
 * @returns {{ regression: { carbon, weight }, budget_exceeded: { carbon, weight } }}
 */
export function detectRegression(diff, { carbonBudget, weightBudget } = {}) {
  const regression = {
    carbon: diff.carbon_delta_pct > REGRESSION_THRESHOLD_PCT,
    weight: diff.weight_delta_pct > REGRESSION_THRESHOLD_PCT
  }

  const budget_exceeded = {
    carbon: carbonBudget != null
      ? diff.carbon_after_grams > carbonBudget
      : false,
    weight: weightBudget != null
      ? Math.round(diff.weight_after_bytes / 1024) > weightBudget
      : false
  }

  return { regression, budget_exceeded }
}
