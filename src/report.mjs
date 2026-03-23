// src/report.mjs
import { readFileSync } from 'fs'
import github from '@actions/github'
import { renderComment } from './lib/comment.mjs'

/**
 * Determine Check Run conclusion from diff + fail-on-regression flag.
 */
function getConclusion(diff, failOnRegression) {
  if (!diff.has_baseline) return 'neutral'
  const hasRegression = diff.regression?.carbon || diff.regression?.weight
  const hasBudgetExceeded = diff.budget_exceeded?.carbon || diff.budget_exceeded?.weight
  if (hasBudgetExceeded) return 'failure'
  if (hasRegression && failOnRegression) return 'failure'
  return 'success'
}

export async function runReport() {
  const token = process.env.VERDURE_TOKEN
  const failOnRegression = process.env.VERDURE_FAIL_ON_REGRESSION !== 'false'

  const octokit = github.getOctokit(token)
  const { owner, repo } = github.context.repo
  const pr = github.context.payload.pull_request
  const prNumber = pr?.number
  const headSha = pr?.head?.sha

  // Skip comment + check if not a PR context (before reading files)
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
  const conclusion = getConclusion(diff, failOnRegression)
  const hasRegression = diff.regression?.carbon || diff.regression?.weight
  const title = !diff.has_baseline
    ? 'No baseline — first scan complete'
    : hasRegression
    ? `Regression detected — CO₂ ${diff.carbon_delta_pct > 0 ? '+' : ''}${diff.carbon_delta_pct}%, weight ${diff.weight_delta_pct > 0 ? '+' : ''}${diff.weight_delta_pct}%`
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

// Entry point
if (!process.env.VITEST) {
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    await runReport()
  } else {
    console.log('ℹ️  Not a PR — skipping report.')
  }
}
