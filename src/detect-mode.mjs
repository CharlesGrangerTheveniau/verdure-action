// src/detect-mode.mjs
// Resolves the current event into a normalised mode used by the rest of the action:
//   is_pr      — 'true' | 'false'
//   is_baseline — 'true' | 'false'  (should this run save a baseline?)
//   pr_number  — PR number string, or '' if not a PR
//   head_sha   — commit SHA to attach the Check Run to
//
// Supports: pull_request, deployment_status, push

import github from '@actions/github'
import core from '@actions/core'

const eventName = process.env.GITHUB_EVENT_NAME ?? ''

if (eventName === 'pull_request') {
  const pr = github.context.payload.pull_request
  core.setOutput('is_pr',       'true')
  core.setOutput('is_baseline', 'false')
  core.setOutput('pr_number',   String(pr.number))
  core.setOutput('head_sha',    pr.head.sha)
  console.log(`ℹ️  pull_request — PR #${pr.number}`)

} else if (eventName === 'deployment_status') {
  const deployment = github.context.payload.deployment
  const sha        = deployment.sha
  const token      = process.env.VERDURE_TOKEN

  if (!token) {
    core.setFailed('token input is required for deployment_status events')
    process.exit(1)
  }

  const octokit        = github.getOctokit(token)
  const { owner, repo } = github.context.repo
  const { data: prs }  = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
    owner, repo, commit_sha: sha
  })
  const openPr = prs.find(p => p.state === 'open')

  if (openPr) {
    core.setOutput('is_pr',       'true')
    core.setOutput('is_baseline', 'false')
    core.setOutput('pr_number',   String(openPr.number))
    core.setOutput('head_sha',    sha)
    console.log(`ℹ️  deployment_status → PR #${openPr.number}`)
  } else {
    // Production or branch deploy with no open PR — save as new baseline
    core.setOutput('is_pr',       'false')
    core.setOutput('is_baseline', 'true')
    core.setOutput('pr_number',   '')
    core.setOutput('head_sha',    sha)
    console.log(`ℹ️  deployment_status → no open PR, baseline mode`)
  }

} else if (eventName === 'push') {
  const ref    = process.env.GITHUB_REF ?? ''
  const isMain = ref === 'refs/heads/main' || ref === 'refs/heads/master'
  core.setOutput('is_pr',       'false')
  core.setOutput('is_baseline', isMain ? 'true' : 'false')
  core.setOutput('pr_number',   '')
  core.setOutput('head_sha',    process.env.GITHUB_SHA ?? '')
  console.log(`ℹ️  push — ${isMain ? 'main branch → baseline mode' : 'feature branch → scan only'}`)

} else {
  // Unknown event — scan only, no diff, no comment
  core.setOutput('is_pr',       'false')
  core.setOutput('is_baseline', 'false')
  core.setOutput('pr_number',   '')
  core.setOutput('head_sha',    process.env.GITHUB_SHA ?? '')
  console.log(`ℹ️  ${eventName} — unknown event, scan only`)
}
