# The Rest Is History Vault — System Overview

This document orients new maintainers around the data pipeline that powers the “The Rest Is History Vault” application. It explains how source data moves through the repository, where LLMs participate, and how to extend the system without breaking determinism.

```
RSS Feed → fetcher → programmatic enrichment → series grouping → LLM caches → composer → public artefacts
```

### Quick Start

```bash
npm install
npm run dev:pipeline        # full run (rewrites data/ + public/)
npm run schema:check        # AJV validation of current artefacts
npm run dev:pipeline -- --plan  # dry pipeline check; safe for CI
```

---

## Repository Layout at a Glance

- `src/run-local-pipeline.ts` – orchestration entry point invoked by `npm run dev:pipeline`.
- `src/pipeline/` – stage-specific modules:
  - `fetcher.ts` – RSS ingestion & change detection.
  - `enricher.ts` – programmatic clean-up + fingerprinting of episodes.
  - `grouper.ts` – deterministic series bucketing.
  - `llmEnricher.ts` – OpenAI-driven enrichment with cache discipline.
  - `composer.ts` – merges raw, programmatic, and LLM layers into publishable artefacts.
  - `validator.ts` – schema + contract checks, generates `data/errors.jsonl`.
- `src/lib/` – shared utilities:
  - `openai.ts` – wrapper around the `/v1/responses` API with primary/fallback model logic.
  - `slug.ts`, `stableStringify.ts` – deterministic helpers.
- `scripts/`
  - `iterate-llm-enrichment.mjs` – batch runner for large re-enrichments.
  - `schema-check.mjs` – validates public/cache artefacts with AJV.
  - `migrate-legacy-caches.mjs` – transforms historic cache formats.
- `data/` – canonical working set produced by the pipeline (RSS snapshots, intermediate JSON, LLM caches).
- `public/` – published artefacts (`episodes.json`, `series.json`, `slug-registry.json`) consumed by the Next.js UI.
- `schema/` – JSON Schemas governing cache & public outputs.
- `.github/workflows/ci.yml` – lint, plan-mode pipeline, unit tests on every push/PR.
- `package.json` – defines the pipeline scripts and installs runtime deps (`axios`, `ajv`, `xml2js`, etc.).

---

## End-to-End Pipeline Flow

1. **RSS Fetch (`fetcher.ts`)**
   - Pulls `https://feeds.megaphone.fm/GLT4787413333`.
   - Writes a dated snapshot to `data/source/rss.YYYY-MM-DD.json`.
   - Diff-based: only GUIDs not yet present in `data/episodes-raw.json` are treated as new. (The current implementation does **not** detect in-place edits; sparse edits require manual intervention.)
2. **Programmatic Episode Enrichment (`enricher.ts`)**
   - Cleans HTML, removes boilerplate, extracts structured credits.
   - Generates `cleanupVersion` and a deterministic SHA-256 fingerprint:
     ```
     epfp:v1\ncleanup_v=<version>\n<cleanTitle>\n<cleanDescriptionMarkdown>
     ```
   - Outputs `data/episodes-programmatic.json` keyed by `episodeId`.
3. **Series Grouping (`grouper.ts`)**
   - Detects multi-part arcs based on title patterns (e.g., “(Part 2)”).
   - Assigns stable IDs `toSlug(seriesKey) + "-" + firstPubDate` (e.g., `nelson-20251012`).
   - Aggregates derived metadata and, after the 2025-10-30 update, aggregates episode year spans.
   - Applies manual overrides defined in `src/config/seriesOverrides.ts` to capture tricky arcs whose titles drift between parts.
   - Writes `data/series-programmatic.json`.
4. **LLM Enrichment (`llmEnricher.ts`)**
   - Uses `src/lib/openai.ts` to call `gpt-5-nano` (fallback `OPENAI_MODEL_FALLBACK` if needed) via `/v1/responses`.
   - Two independent passes:
     - **Episodes** – extracts key people, places, themes, year range.
     - **Series** – produces a human title + narrative summary (+ optional tonal descriptors).
   - Cached in append-only maps:
     - `data/episodes-llm.json`
     - `data/series-llm.json`
   - Cache key: `${itemId}:${programmaticFingerprint}`; if fingerprint unchanged, no new call.
   - Supports `--force-llm` flags to force specific IDs, `episodes`, `series`, or `all`.
