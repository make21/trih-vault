# The Rest Is History Pipeline — Product Requirements

## 1. Goal
Deliver a deterministic, append-only data pipeline that ingests *The Rest Is History* podcast RSS feed, layers in programmatic cleanup and cached LLM enrichments, and publishes stable JSON artefacts for downstream consumers. The new system must minimise LLM token usage, support incremental updates, and remove the legacy "topics" concept entirely.

## 2. Scope
- **In scope**
  - RSS ingestion from `https://feeds.megaphone.fm/GLT4787413333`.
  - Programmatic transforms that normalise episode text, strip boilerplate, and extract structured credits.
  - Deterministic series grouping with derived aggregates (e.g. `yearFrom`, `yearTo`).
  - LLM passes for episodes and series that consume the programmatic fingerprints and reuse cached responses.
  - Composition of public JSON outputs without regenerating historical data unnecessarily.
- **Out of scope**
  - Any topic generation, storage, or validation.
  - UI or playback features; this PRD focuses purely on the data pipeline.

## 3. Personas & Needs
| Persona | Need |
| --- | --- |
| Data pipeline maintainer | Run a predictable, idempotent set of scripts locally or in CI without re-enriching unchanged items. |
| Downstream consumer | Read `public/episodes.json` and `public/series.json` with complete metadata, including deterministic episode cleanup and series spans. |
| Cost controller | Keep OpenAI usage low by caching outputs and avoiding re-requests unless fingerprints change. |

## 4. Data Layers
The pipeline uses a layered storage model under `data/` and `public/`.

### 4.1 Episodes
1. `data/episodes-raw.json` — append-only output of the RSS fetch step. Each item contains minimal metadata (`id`, `title`, `pubDate`, `description`, `audioUrl`, optional `itunesEpisode`).
2. `data/episodes-programmatic.json` — deterministic enrichment keyed by `episodeId`. Fields include the existing cleanup artefacts plus:
   - `cleanTitle`, `cleanDescription` (plain text or light Markdown after HTML parsing).
   - `descriptionBlocks` (array of paragraphs for later use).
   - `credits` object (e.g. `producer`, `execProducers`).
   - `fingerprint` (hash of `cleanTitle` + `cleanDescription` to invalidate caches when deterministic content changes).
   - `derived` fields such as `year`, `durationSeconds` (if available), `contentWarnings`, etc.
   - `part` (numeric part index when the title contains a "Part N" suffix, otherwise `null`).
  - `seriesId` (stable identifier shared by every episode in the same multi-part arc; generated when `part` is populated so that `Part 1/Part 2/…` share the same group).
3. `data/episodes-llm.json` — cached LLM outputs keyed by `episodeId` and the deterministic `fingerprint`. Stores structured enrichment with the following schema:
   - `keyPeople` — notable individuals mentioned in the synopsis, excluding the hosts Tom Holland and Dominic Sandbrook and generic credit mentions.
   - `keyPlaces` — geographic anchors or locations central to the episode.
   - `keyThemes` — short descriptors that capture the central topics or ideas.
   - `yearFrom` / `yearTo` — numeric year span inferred from the description and episode context; when the LLM cannot infer a period with confidence, both values are set to `"NA"`.
   - Additional LLM artefacts (e.g. key questions) may remain alongside these required fields, but per-episode narrative summaries are no longer required because the cleaned description already fulfils that need.

The programmatic layer is responsible for identifying part indicators (e.g. titles such as `"58. The World Cup of Gods - Part 1"`). The detection logic should consider sequential numbering, publication ordering, and consistent text around the part suffix to ensure all related episodes receive the same `seriesId`.

