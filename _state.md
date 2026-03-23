---
project: verdure-action
stage: building
last_session: 2026-03-23
---

## Vision
Open-core carbon CI/CD — MIT GitHub Action (scan+diff+comment) as distribution flywheel, paid SaaS dashboard as the business.

## Current State
**Working:** `scanUrl` (HTML parse → asset HEAD fetch → CO2.js SWD + 1byte → green hosting check), `diff.mjs` (artifact baseline diff), `report.mjs` (PR comment + Check Run), `parseSitemap` (regular + index, 20-URL cap), `scanUrls` (sequential multi-page, asset dedup, avg bytes). 54 tests passing.
**In progress:** Nothing — session closed cleanly.
**Not started:** GitHub Marketplace listing, real-world dogfood, SaaS dashboard.

## Last Session (2026-03-23)
- Implemented `sitemap-url` input — users can now point at a sitemap.xml to scan every route
- `parseSitemap` handles both regular `<urlset>` and `<sitemapindex>` (one level deep), capped at 20 URLs, non-fatal
- `scanUrls` runs pages sequentially, deduplicates assets by `normalized_url` (max bytes wins), averages per-page bytes for carbon semantics
- Added `pages_scanned` and `scanned_urls` to output shape (backward compatible); 9 new tests added

## Next Action

**Immediate (this week)**
1. **Run it on a real project** — wire into an existing repo's `.github/workflows/` against a live URL (charles-portfolio or finance-brain). Surfaces real-world issues (CORS, scan failures, PR comment formatting) that unit tests can't catch.
2. **Rename repo** — `CharlesGrangerTheveniau/verdure` → `CharlesGrangerTheveniau/verdure-action` before anyone links to it. (Or transfer to `verdure-io` org later.)

**Short-term (get it usable)**
3. **Publish to GitHub Marketplace** — Repo → Releases → "Publish to Marketplace". Needs unique action name + category. Gives discoverability + badge.
4. **Write `CHANGELOG.md`** — required for Marketplace submission.
5. **Add integration test workflow** — `.github/workflows/test.yml` in the verdure repo itself, runs the action against a known URL on every push to main.

**Longer-term (get it adopted)**
6. **Find 2-3 beta users** — post in Indie Hackers, a sustainability Slack, or DM directly.
7. **`verdure-io` GitHub org** — when ready to present as a product rather than a personal project.

## Blockers
None — action is feature-complete enough to start step 1.