5. **Composition (`composer.ts`)**
   - Merges raw → programmatic → LLM layers.
   - Normalises year ranges, preferring LLM output; falls back to programmatic when missing.
   - Resolves deterministic slugs for every series/episode and emits a global registry.
   - Writes:
     - `public/episodes.json` (sorted by `publishedAt`, stable key ordering, includes `slug`).
     - `public/series.json` (sorted by first member’s publication date, includes `slug`).
     - `public/slug-registry.json` (map of `{ slug: { type, id } }`).
6. **Validation (`validator.ts`)**
   - Uses AJV schemas from `schema/`.
   - Ensures ID uniqueness, referential integrity, sorted serialization, and year consistency.
   - Appends recoverable issues to `data/errors.jsonl` with stage/item context.

All file writes go through `stableStringify` to guarantee byte-for-byte determinism. A **local** run rewrites the JSON in `data/` and `public/`; **CI plan mode** returns before persisting, so the checked-in artefacts are unaffected.

---

## Scripts & Automation

| Command | Purpose | Notable Options |
| --- | --- | --- |
| `npm run dev:pipeline` | Runs the full pipeline locally. | `--plan`, `--dry`, `--since`, `--force-llm`, `--max-llm-calls`, `--output` |
| `npm run dev` | Boots the Next.js UI against the committed artefacts. | Loads `.env.local` automatically. |
| `npm run schema:check` | Validates current artefacts against schemas. |  |
| `npm run migrate:caches` | Transforms legacy LLM cache formats (one-time upkeep). |  |
| `npm run llm:iterate` | Iteratively enriches in batches (useful for full history re-enrichment). | accepts batch size arg |

### CI Workflow (.github/workflows/ci.yml)

1. `npm ci`
2. `npm run lint`
3. `npm run dev:pipeline -- --plan` (plan mode: no writes, but exercises every stage short of OpenAI calls).
4. `npm test`

Plan mode allows CI to verify schema + pipeline wiring without spending tokens. It still requires valid environment secrets because the OpenAI client is initialised, even though the calls are skipped. The workflow bails out before writing anything to `data/` or `public/`.

---

## Data Model & Fingerprints

### Episode
- Raw fields retained from RSS plus programmatic outputs (`cleanTitle`, `descriptionBlocks`, credits).
- LLM enrichments add arrays (`keyPeople`, `keyPlaces`, `keyThemes`, `keyTopics`) and normalized year spans.
- Fingerprint ties together the cleanup version + cleaned content to provide deterministic cache invalidation.

### Series
- Derived from grouped episodes.
- Fingerprint:
  ```
  srfp:v1\n<seriesId>\n<memberEpisodeFingerprints.join("\n")>
  ```
- Contains derived episode summaries, member IDs, aggregated year ranges.
- LLM adds title, summary, and optional tonal descriptors.

### Cache Entries
- Stored as JSON objects keyed by `${itemId}:${fingerprint}`.
- Schema enforces required fields, array uniqueness, and kebab-case themes.
- Episode cache entries now include `keyTopics`, referencing curated IDs from `data/rules/topics.json` (`docs/topics-registry.md`). Proposed topics are marked `isPending: true` and reviewed before acceptance.
- Status codes (`ok`, `skipped`, `error`) allow composer to ignore invalid outputs gracefully.

---

## Caching, Enrichment Strategy & Retries

- **Primary reuse**: if a cache entry exists with matching fingerprint and `status === "ok"`, no new OpenAI call is made.
- **Forcing**: `--force-llm episodes` / `series` / `all` deletes existing entries for matching items before re-enrichment.
- **Max call guard**: `--max-llm-calls <N>` prevents runaway batches. Values `<0` are treated as “unlimited”.
- **Errors**: retries (up to 3 with exponential backoff) happen inside `openai.ts`. Failures are logged with context and cached as `status: "error"` to avoid infinite loops; re-run with `--force-llm` once the issue is resolved.
- **Year propagation**: after enrichment, `run-local-pipeline.ts` copies the final episode year span into programmatic memory and recomputes series min/max ranges deterministically. No extra cache state is persisted.
- **Pruning**: cache files are append-only. There is no rotation job today; when bloat becomes an issue, use `scripts/iterate-llm-enrichment.mjs` or a bespoke script to rebuild caches from scratch.

---

## Artefact Outputs

