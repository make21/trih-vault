# Codex Session Notes — Instructions
1. At the start of a new session, say “read codex-notes.md” and I’ll load and summarize it before proceeding.
2. When you say “wrapping up,” I’ll summarize the session, append the notes under “Recent Changes,” update “Next Steps,” and save the file automatically.

---

## Session Prep
- Read `docs/SYSTEM_OVERVIEW.md` at session start to refresh the architecture and data flow.
- Skim the PRDs — `docs/PRD-Pipeline.md` and `docs/PRD-UI.md` — so work stays aligned with current requirements; dive deeper into whichever matches the day’s focus.
- Before curating entities, review `docs/entity-curation-playbook.md` for the latest naming rules and approval workflow so decisions stay consistent across sessions.
- When running the pipeline locally, load secrets first: `source .env.local && npm run dev:pipeline` so `OPENAI_API_KEY` and related env vars are available.

### Avoiding CI Artefact Conflicts
- Begin every working block with `git fetch origin && git rebase origin/main` so the local pipeline builds on the latest GitHub Actions artefacts and RSS snapshots.
- After curating a batch and regenerating JSON, commit and push immediately; CI rewrites the same files nightly, so delaying pushes guarantees rebases.
- When possible, separate code/schema updates from artefact/registry commits—if CI lands in between, you can rebase the code-only commit and re-run the pipeline for fresh outputs instead of hand-merging huge JSON blobs.
- If a rebase does pull newer artefacts, just rerun the pipeline (deterministic output) before pushing to avoid churn in `public/*.json` and `data/*programmatic.json`.

## Project Overview
- **Repository:** trih-browser
- **Purpose:** Next.js + TypeScript project for The Rest Is History podcast data pipeline. Ingests RSS feed, performs deterministic enrichments (programmatic + LLM), and publishes JSON artefacts validated against schemas. Supports local runs and scheduled GitHub Actions publishes (Vercel serves static JSON).
- **Key Modules:** `src/pipeline/*` (fetcher, enricher, grouper, composer, validator, llmEnricher), `src/run-local-pipeline.ts` (orchestrator), `scripts/migrate-legacy-caches.mjs`.
- **Reference:** Product requirements live in `docs/PRD-Pipeline.md`.

## Current Focus
- Structured entity rollout for people/places/topics, validating LLM outputs against the canonical registries and backfilling early/mid/late episode batches.

## Next Steps
- Re-run the composer with cached data (`OPENAI_API_KEY=dummy npm run dev:pipeline -- --max-llm-calls 0`) whenever registries change so artefacts pick up the latest canonical refs without new LLM calls.
- Continue curating pending entities as new proposals arrive: scan `data/errors.jsonl`, update `data/rules/{people,places,topics}.json`, and log each decision in `data/pending/reviews.jsonl`.
- Default to existing umbrella topics when triaging `/review`; only mint a new topic when multiple episodes or series will share it.
- Use the local review console (`npm run dev` → `http://localhost:3000/review`) to accept/map/reject proposals instead of editing JSON by hand; it writes straight to the registries and review log.
- Backlog status: `/review` is clear after the 2025-11-11 batches. Just monitor for new entries (nightly pipeline reruns) and map them immediately so the queue stays empty.
- Use the playbook (`docs/entity-curation-playbook.md`) as the blueprint for accept/map/reject decisions so new LLM proposals stay deterministic.
- Plan the next enrichment batch (mid/late catalogue) once the current proposals are cleared, using `--force-llm` to target the chosen episode IDs and cap spend with `--max-llm-calls`.
- Keep auditing registries for cross-entity collisions; reconcile duplicates early so the validator guardrail doesn’t block future pipeline runs.
- Monitor the scheduled GitHub Actions publish + Vercel revalidation webhook to ensure nightly artefact pushes stay in sync with local work.

## Canon backfill command
```bash
source .env.local && npm run dev:pipeline -- \
  --force-llm 24104338-377e-42eb-afb7-e3184d74af40,d7b04e6f-4dc6-4b27-aa9e-aa69b44d2cf9,8583b546-9a5d-4d2c-82bb-5251b5cd1808,19f9fd6c-418e-4d54-935d-ae0fe7e797b6,9c12bcb9-a366-4c17-8511-64833851e0da,153dbff0-3c58-11ee-89ae-230c87feb0f3,2442a58a-3fa8-11ee-a70d-6febee05c4ec,4980a77c-41d6-11ee-8fb0-377b7b3a169c,f7b61202-44f9-11ee-8586-dfc5fd9824e6,21b45546-4752-11ee-a897-2fa9790f950b,cc32cad8-8f05-11ef-a38b-c7f6c9e51049,5d9e8f2e-9259-11ef-9679-7fcfc5b2fd32,b79d4556-99ed-11ef-a256-b3fbb21524d9,f9b83be0-9c9e-11ef-b06b-c7950e9b6f7d,def484dc-b097-11ef-bb19-134ff0ea1942,04252de4-93e4-11f0-bd6e-d388f3afe963,9bf1c766-9544-11f0-9a9b-2fcec944c46f,e761611a-995f-11f0-8039-7bf33cc9f49d,8940fee2-9ae5-11f0-b94d-5f85be665521,0a127432-9eb1-11f0-84b4-eff338ad799f \
  --max-llm-calls 25
```
_After the run_: review `data/errors.jsonl`, curate registries, append a review record to `data/pending/reviews.jsonl`, then recompose with `OPENAI_API_KEY=dummy npm run dev:pipeline -- --max-llm-calls 0` so artefacts pick up the canonical refs.

