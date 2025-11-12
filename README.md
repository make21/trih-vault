# The Rest Is History Explorer

Next.js + TypeScript application and deterministic data pipeline that power the public “The Rest Is History” explorer. The repo contains the end-to-end ingestion/enrichment tooling **and** the static UI that renders the published JSON artefacts. New contributors should skim `codex-notes.md`, `docs/SYSTEM_OVERVIEW.md`, and the PRDs in `docs/` before diving into code, and every fresh AI coding session must begin by reading `codex-notes.md` to stay aligned with the latest collaboration guidance.

LLM enrichment now emits curated `keyTopics` (registry lives in `data/rules/topics.json`) so the UI can surface reusable topic chips for discovery.

## What’s in the box

### Deterministic data pipeline

The pipeline turns the official RSS feed into stable JSON artefacts that downstream consumers (including this UI) can trust run after run.

- **RSS ingestion** — Fetches `https://feeds.megaphone.fm/GLT4787413333`, snapshots each pull to `data/source/rss.YYYY-MM-DD.json`, and appends unseen entries to `data/episodes-raw.json`.
- **Programmatic enrichment** — Normalises titles/descriptions, extracts structured credits, derives year hints, and emits fingerprints in `data/episodes-programmatic.json`.
- **Series grouping** — Buckets multi-part arcs with stable IDs, aggregates spans/confidence, and writes `data/series-programmatic.json`.
- **LLM enrichment** — Uses OpenAI (`gpt-5-nano` primary, `OPENAI_MODEL_FALLBACK` for retries) to extract people, places, themes, and series summaries. Cached responses live in `data/episodes-llm.json` and `data/series-llm.json`, keyed by deterministic fingerprints.
- **Composition & validation** — Merges raw + programmatic + LLM layers, generates deterministic slugs plus `public/slug-registry.json`, writes `public/episodes.json` / `public/series.json`, and validates everything against JSON Schemas while logging recoverable issues to `data/errors.jsonl`.

`src/run-local-pipeline.ts` orchestrates the flow via stage modules in `src/pipeline/` (`fetcher`, `enricher`, `grouper`, `llmEnricher`, `composer`, `validator`). All writes go through `stableStringify` for byte-for-byte determinism.

### Explorer UI

- **Timeline home** — Mobile-first vertical timeline (`app/page.tsx`) that blends series and standalone episodes, respects BC ranges, collapses large gaps, and surfaces undated content (including a dedicated chip) separately.
- **Detail routes** — Deterministic slugs drive `/series/[slug]` and `/episode/[slug]` with narrative summaries, part lists, audio playback, and “connected threads” metadata (people, places, related episodes).
- **Shared data model** — UI reads the published artefacts directly; helper indexes, slug utilities, and similarity scoring live in `src/lib/` and `src/components/` so rendering stays deterministic and cache-friendly.

### Repository layout

- `src/pipeline/*` — Stage-specific pipeline modules.
- `src/run-local-pipeline.ts` — Pipeline orchestrator.
- `data/` — Working directory for snapshots, caches, intermediate artefacts.
- `public/` — Published JSON consumed by the UI (`episodes.json`, `series.json`, `slug-registry.json`).
- `app/` — Next.js App Router UI (timeline + detail views).
- `docs/` — System overview, PRDs, implementation plans.
- `.github/workflows/` — CI and scheduled publish automation.

## Prerequisites

