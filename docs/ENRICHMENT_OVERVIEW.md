# Enrichment overview

## 1) High-level summary
The enrichment pipeline reads the published episode dataset, augments it with inferred series groupings, time ranges, umbrellas, and caches, and writes the enriched JSON artifacts both when executed locally via the CLI (`npm run enrich`) and nightly through the `Enrich episodes` GitHub Action. It currently reads `public/episodes.json` plus optional century maps and the LLM cache, and writes back `public/episodes.json`, `public/collections.json`, `public/umbrellas.json`, and `data/inference-cache.json` when not in dry-run mode.【F:scripts/enrich/enrich.ts†L24-L35】【F:scripts/enrich/enrich.ts†L431-L451】【F:scripts/enrich/index.ts†L12-L83】【F:.github/workflows/enrich.yml†L1-L48】

## 2) Data sources & base shapes
* `public/episodes.json` is the RSS-derived base dataset produced by `scripts/build-dataset.mjs` and is the primary input loaded by `enrichEpisodes`.【F:scripts/enrich/enrich.ts†L24-L80】  
* Optional “century map” hints are loaded from `data/century-map.csv`, `docs/century-map.csv`, `data/century-map.json`, or `docs/century-map.json`, whichever exists first.【F:scripts/enrich/century.ts†L7-L102】  
* The existing LLM cache is read from `data/inference-cache.json` unless `--refresh` clears it.【F:scripts/enrich/enrich.ts†L27-L94】

Input episode shape (before enrichment):
```ts
export type Episode = {
  episode: number;
  title_feed: string | null;
  title_sheet: string | null;
  description: string | null;
  pubDate: string;
  slug: string;
  eras?: string[];
  regions?: string[];
  // ...RSS passthrough fields
};
```
【F:scripts/enrich/types.ts†L14-L27】

## 3) Enrichment steps (actual behavior in code)
* **Series detection** – `scripts/enrich/series.ts` uses `PART_REGEX` and `romanToInt` to extract numbered parts from feed/sheet titles, requires consecutive part numbers, episode numbers within two of each other, and publication dates within 21 days; valid groups produce slugified keys and assignments.【F:scripts/enrich/series.ts†L1-L125】
* **LLM inference** – `scripts/enrich/llm.ts` constructs an OpenAI chat request with a historical-classifier system prompt, sends inputs including titles, description, series hint, and century label, and expects a JSON response validated against `LLMInferenceSchema`; calls use the `gpt-4o-mini` model, temperature 0, a 600-token cap, concurrency limited to two via `p-limit`, and are retried up to three times with exponential (0.5s, 1s, 2s) backoff and a 30s timeout.【F:scripts/enrich/llm.ts†L1-L129】
* **Year inference strategy** – `hydrateFromInference` applies cache/LLM output, nulling year fields when confidence falls below `LOW_CONFIDENCE_THRESHOLD` (0.55) and recording the source; episodes lacking years afterward get century ranges via `applyCenturyFallback`, and `applySeriesSmoothing` fills missing fields from sibling medians and ranges, clamping out-of-order spans.【F:scripts/enrich/enrich.ts†L29-L193】【F:scripts/enrich/century.ts†L14-L37】
* **Umbrella tagging** – LLM-provided umbrellas are normalized to kebab-case and filtered through an allow list with room for up to two extra free-form labels; the sanitizer is invoked when absorbing inference and when computing summaries.【F:scripts/enrich/umbrellas.ts†L1-L43】【F:scripts/enrich/enrich.ts†L299-L300】【F:scripts/enrich/enrich.ts†L228-L245】
* **Post-processing** – `finalizeState` clamps reversed ranges and primary years into range bounds, while `applySeriesSmoothing` derives group medians, sets scopes (`point` vs `range`), and updates confidence by averaging group values; `buildCollections` and `buildUmbrellaSummary` aggregate final structures for downstream use.【F:scripts/enrich/enrich.ts†L152-L325】【F:scripts/enrich/enrich.ts†L197-L245】
* **Caching** – The pipeline reads `data/inference-cache.json`, merges new results into `cacheUpdates`, and writes the JSON file at the end of a successful run; `--refresh` starts from an empty cache, and `--cache-only` prevents new LLM calls while still hydrating states from disk.【F:scripts/enrich/enrich.ts†L82-L370】【F:scripts/enrich/enrich.ts†L400-L435】