## Recent Changes
- **2025-11-11:** Timeline/UI refresh shipped—parchment background, oxblood + beige palette, centered spine, “Latest Episode” banner, rounded era chips (including the Undated/Special filter), tactile cards with gap markers, and matching detail-page styling (series + episode) using the same brand tokens.
- **2025-11-10:** Ingested the Nov 10 RSS snapshot, force-enriched episodes `615`, `616`, and the Bob Iger RIHC special, enforced cross-entity guardrails in `src/pipeline/validator.ts`, cleaned legacy pending topics that duplicated people/places, renamed the Rome/Greece entries to separate polity vs. topic labels, and added canonical people for Anne Boleyn, Catherine of Aragon, and Bob Iger.
- **2025-11-04:** Introduced canonical people/places/topic registries end-to-end (prompt v3, composer/validator/schema updates), enriched a 20-episode pilot batch (`2, 4–7, 360–364, 505, 507, 510, 511, 519, 601–605`), accepted 24 new people + 13 places, added topics (`thatcher-era`, `the-sixties`, `ancient-mesopotamia`, `mughal-empire`, `us-politics`), and logged decisions in `data/pending/reviews.jsonl`; artefacts (`public/episodes.json`) now ship structured entity refs alongside legacy arrays.
- **2025-11-03:** Timeline re-centered with linked episode/series cards, responsive mobile layout, and slug-aware data mappers feeding the new detail pages.
- **2025-11-02:** Added deterministic slug registry tooling (helpers, build script, tests) and refreshed PRDs/detail-view docs with V7 slug rules + layout notes.
- **2025-11-01:** Timeline now keeps BC spans intact, collapses large gaps with spine-mounted markers, and scales spacing at 1.5px/year; PRDs updated accordingly.
- **2025-10-31:** Replaced Vercel cron/Blob pipeline with scheduled GitHub Actions publish that auto-commits artefacts and calls the Vercel revalidation webhook.
- **2025-10-30:** Full LLM backfill completed with `gpt-5-nano`; added deterministic year-range propagation from episode cache to series output; schema validation passes on refreshed artefacts.
- **2025-10-30:** Added `scripts/iterate-llm-enrichment.mjs` and enhanced CLI flags so `--force-llm episodes|series|all` expands cleanly; fixed max-call handling and ensured `gpt-5-nano` usage via OpenAI Responses API.
- **2025-10-30:** Completed full project scaffolding, modular pipeline functions, orchestrators, schemas, and tests; integrated LLM enrichment with planning/dry-run modes; added GitHub Actions + Vercel config; ran local pipeline (limited to recent episodes & 20 LLM calls), fixing RSS enclosure parsing and year-range normalization in composer.
- **2025-10-30:** Troubleshot the local command `source .env.local && npm run dev:pipeline -- --since 2025-09-30 --max-llm-calls 20`; resolved `OPENAI_API_KEY` export issues, RSS enclosure parsing (non-string `audioUrl`), and invalid `yearFrom > yearTo` validation errors introduced by LLM data. Command now completes successfully with recent data.

## Environment
- **Node version:** `v23.10.0` (local), GitHub Actions uses Node 20.
- **Key npm scripts:**
  - `npm run dev:pipeline` — run full local pipeline (accepts flags like `--plan`, `--dry`, `--since`, `--max-llm-calls`, `--force-llm`, `--output`).
  - `npm run lint` — Next.js ESLint.
  - `npm test` — Vitest suite.
  - `npm run migrate:caches` — migrate legacy LLM cache format.
- **Environment variables:** `OPENAI_API_KEY`, `OPENAI_MODEL_PRIMARY` (default `gpt-5-nano`), `OPENAI_MODEL_FALLBACK` (default `gpt-4o-mini`), `VERCEL_REVALIDATE_URL` (webhook hit after scheduled publish).