- Node.js 20+ (local dev currently uses v23.10.0; CI targets Node 20).
- npm (ships with Node).
- Environment variables in `.env.local` when running locally:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL_PRIMARY` (default `gpt-5-nano`)
  - `OPENAI_MODEL_FALLBACK` (default `gpt-4o-mini`)
  - `VERCEL_REVALIDATE_URL` (optional for local dev, required for scheduled publish)

## Getting started

Install dependencies, run the UI, or execute the pipeline locally:

```bash
npm install                # install dependencies
npm run dev                # Next.js UI at http://localhost:3000
npm run dev:pipeline       # full pipeline run (rewrites data/ + public/)
npm run dev:pipeline -- --plan  # dry run for CI or quick verification
npm run schema:check       # validate artefacts against JSON Schemas
npm test                   # Vitest suite
```

When running the pipeline locally, load secrets first so OpenAI keys are available:

```bash
source .env.local && npm run dev:pipeline
```

### Pipeline tips

- `npm run dev:pipeline -- --plan` exercises every stage without writing to disk; handy for CI and smoke checks.
- Additional flags: `--since <YYYY-MM-DD>` (limit RSS ingestion), `--force-llm episodes|series|all` (invalidate caches), `--max-llm-calls <N>` (guard token spend).
- After any `--force-llm` run, review `data/errors.jsonl` and the `data/pending/` JSONL files to approve new people/places/topics into the registries (`data/rules/*.json`) and log decisions in `data/pending/reviews.jsonl` before recomposing artefacts.
- `npm run schema:check` runs AJV against `schema/*.json` to guarantee artefact compatibility.
- `npm run migrate:caches` upgrades legacy LLM cache formats when needed.

### Reviewing LLM proposals

- Run `npm run dev` and open `http://localhost:3000/review` to moderate pending people/place/topic proposals with a point-and-click UI. The page surfaces only unresolved items (parsed from `data/errors.jsonl`) and lets you accept, reject, or map entries without editing JSON manually.
- **Accept** writes the entity straight into `data/rules/{people,places,topics}.json` and appends an entry to `data/pending/reviews.jsonl`.
- **Map** links the proposal to an existing canonical entry (topics add a `topicsMapped` record; people/places append an alias to the target registry entry).
- **Reject** records the decision in `data/pending/reviews.jsonl` so future pipeline runs auto-ignore the same proposal.
- After finishing a review pass, re-run `OPENAI_API_KEY=dummy npm run dev:pipeline -- --max-llm-calls 0` (and any targeted `--force-llm` runs) so artefacts pick up the canonical IDs.

### Artefact quick reference

| Location | Description |
| --- | --- |
| `data/source/rss.YYYY-MM-DD.json` | Daily RSS snapshot with `fetchedAt` provenance. |
| `data/episodes-raw.json` | Append-only list of raw RSS episodes. |
| `data/episodes-programmatic.json` | Programmatic cleanup layer keyed by `episodeId`. |
| `data/series-programmatic.json` | Aggregated series metadata (fingerprints, spans, confidence). |
| `data/episodes-llm.json`, `data/series-llm.json` | Cached LLM enrichments keyed by `${id}:${fingerprint}`. |
| `public/episodes.json`, `public/series.json` | Published arrays consumed by the UI, including deterministic slugs. |
| `public/slug-registry.json` | Global registry ensuring unique episode/series slugs. |
| `data/errors.jsonl` | Recoverable pipeline issues with stage/item context. |

## Deploy & automation

- `.github/workflows/ci.yml` runs lint, pipeline plan mode, and Vitest on every push/PR.
- `.github/workflows/pipeline-publish.yml` runs nightly (and on dispatch) to execute the full pipeline, commit updated artefacts back to `main`, and trigger the Vercel revalidation webhook when outputs change.
- Vercel serves the Next.js UI directly from the committed artefacts; ensure commit authors have access to the Vercel project.

## Key documentation

Primary references live in `docs/`:

- `SYSTEM_OVERVIEW.md` — architecture and pipeline walkthrough.
- `PRD-Pipeline.md` — product requirements for the data layer.
- `PRD-UI.md` — UI experience goals and scope.
- `topics-registry.md` — naming rules + workflow for curated `keyTopics`.
- `timeline-data-qa.md`, `timeline-series-plan.md` — QA notes and planning docs.
- `PRD-UI-DetailViews.md` — implementation notes for episode/series/people/places routes.
- `implementation-plan.md`, `environment.md` — planning and setup references.

## Contributing workflow

1. Run `npm run dev:pipeline -- --plan` before opening a PR to confirm pipeline wiring.
2. If artefacts must change, execute the full pipeline locally and commit the resulting JSON alongside code.
3. Update `docs/` when workflow, architecture, or requirements evolve.
4. Monitor GitHub Actions and Vercel deployments after merging.

For deeper context, read the system overview and PRDs, then explore the relevant modules under `src/` and `app/`.
