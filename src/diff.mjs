// src/diff.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs'
import core from '@actions/core'
import { buildDiff } from './lib/diff-engine.mjs'
import { detectRegression } from './lib/regression.mjs'

/**
 * Baseline mode: upload is handled by the actions/upload-artifact@v4 step in action.yml.
 */
export async function runBaseline() {
  console.log('ℹ️  Baseline upload handled by workflow step.')
}

/**
 * Diff mode: read baseline downloaded by actions/download-artifact@v4, compute diff.
 */
export async function runDiff({ carbonBudget, weightBudget }) {
  const baselinePath = './.verdure-baseline/verdure-scan.json'

  if (!existsSync(baselinePath)) {
    console.log('ℹ️  No baseline found — this is likely the first run.')
    writeFileSync('verdure-diff.json', JSON.stringify({ has_baseline: false }))
    core.setOutput('regression', 'none')
    return
  }

  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  const current = JSON.parse(readFileSync('./verdure-scan.json', 'utf8'))

  const rawDiff = buildDiff(baseline, current)
  const flags = detectRegression(rawDiff, { carbonBudget, weightBudget })
  const diff = { ...rawDiff, ...flags }

  writeFileSync('verdure-diff.json', JSON.stringify(diff, null, 2))

  const hasRegression = diff.regression.carbon || diff.regression.weight
  const hasBudget = diff.budget_exceeded.carbon || diff.budget_exceeded.weight
  core.setOutput('regression', (hasRegression || hasBudget) ? 'true' : 'false')

  console.log(`✅ Diff complete — regression: ${hasRegression}, budget exceeded: ${hasBudget}`)
}

// Entry point when run as a script (skipped during Vitest runs)
if (!process.env.VITEST) {
  // VERDURE_IS_PR is set by detect-mode.mjs in action.yml.
  // Fall back to GITHUB_EVENT_NAME for backwards compatibility.
  const isPR = process.env.VERDURE_IS_PR === 'true'
    || (process.env.VERDURE_IS_PR === undefined && process.env.GITHUB_EVENT_NAME === 'pull_request')

  if (isPR) {
    const carbonBudget = process.env.VERDURE_CARBON_BUDGET
      ? parseFloat(process.env.VERDURE_CARBON_BUDGET)
      : null
    const weightBudget = process.env.VERDURE_WEIGHT_BUDGET
      ? parseInt(process.env.VERDURE_WEIGHT_BUDGET, 10)
      : null
    await runDiff({ carbonBudget, weightBudget })
  } else {
    // Baseline mode or scan-only — upload is handled by action.yml step.
    await runBaseline()
  }
}
