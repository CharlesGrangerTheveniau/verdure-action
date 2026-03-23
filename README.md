# 🌿 Verdure — Carbon & Performance CI

Carbon footprint and page weight regression checks for every deploy.
Diffs each PR against your baseline. Comments results. Blocks merges if you exceed your budget.

[![Verdure](https://img.shields.io/badge/verdure-carbon%20%26%20perf-22c55e)](https://github.com/verdure-io/verdure)

## Quick start

```yaml
# .github/workflows/verdure.yml
name: Verdure

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  verdure:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy (replace with your actual deploy step)
        run: echo "deployed"

      - uses: verdure-io/verdure@v1
        with:
          url: ${{ env.DEPLOY_URL }}   # or your live URL on push
          token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `url` | ✅ | — | URL to scan |
| `token` | ✅ | — | `GITHUB_TOKEN` |
| `carbon-budget` | — | none | Max CO₂ in grams/visit. Fails if exceeded. |
| `weight-budget` | — | none | Max page weight in KB. Fails if exceeded. |
| `fail-on-regression` | — | `true` | Fail check on >5% regression |

## Outputs

| Output | Description |
|---|---|
| `carbon-grams` | CO₂ per visit (SWD model) |
| `page-weight-kb` | Total page weight |
| `regression` | `true` / `false` / `none` |

## How it works

**On push to main:** Verdure scans your live URL and saves the result as a GitHub artifact (the baseline).

**On pull request:** Verdure scans your preview URL, compares to the baseline, and posts a diff comment on the PR. If carbon or page weight increased more than 5%, the check fails.

## Methodology

CO₂ estimates use the [Sustainable Web Design model](https://sustainablewebdesign.org/calculating-digital-emissions/) (SWD) via [co2.js](https://github.com/thegreenwebfoundation/co2.js). Green hosting is checked via the [Green Web Foundation](https://www.thegreenwebfoundation.org/).

Estimates are proxies, not precise measurements. They are useful for **detecting regressions** (a new 2MB image doubling your footprint), not for reporting absolute CO₂ values.

## Accessibility (v0.2)

A11y checks via axe-core + Playwright are planned for v0.2. [Subscribe to updates →](https://github.com/verdure-io/verdure/issues)

## License

MIT