| Location | Type | Notes |
| --- | --- | --- |
| `data/source/rss.YYYY-MM-DD.json` | Snapshot | Provenance record, includes `fetchedAt`. |
| `data/episodes-raw.json` | Array | Append-only list of raw RSS items. |
| `data/episodes-programmatic.json` | Object map | Keyed by `episodeId`. |
| `data/series-programmatic.json` | Object map | Keyed by `seriesId`. |
| `data/episodes-llm.json`, `data/series-llm.json` | Object maps | LLM caches keyed by fingerprinted IDs. |
| `data/errors.jsonl` | JSON Lines | Recoverable issues per run; info-level lines do not fail CI; rotate/purge as needed. |
| `public/episodes.json`, `public/series.json` | Arrays | Stable JSON consumed directly by the Next.js UI; expose deterministic slugs for routing. |
| `public/slug-registry.json` | Object map | Global slug registry consumed by the UI to resolve detail routes and prevent collisions. |

All JSON is stable-sorted; repeated runs with unchanged inputs produce identical bytes (enabling diff-based deploy pipelines).

---

## Environment & Configuration

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Required to call OpenAI. |
| `OPENAI_MODEL_PRIMARY` | Default `gpt-5-nano`. |
| `OPENAI_MODEL_FALLBACK` | Optional fallback (default `gpt-4o-mini`). |
| `VERCEL_REVALIDATE_URL` | HTTPS webhook invoked after publish to refresh the Vercel cache. |

Local runs typically load these via `.env.local`. CI expects the secrets to be defined for plan mode execution, even though no tokens are consumed there. The scheduled GitHub Actions workflow (`pipeline-publish.yml`) runs the full pipeline, commits artefacts back to `main`, and POSTs to the revalidation webhook.

Other configuration:
- Vercel now picks up changes via ordinary git deployments; no cron job or Blob persistence is required.
- `tsconfig.json` / `vitest.config.ts` align TypeScript + test environment.
- The Next.js app (`app/`) reads from `public/` artefacts at runtime.

---

## Extending the System

1. **New Programmatic Enrichment**
   - Add logic to `enricher.ts` (or a module it calls) and bump `CLEANUP_VERSION` to invalidate fingerprints intentionally.
   - Update `/schema` definitions if new fields are surfaced.
   - Provide regression tests under `src/pipeline/__tests__`.
2. **New LLM Fields or Prompts**
   - Version prompts (e.g., `episode.enrichment.v2`).
   - Adjust schemas + composer merge order.
   - Consider adding feature flags so plan mode remains cheap to run in CI.
3. **Additional Outputs**
   - Extend `composer.ts` to produce new artefacts or add keys to existing ones.
   - If persistence is required (e.g., uploading to Blob storage or S3), add a post-compose step in `run-local-pipeline.ts` guarded by flags or environment variables.
4. **Schemas & Validation**
   - Update relevant files in `schema/`.
   - Extend `scripts/schema-check.mjs` if new outputs need validation.
5. **Determinism Guardrails**
   - Any new code that serialises JSON should either use `stableStringify` or add reproducible ordering.
   - When storing caches, always key by immutable fingerprints so re-runs reuse prior work.
   - Bump fingerprint prefixes (`epfp:v1`, `srfp:v1`) when the underlying cleanup or grouping semantics change. Version bumps are manual—increment to `v2` when a change would invalidate old responses.
6. **Automation**
   - For long-running backfills, favour `scripts/iterate-llm-enrichment.mjs` or wrap `npm run dev:pipeline` in `caffeinate` on macOS to avoid sleep.
   - Keep CI’s plan-mode coverage current by ensuring new flags have sensible defaults and don’t require write access.

Following these patterns keeps the pipeline deterministic, testable, and cheap to operate—future changes should uphold the fingerprint + cache contract so re-enrichment only occurs when inputs truly change.

---

## Testing Strategy

- `npm test` currently runs `src/pipeline/__tests__/composer.test.ts`, a focused unit suite that validates composer merge precedence and schema compliance for representative fixtures.
- No end-to-end “golden” tests exist yet; adding snapshot or JSON-diff tests alongside the architecture work would provide broader coverage.

---

## Change History (stub)

- **2025-10-31:** Fixed GitHub Actions publish workflow secret usage, restored timeline UI typings to match new artefacts, and reintroduced `@types/xml2js` so the pipeline compiles end-to-end.
- **2025-10-30:** Introduced year-span propagation from episode LLM cache to series outputs; completed full gpt-5-nano backfill; documented pipeline in this overview.