#### Series Key Extraction
- When a title matches the canonical pattern `<episodeNumber>. <seriesName>: <rest> (Part N)`, use the portion between the episode number and the first colon as the deterministic `seriesKey`. Normalise whitespace, strip trailing punctuation, and downcase when generating the `seriesId` slug.
- If a title contains `Part N` but no colon (e.g. `"138. The Princes in the Tower Part 1"`), treat the text between the episode number and the `Part` token as the `seriesKey`.
- When multiple, non-contiguous arcs reuse the same `seriesKey` (e.g. multiple "Nelson" runs published years apart), differentiate their `seriesId` values by appending the earliest publication date (YYYYMMDD) of the arc or, if unavailable, the lowest `itunesEpisode` number observed for the group.
- Always assign a `seriesId` whenever a `Part N` pattern is detected, even if the `seriesKey` is ambiguous; the LLM layer can later generate a human-friendly title using the cleaned descriptions.

### 4.2 Series
1. `data/series-raw.json` — deterministic grouping step that clusters related episodes and stores membership arrays.
2. `data/series-programmatic.json` — aggregates computed from the raw grouping and programmatic episode data:
   - `seriesId` (copied from the episode layer so each multi-part arc can be traced end-to-end).
   - `yearFrom`, `yearTo` (min and max of member episode years).
   - `episodeIds` (ordered array for reference).
   - `fingerprint` (hash of member episode fingerprints + ordering).
   - Any other deterministic metadata (e.g. inferred subject tags, episode counts).
3. `data/series-llm.json` — cached LLM metadata keyed by `seriesId` and the deterministic `fingerprint`. Required fields include:
   - `seriesTitle` — human-friendly title derived from the episode titles/descriptions within the series.
   - Narrative summaries, tonal descriptors, and other prompts carried over from the previous spec.

### 4.3 Public Outputs
- `public/episodes.json` — overlay of raw + programmatic + LLM data per episode.
- `public/series.json` — overlay of raw + programmatic + LLM data per series.
- `public/topics.json` — **removed**; the compose step and validators must no longer expect it.

## 5. Pipeline Flow
```
[RSS Feed]
    ↓
[data/source/rss.YYYY-MM-DD.json]
    ↓
[data/episodes-raw.json]
    ↓
[data/episodes-programmatic.json]
    ↓
[data/series-raw.json]
    ↓
[data/series-programmatic.json]
    ↓
[data/episodes-llm.json]
    ↓
[data/series-llm.json]
    ↓
[public/episodes.json, public/series.json]
    ↓
[validate]
```
Each stage reads the previous layer and only appends or updates the keyed objects for newly discovered items.

### 5.1 Fetch RSS
- Script reads from the live feed (`FEED_URL`) and falls back to `data/source/rss.sample.xml` when offline.
- Writes a daily snapshot under `data/source/rss.YYYY-MM-DD.json` for reproducibility.
- Appends unseen episodes into `data/episodes-raw.json` without altering existing entries.

### 5.2 Build Series (Raw)
- Deterministic script analyses episodes to group arcs and writes `data/series-raw.json`.
- Must handle part numbers, shared prefixes, or explicit markers already present in titles.

### 5.3 Programmatic Episode Enrichment
- Shared utilities (e.g. `stripHtml`, boilerplate markers) extract clean text once per episode.
- Steps:
  1. Parse HTML → keep only meaningful paragraphs; collapse `<br>` spam.
  2. Identify and drop boilerplate (tour promos, social links, generic "Learn more" lines) using marker lists.
  3. Extract credits into structured fields (`producer`, `execProducers`, etc.).
  4. Normalise whitespace, punctuation, and HTML entities.
  5. Compute `fingerprint = hash(cleanTitle + '\n' + cleanDescription)`.
  6. Detect `Part N` suffixes and assign `part` and `seriesId` values consistently across all matching episodes.
- Results persisted in `data/episodes-programmatic.json` keyed by `episodeId`.

### 5.4 Programmatic Series Enrichment
- Input: `data/series-raw.json` + `data/episodes-programmatic.json`.
- For each series:
  - Collect member episode years to derive `yearFrom`/`yearTo`.
  - Aggregate credit contributors if relevant.
  - Generate `fingerprint = hash(seriesId + JSON.stringify(memberEpisodeFingerprints))`.
  - Store deterministic descriptors ready for LLM prompts.