## 4) Outputs (actual JSON schemas)
Enriched episode shape:
```ts
export type EnrichedEpisode = Episode & {
  seriesKey: string | null;
  seriesTitle: string | null;
  seriesPart: number | null;
  yearPrimary: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  scope: "point" | "range" | "broad" | "unknown";
  umbrellas: string[];
  confidence: number | null;
  source: "rules" | "series" | "century" | "llm" | "override" | "mixed" | null;
};
```
【F:scripts/enrich/types.ts†L29-L43】

Other artifacts:
* `public/collections.json` – array of `{ key, title, count, episodes: number[], slugs: string[], parts: number[], years: { min: number|null, max: number|null } }` built per detected series.【F:scripts/enrich/types.ts†L63-L78】【F:scripts/enrich/enrich.ts†L197-L226】  Example entry: the “1922” two-parter with parts `[1,2]` and a single-year range.【F:public/collections.json†L1-L56】
* `public/umbrellas.json` – object `{ index: Record<string, number[]>, counts: Record<string, number> }` mapping normalized umbrellas to episode numbers; includes generic clusters like `politics` and `history`.【F:scripts/enrich/types.ts†L80-L84】【F:scripts/enrich/enrich.ts†L228-L245】【F:public/umbrellas.json†L1-L80】
* `data/inference-cache.json` – record keyed by episode slug containing cached inference `{ seriesTitle, seriesPart, yearPrimary, yearFrom, yearTo, scope, umbrellas, confidence }`. Example entries show point estimates, broad ranges, and zero-confidence fallbacks.【F:scripts/enrich/types.ts†L58-L87】【F:data/inference-cache.json†L1-L45】
* Enriched episodes are written back into `public/episodes.json`; sample records include inferred years, umbrellas, and sources like `series` or `llm`.【F:public/episodes.json†L1-L63】

## 5) Build & CI plumbing
* Workflow: `.github/workflows/enrich.yml` triggers on manual dispatch and a daily `0 5 * * *` cron, running on Ubuntu with `contents: write` permissions.【F:.github/workflows/enrich.yml†L1-L20】
* Environment: expects `OPENAI_API_KEY` (required for live inference) and optional `VERCEL_DEPLOY_HOOK_URL` to trigger deployment.【F:.github/workflows/enrich.yml†L14-L48】
* Steps: checkout with full history, install dependencies via `npm ci`, build the TypeScript scripts (`npm run build:enrich`), execute the CLI with `--verbose`, commit updated JSON artifacts, push back to the source branch, and optionally POST to the Vercel deploy hook.【F:.github/workflows/enrich.yml†L18-L48】
* Local CLI: `scripts/enrich/index.ts` parses flags (`--dry-run`, `--refresh`, `--only`, `--cache-only`, `--verbose`) and exits non-zero on error, summarizing totals on success.【F:scripts/enrich/index.ts†L12-L83】

## 6) Logs, limits, error handling
* Retries & backoff: each OpenAI call retries up to three times with exponential delays after network or API failures, and aborts after 30 seconds; failure after retries throws, terminating the run.【F:scripts/enrich/llm.ts†L56-L123】
* Concurrency: `p-limit` restricts in-flight LLM requests to two; additional episodes queue until slots free.【F:scripts/enrich/llm.ts†L56-L129】
* Confidence thresholds: responses with confidence below 0.55 drop their year fields and set scope back to `unknown`, preventing dubious data from propagating.【F:scripts/enrich/enrich.ts†L284-L301】
* Exit behavior: the CLI catches errors, logs them, and exits with status 1; the GitHub Action therefore fails if enrichment throws or if git commands error out.【F:scripts/enrich/index.ts†L62-L83】

