# Codex Session Notes — Instructions
1. At the start of a new session, say “read codex-notes.md” and I’ll load and summarize it before proceeding.
2. When you say “wrapping up,” I’ll summarize the session, append the notes under “Recent Changes,” update “Next Steps,” and save the file automatically.

---

## Project Overview
- **Repository:** trih-browser
- **Purpose:** Next.js + TypeScript project for The Rest Is History podcast data pipeline. Ingests RSS feed, performs deterministic enrichments (programmatic + LLM), and publishes JSON artefacts validated against schemas. Supports local runs and scheduled GitHub Actions publishes (Vercel serves static JSON).
- **Key Modules:** `src/pipeline/*` (fetcher, enricher, grouper, composer, validator, llmEnricher), `src/run-local-pipeline.ts` (orchestrator), `scripts/migrate-legacy-caches.mjs`.
- **Reference:** Product requirements live in `docs/PRD-Pipeline.md`.

## Current Focus
- Frontend timeline polish: BCE-aware ranges, collapsible long gaps, and updated UI PRD alignment.

## Next Steps
- Wire up remaining performance/accessibility tasks for the timeline (gap skip short-circuit, optional virtualization).
- Monitor the scheduled GitHub Actions publish + Vercel revalidation webhook once deployed to ensure artefacts update as expected.

## Recent Changes
- **2025-11-01:** Timeline now keeps BCE spans intact, collapses large gaps with spine-mounted markers, and scales spacing at 1.5px/year; PRDs updated accordingly.
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