### 5.5 LLM Enrichment
- Episode and series scripts read the programmatic layer, filter for items whose fingerprints lack cached responses, and call OpenAI once per item.
- `episodes-llm` prompts must surface `keyPeople`, `keyPlaces`, `keyThemes`, and year spans while ignoring hosts and credit-only names. They should not request a narrative summary because the cleaned description already serves as the canonical episode synopsis.
- When descriptions jump across multiple periods or remain ahistorical (e.g. "66. Ghosts"), set `yearFrom = "NA"` and `yearTo = "NA"`.
- `series-llm` prompts must infer a `seriesTitle` from the grouped episodes alongside the narrative summary.
- Cache format example:
  ```json
  {
    "episodeId:fingerprint": {
      "keyPeople": ["…"],
      "keyPlaces": ["…"],
      "keyThemes": ["…"],
      "yearFrom": "…",
      "yearTo": "…"
    }
  }
  ```
- Use the lightweight client in `vendor/openai` and the shared helper for retries/backoff.

### 5.6 Compose
- Script merges the three layers to produce `public/*.json`. Example merging logic:
  ```js
  const mergedEpisode = {
    ...rawEpisode,
    ...programmatic[episode.id],
    ...llm[cacheKeyFor(episode.id, programmatic[episode.id].fingerprint)],
  };
  ```
- Compose can run twice (before and after LLM) to give deterministic outputs even when LLM tokens are unavailable.

### 5.7 Validate
- Contract checks ensure:
  - Every `public/episodes.json` entry has a `fingerprint`, cleaned text fields, and (when applicable) `part`/`seriesId` alignment.
  - Every series references existing episode IDs and has `yearFrom <= yearTo` (or both `"NA"`).
  - No references to topics remain.

## 6. Incremental Behaviour
- Raw files are append-only; never rewrite old items.
- Programmatic and LLM layers are dictionaries keyed by stable IDs; only new or changed fingerprints trigger updates.
- Provide a seeding/migration utility to backfill caches from legacy data on first run.

## 7. Operational Considerations
- **Environment variables**: `OPENAI_API_KEY` must be set locally and as a GitHub repo secret (`secrets.OPENAI_API_KEY`) for CI, as referenced in `.github/workflows/enrich.yml`.
- **Commands** (to be updated in `package.json`):
  ```json
  {
    "scripts": {
      "fetch": "node scripts/fetch-rss.js",
      "build:series": "node scripts/build-series.js",
      "enrich:episodes": "node scripts/enrich/episodes-programmatic.mjs",
      "enrich:series": "node scripts/enrich/series-programmatic.mjs",
      "llm:episodes": "node scripts/llm/episodes.mjs",
      "llm:series": "node scripts/llm/series.mjs",
      "compose": "node scripts/enrich/compose.mjs",
      "validate": "node scripts/validate.js"
    }
  }
  ```
- **CI sequence**: mirror the command flow above; drop any topic-related steps.

## 8. Success Metrics
- Running the full pipeline with no new episodes should make zero OpenAI requests and leave git clean.
- New episodes should appear end-to-end (raw → public) after a single pipeline execution.
- Manual reruns should be idempotent even if LLM calls fail (compose still produces deterministic outputs from available layers).

## 9. Risks & Mitigations
| Risk | Mitigation |
| --- | --- |
| Fingerprint drift causing unnecessary LLM calls | Keep programmatic cleanup deterministic, version cleanup helpers carefully, and document fingerprint formula. |
| Boilerplate rules accidentally remove genuine content | Maintain a test corpus of sample descriptions and review diffs when rules change. |
| Series membership changes invalidating caches | Fingerprint combines ordered episode fingerprints so membership updates automatically invalidate relevant LLM entries. |

## 10. Open Questions
- Do we need additional metadata (e.g. guest bios) that could be programmatically derived from show notes? (Requires further discovery.)
- Should we expose cleaned Markdown or plain text only? (Decide based on downstream consumer preferences.)
- Are there thresholds for delaying LLM enrichment when OpenAI rate limits occur? (Potential future enhancement.)
