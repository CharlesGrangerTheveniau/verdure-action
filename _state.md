---
project: verdure-action
stage: building
last_session: 2026-03-24
---

## Vision
Open-core carbon CI/CD — MIT GitHub Action (scan+diff+comment) as distribution flywheel, paid SaaS dashboard as the business.

## Current State
**Working:** `scanUrl` (HTML parse → asset HEAD fetch → CO2.js SWD + 1byte → green hosting check), `diff.mjs` (artifact baseline diff), `report.mjs` (PR comment + Check Run), `parseSitemap` (regular + index, 20-URL cap), `scanUrls` (sequential multi-page, asset dedup, avg bytes), `scanUrlPlaywright` (Playwright browser scan with full network interception, `inFlight` async pattern, `playwright:` input toggle, `scan_engine` field in output), `login.mjs` (login script loader for auth-gated pages, `login-script:` input). 84 tests passing.
**In progress:** `feat/playwright-scan-engine` branch — Playwright Phase 1 complete, not yet merged to main.
**Not started:** GitHub App migration, Marketplace listing, real-world dogfood, SaaS dashboard.

## Last Session (2026-03-24)
- Brainstormed potential action/product names — top picks: `carbon-gate` (Marketplace SEO), `canopy` (brand identity)
- Names stored in CLAUDE.md under "Potential action names" — decision deferred to GitHub App migration
- Decided: rename happens when migrating to GitHub App (not before), to avoid breaking existing installs
- Implemented Playwright scan engine Phase 1: `src/lib/playwright-scan.mjs`, `src/lib/login.mjs`, `scanUrlPlaywright()`, `playwright:` + `login-script:` inputs — all on `feat/playwright-scan-engine` branch

## Next Action
**Merge `feat/playwright-scan-engine`** then **GitHub App migration** — replace composite Action (user adds workflow YAML + passes `token:` input) with an installable GitHub App. No workflow YAML in user repo. Full plan in CLAUDE.md under "GitHub App migration plan".

GitHub App Phase 1: register the app at github.com/settings/apps/verdure with correct permissions (`pull_requests:write`, `checks:write`, `contents:read`) and webhook events (`push`, `pull_request`, `deployment_status`).

## Blockers
None — App registration is self-contained and doesn't require Supabase/Nuxt to be running.