## 7) Deviations from the original spec (important)
* **Series-level years** – Years live on episodes, with collections simply aggregating min/max; there is no separate series-level year assignment, so multi-part ranges are derived from per-episode values rather than being authored once per series.【F:scripts/enrich/enrich.ts†L197-L226】
* **Series key stability** – LLM inferences can introduce new series titles that slugify into keys (e.g., `hydrateFromInference` sets `seriesKey` from `seriesTitle`), meaning keys can drift if the model rephrases titles, potentially yielding duplicates like `american-revolution` and `american-revolution-2`.【F:scripts/enrich/enrich.ts†L272-L301】
* **Umbrellas** – Sanitization relies on a small allow list but also permits up to two arbitrary extras, so outputs include broad tags like `politics` or `history` instead of curated proper-noun clusters.【F:scripts/enrich/umbrellas.ts†L1-L43】【F:public/umbrellas.json†L1-L80】
* **Standalones** – Any episode with a `seriesKey` (even if unique) becomes a collection entry; the sample data shows one-off collections such as `1066 1`, so standalones are effectively treated as “series of one” when a key exists.【F:public/collections.json†L1-L33】
* **Other mismatches** – Some cached entries keep `scope: "unknown"` with confidence 0, and century fallbacks mark scope `broad` with midpoints rather than preserving `unknown`, which may differ from an intended deferral behavior.【F:data/inference-cache.json†L12-L20】【F:scripts/enrich/enrich.ts†L108-L118】

## 8) Quickstart (how to run today)
* Dry-run the full pipeline locally: `npm run build:enrich && npm run enrich -- --dry-run --verbose` (reads inputs, logs summary, skips writes).  
* Run a single slug with live inference: `OPENAI_API_KEY=... npm run build:enrich && npm run enrich -- --only <episode-slug> --refresh` to bypass stale cache entries.  
* Warm the cache in small batches by invoking `npm run enrich -- --only <slug>` repeatedly (or per short list) with the API key set; results accumulate in `data/inference-cache.json`.  
* Outputs update under `public/episodes.json`, `public/collections.json`, `public/umbrellas.json`, and `data/inference-cache.json`; diff changes with `git diff public/ data/` after a run.【F:scripts/enrich/enrich.ts†L431-L451】

## 9) Cost & safety notes
* Each OpenAI call requests up to 600 output tokens and sends the full prompt (titles, description, hints), so first-run costs scale with the number of uncached episodes; concurrency is capped at two to avoid burst costs.【F:scripts/enrich/llm.ts†L56-L129】
* Spend controls: skip live calls by omitting `OPENAI_API_KEY`, run with `--cache-only` to reuse prior results, or `--only` to target specific slugs; `--refresh` invalidates the cache when a clean sweep is needed.【F:scripts/enrich/enrich.ts†L331-L370】
* Prompt size safety: the user prompt serializes text fields and century hints without truncation, so extremely long descriptions may expand tokens; the system relies on OpenAI-side truncation if the response exceeds limits (no local clipping implemented).【F:scripts/enrich/llm.ts†L29-L54】【F:scripts/enrich/llm.ts†L74-L83】

## 10) Suggested next steps (non-code)
* **Safe refactors** – Standardize series key generation (e.g., central slugifier), rename fields for clarity (`seriesPart` vs `episodePart`), and extract post-pass normalization for unit testing without altering behavior.【F:scripts/enrich/enrich.ts†L152-L325】
* **Behavioral changes** – Implement series-level year storage and propagate to collections, lock stable keys when LLM suggestions conflict, shift umbrella taxonomy toward curated topics rather than generic tags, and decide whether singletons should produce collections or remain standalones; these updates would touch `scripts/enrich/enrich.ts`, `scripts/enrich/series.ts`, and `scripts/enrich/umbrellas.ts` alongside downstream JSON consumers.【F:scripts/enrich/enrich.ts†L197-L325】【F:scripts/enrich/series.ts†L1-L125】【F:scripts/enrich/umbrellas.ts†L1-L43】
