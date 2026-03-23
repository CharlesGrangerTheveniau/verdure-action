# 🌿 Verdure — Carbon & Performance CI

Carbon footprint and page weight regression checks for every deploy.
Diffs each PR against your baseline. Comments results. Blocks merges if you exceed your budget.

[![Verdure](https://img.shields.io/badge/verdure-carbon%20%26%20perf-22c55e)](https://github.com/CharlesGrangerTheveniau/verdure-action)

## Quick start

```yaml
# .github/workflows/verdure.yml
name: Verdure

on:
  push:
    branches: [main]
  deployment_status:

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  verdure:
    if: github.event_name == 'push' || github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: CharlesGrangerTheveniau/verdure-action@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          # url is auto-detected from the deployment event (Vercel, Netlify, Railway)
          # set it explicitly for push-to-main or platforms that don't fire deployment_status:
          # url: https://my-site.com
```

### How the trigger works

- **`push` to main** — scans your live URL (set `url:` explicitly) and saves the result as a baseline artifact.
- **`deployment_status`** — fires when Vercel, Netlify, or Railway finishes a preview deploy. The preview URL is read from the event automatically. Verdure finds the associated PR and posts the diff comment.

If you're not on Vercel/Netlify/Railway, use the `pull_request` trigger instead and set `url:` to your preview URL.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `url` | — | auto | URL to scan. Auto-detected from `deployment_status.target_url` when not set. |
| `sitemap-url` | — | — | Sitemap URL to scan multiple routes (capped at 20). |
| `token` | ✅ | — | `GITHUB_TOKEN` — needs `pull-requests: write` and `checks: write` |
| `vercel-bypass-secret` | — | — | Vercel Protection Bypass for Automation secret. Required if Vercel Deployment Protection is enabled. |
| `carbon-budget` | — | none | Max CO₂ grams/visit (SWD model). Fails check if exceeded. |
| `weight-budget` | — | none | Max page weight in KB. Fails check if exceeded. |
| `fail-on-regression` | — | `true` | Fail check on >5% carbon or weight regression |

## Outputs

| Output | Description |
|---|---|
| `carbon-grams` | CO₂ per visit (SWD model) |
| `page-weight-kb` | Total page weight |
| `regression` | `true` / `false` / `none` (no baseline yet) |

## What the PR comment shows

Every PR gets a comment with:

- **Carbon grade** (A+ → D) based on the [SWD model thresholds](https://sustainablewebdesign.org/calculating-digital-emissions/)
- **Before/after table** — CO₂, page weight, green hosting — with delta and regression warnings
- **Top 5 assets by weight** — so you know exactly what's heavy
- **Bundle breakdown** — which npm packages are inside your largest JS bundles (read from source maps)
- **Suggestions** — deterministic rules: image format (WebP/AVIF), large JS bundles (code-splitting), third-party scripts

## How it works

**On push to main:** Verdure scans your live URL and saves the result as a GitHub artifact (the baseline).

**On deployment_status (PR previews):** Verdure scans the preview URL, looks up the associated PR, compares to the baseline, and posts a diff comment. If carbon or page weight increased more than 5%, the check fails.

**Baseline storage:** Uses GitHub Actions artifacts. No external service required.

## Vercel preview protection

If your Vercel project has **Deployment Protection** enabled, the GitHub Actions runner
can't access the preview URL — the scan returns 0 KB. Verdure detects this and posts a
warning comment instead of silently showing 0.00g.

### Fix: Protection Bypass for Automation

This requires one action on Vercel and one on GitHub — both are needed.

**Step 1 — Vercel:** Go to your project `Settings → Deployment Protection → Protection Bypass for Automation`. Enable it. Vercel generates a secret — **copy that value now** (you won't easily see it again).

**Step 2 — GitHub:** Go to your repo `Settings → Secrets and variables → Actions → New repository secret`. Name it `VERCEL_BYPASS_SECRET`, paste the value you copied from Vercel. These are separate stores — Vercel doesn't push anything to GitHub automatically.

**Step 3** — Pass it to the action:

```yaml
name: Verdure

on:
  push:
    branches: [main]
  deployment_status:

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  verdure:
    if: github.event_name == 'push' || github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: CharlesGrangerTheveniau/verdure-action@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          vercel-bypass-secret: ${{ secrets.VERCEL_BYPASS_SECRET }}
          # url is still auto-detected from the deployment event
```

Verdure will include the bypass header on every request to the preview URL. The preview is not exposed publicly — the secret authorizes only requests that include it.

## Methodology

CO₂ estimates use the [Sustainable Web Design model](https://sustainablewebdesign.org/calculating-digital-emissions/) (SWD) via [co2.js](https://github.com/thegreenwebfoundation/co2.js). Green hosting is checked via the [Green Web Foundation](https://www.thegreenwebfoundation.org/).

Estimates are proxies, not precise measurements. They are useful for **detecting regressions** (a new 2 MB image doubling your footprint), not for reporting absolute CO₂ values.

The co2.js version used is stored in each scan result — comparisons between scans using different model versions are safe to ignore.

## License

MIT
