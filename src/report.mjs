// src/report.mjs
import { readFileSync } from 'fs'
import github from '@actions/github'
import core from '@actions/core'
import { renderComment } from './lib/comment.mjs'

/**
 * Determine Check Run conclusion from diff + fail-on-regression flag.
 */
function getConclusion(diff, failOnRegression, scan) {
  if (!scan?.total_bytes) return 'neutral'
  if (!diff.has_baseline) return 'neutral'
  const hasRegression = diff.regression?.carbon || diff.regression?.weight
  const hasBudgetExceeded = diff.budget_exceeded?.carbon || diff.budget_exceeded?.weight
  if (hasBudgetExceeded) return 'failure'
  if (hasRegression && failOnRegression) return 'failure'
  return 'success'
}

export async function runReport() {
  const token = process.env.VERDURE_TOKEN
  if (!token) {
    core.setFailed('VERDURE_TOKEN is required. Add `token: ${{ secrets.GITHUB_TOKEN }}` to your workflow.')
    return
  }
  const failOnRegression = process.env.VERDURE_FAIL_ON_REGRESSION !== 'false'

  const octokit = github.getOctokit(token)
  const { owner, repo } = github.context.repo

  // VERDURE_PR_NUMBER / VERDURE_HEAD_SHA are set by detect-mode.mjs and work
  // across pull_request, deployment_status, and push events.
  const prNumber = process.env.VERDURE_PR_NUMBER
    ? parseInt(process.env.VERDURE_PR_NUMBER, 10)
    : github.context.payload.pull_request?.number
  const headSha = process.env.VERDURE_HEAD_SHA
    || github.context.payload.pull_request?.head?.sha

  if (!prNumber || !headSha) {
    console.log('ℹ️  No PR context — skipping comment and check run.')
    return
  }

  const diff = JSON.parse(readFileSync('verdure-diff.json', 'utf8'))
  const scan = JSON.parse(readFileSync('verdure-scan.json', 'utf8'))

  // Build the comment body
  const body = renderComment(diff, scan)

  // Upsert PR comment
  const { data: comments } = await octokit.rest.issues.listComments({
    owner, repo, issue_number: prNumber
  })
  const existing = comments.find(c => c.body?.includes('<!-- verdure -->'))

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner, repo, comment_id: existing.id, body
    })
    console.log('✅ Updated existing Verdure comment')
  } else {
    await octokit.rest.issues.createComment({
      owner, repo, issue_number: prNumber, body
    })
    console.log('✅ Posted new Verdure comment')
  }

  // Create Check Run
  const conclusion = getConclusion(diff, failOnRegression, scan)
  const hasRegression = diff.regression?.carbon || diff.regression?.weight
  const fmtPct = (v) => v != null ? `${v > 0 ? '+' : ''}${v}%` : '(unknown)'
  const title = !scan?.total_bytes
    ? 'Scan returned 0 KB — check URL accessibility'
    : !diff.has_baseline
    ? 'No baseline — first scan complete'
    : hasRegression
    ? `Regression detected — CO₂ ${fmtPct(diff.carbon_delta_pct)}, weight ${fmtPct(diff.weight_delta_pct)}`
    : `No regression — ${diff.carbon_after_grams?.toFixed(3)}g CO₂, ${Math.round((diff.weight_after_bytes ?? scan.total_bytes) / 1024)} KB`

  await octokit.rest.checks.create({
    owner, repo,
    name: 'Verdure — Carbon & Performance',
    head_sha: headSha,
    status: 'completed',
    conclusion,
    output: { title, summary: body }
  })

  console.log(`✅ Check run created: ${conclusion}`)
}

// Entry point — runs whenever there is a PR context (set by detect-mode.mjs)
if (!process.env.VITEST) {
  const hasPrContext = process.env.VERDURE_PR_NUMBER
    || process.env.GITHUB_EVENT_NAME === 'pull_request'
  if (hasPrContext) {
    await runReport()
  } else {
    console.log('ℹ️  No PR context — skipping report.')
  }
}
