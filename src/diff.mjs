// src/diff.mjs
import { readFileSync, writeFileSync } from 'fs'
import { DefaultArtifactClient } from '@actions/artifact'
import github from '@actions/github'
import core from '@actions/core'
import { buildDiff } from './lib/diff-engine.mjs'
import { detectRegression } from './lib/regression.mjs'

/**
 * Baseline mode: upload verdure-scan.json as the reference artifact.
 */
export async function runBaseline() {
  const client = new DefaultArtifactClient()
  await client.uploadArtifact('verdure-baseline', ['verdure-scan.json'], '.', {
    retentionDays: 90
  })
  console.log('✅ Baseline uploaded as artifact "verdure-baseline"')
}

/**
 * Diff mode: download latest baseline artifact, compute diff, write verdure-diff.json.
 */
export async function runDiff({ carbonBudget, weightBudget }) {
  const token = process.env.VERDURE_TOKEN
  const octokit = github.getOctokit(token)
  const { owner, repo } = github.context.repo

  // Derive the default branch from GITHUB_BASE_REF (set on PR events)
  // or fall back to deriving it from GITHUB_REF (push events)
  const ref = process.env.GITHUB_REF ?? ''
  const defaultBranch = process.env.GITHUB_BASE_REF
    ?? (ref === 'refs/heads/master' ? 'master' : 'main')

  // Find the latest non-expired baseline artifact from the default branch
  const { data } = await octokit.rest.actions.listArtifactsForRepo({
    owner, repo, name: 'verdure-baseline', per_page: 10
  })
  const latest = data.artifacts
    .filter(a => !a.expired && a.workflow_run?.head_branch === defaultBranch)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

  if (!latest) {
    console.log('ℹ️  No baseline artifact found — this is likely the first run.')
    writeFileSync('verdure-diff.json', JSON.stringify({ has_baseline: false }))
    core.setOutput('regression', 'none')
    return
  }

  // Download the baseline artifact
  const client = new DefaultArtifactClient()
  await client.downloadArtifact(latest.id, { path: './.verdure-baseline' })

  const baseline = JSON.parse(readFileSync('./.verdure-baseline/verdure-scan.json', 'utf8'))
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
  const eventName = process.env.GITHUB_EVENT_NAME ?? ''
  const ref = process.env.GITHUB_REF ?? ''

  const isMain = ref === 'refs/heads/main' || ref === 'refs/heads/master'
  const isPush = eventName === 'push'
  const isPR = eventName === 'pull_request'

  if (isPush && isMain) {
    await runBaseline()
  } else if (isPR) {
    const carbonBudget = process.env.VERDURE_CARBON_BUDGET
      ? parseFloat(process.env.VERDURE_CARBON_BUDGET)
      : null
    const weightBudget = process.env.VERDURE_WEIGHT_BUDGET
      ? parseInt(process.env.VERDURE_WEIGHT_BUDGET, 10)
      : null
    await runDiff({ carbonBudget, weightBudget })
  } else {
    // Feature branch push — scan only mode. diff.mjs does nothing.
    console.log('ℹ️  Not a PR or main push — skipping diff.')
    writeFileSync('verdure-diff.json', JSON.stringify({ has_baseline: false }))
    core.setOutput('regression', 'none')
  }
}
