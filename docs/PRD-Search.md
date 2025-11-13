# Search & Discovery PRD (v1)

Last updated: 2025-11-11

---

## 1. Product Snapshot

**Goal**  
Deliver a single omnibox (“Global Search”) that lets mobile users quickly jump to episodes, series, and canonical People/Places/Topics entity pages without leaving the deterministic, static-first architecture of the Vault.

**Success Metrics (first 2 weeks post-launch)**
- ≥25% of sessions perform at least one search (mirrors the UI PRD success target).
- ≥40% of searches result in a result click.
- ≤1.5 MB compressed transfer for all assets fetched to power the search UI on first interaction (index JSON + component bundle).

**Dependencies**
- Composition pipeline outputs (`public/episodes.json`, `public/series.json`, `public/slug-registry.json`).
- Curated registries in `data/rules/{people,places,topics}.json`.
- GA4 instrumentation hooks referenced in `docs/PRD-UI.md`.

---

## 2. Scope

**In v1**
- Pre-built MiniSearch index serialized during the pipeline run, covering episodes, series, and canonical entity pages.
- People/Places facet chips (single-select for each facet type) derived from canonical slugs included with every result.
- Client-side Global Search component that lazy-loads the serialized index, executes queries, renders mixed result lists, and fires GA events (`search_submit`, `search_result_click`, `filter_chip_click`).
- SEO guardrails: robots.txt disallows `/search` and `?q=` variations, and the `/search` route exports `noindex` metadata + canonical pointing back to `/search` root.
- Accessibility: keyboard focus management, `aria-expanded` for filter drawers, and readable voice-over labels for result metadata.

**Out of Scope (defer)**
- Server-hosted or API-based search infrastructure (Typesense, Meilisearch, Algolia).
- Multi-select or advanced filters (Topics/Themes, year ranges).
- Offline caching of the serialized index.
- Synonym or typo-tolerant personalization beyond MiniSearch defaults.

---

## 3. Data & Index Construction

1. **Build script** — Add `scripts/build-search-index.ts` that runs after the composition pipeline (e.g., chained via `npm run dev:pipeline && npm run build:search`). The script:
   - Imports the deterministic artefacts (`public/episodes.json`, `public/series.json`) plus curated entity registries.
   - Normalises IDs and slugs with the same helpers used throughout `src/lib/data/catalog.ts` and `src/lib/entities.ts` to avoid drift.
   - Creates a MiniSearch instance configured with weighted fields: `title` (10), `summary` (4), `keywords` (3), `description` (1). Keyword arrays include `keyPeople`, `keyPlaces`, `keyTopics`, and entity aliases.
   - Adds three document types:
     - **Episode** — `{ id: episodeId, slug, type: 'episode', title, summary, description?, yearRange, seriesSlug, peopleSlugs[], placeSlugs[], topicSlugs[] }`.
     - **Series** — `{ id: seriesId, slug, type: 'series', title: seriesTitle, summary: narrativeSummary, description?, keywords: aggregated entities, yearRange }`.
     - **Entity** — `{ id: entitySlug, slug, type: 'person' | 'place' | 'topic', title: preferred label, summary: registry notes, keywords: aliases }`.
   - Limits stored fields to what the client needs to render list items without refetching: `{ id, type, slug, title, summary, yearRange?, badge }`.
   - Serializes the ready-to-query index via `MiniSearch.saveJSON` to `public/search-index.json` and stores accompanying lightweight metadata (version hash, record counts) for runtime sanity checks.
   - Includes unit coverage (e.g., `scripts/__tests__/build-search-index.test.ts`) that loads the saved JSON, calls `MiniSearch.loadJSON`, and asserts representative queries return expected slugs without rebuilding the index.

2. **Payload budget** — Enforce ≤1 MB gzipped target by omitting long-form `cleanDescriptionText` from storage (index-only fields do not need to be stored). Fail the build if the serialized file exceeds the budget.

3. **Determinism** — The build script must be pure and deterministic: same inputs produce identical `search-index.json`. Use sorted iteration, stable JSON serialization, and explicit locale-insensitive lowercasing.

---

## 4. Client Experience

1. **Loading strategy**
   - Global Search component (e.g., `src/components/search/GlobalSearch.tsx`) remains dormant until the user focuses/taps the search input.
   - On first focus, fetch `/search-index.json`, hydrate MiniSearch with `loadJSON`, and cache the hydrated instance in memory (and optional `indexedDB`/`localStorage` if future versions need persistence).
   - Display a lightweight loading state (“Preparing search…”) while the index downloads.

2. **Query model**
   - Minimum 2 characters before issuing a search.
   - Treat four-digit numeric queries as year filters: boost results whose `yearFrom/yearTo` spans include the number.
   - Rank entity matches ahead of episodes/series when the query exactly matches an entity title or alias.
   - Support optional filter chips in the UI: selecting a People chip narrows results to hits whose metadata includes that person slug (same for Places). Chips read their labels from the curated registries to stay canonical.

3. **Result rendering**
   - Mixed list that groups results by type but keeps a single scroll context.
   - Episode rows show title, year span, parent series (if any), and People/Place pill snippets.
   - Series rows show series badge, summary snippet, and episode count.
   - Entity rows jump directly to `/people/[slug]`, `/places/[slug]`, or `/topics/[slug]` with a note (“Entity page • First appearance 44 BC”).
   - Every row emits `search_result_click` with `{ query, rank, type, slug, filters }`.

4. **Instrumentation**
   - `search_submit`: fired when the user presses Enter (or taps Go) with payload `{ query, result_count, filters }`.
   - `search_result_click`: fired on click/enter/Space activation.
   - `filter_chip_click`: payload includes `{ chip_type: 'person' | 'place', chip_slug, state: 'on' | 'off' }`.
   - All events routed through the existing analytics helper so GA4 tagging stays consistent.

5. **Accessibility**
   - Input labelled via `aria-label="Search episodes, series, and people"`.
   - Results list uses semantic `<ul>`/`<li>` with `role="listbox"` + `role="option"` if implementing custom keyboard navigation.
   - Keyboard shortcuts: Up/Down to move focus, Enter to open, Escape to close.

---

## 5. SEO, Privacy & Compliance

- **Robots** — `public/robots.txt` must include:
  ```
  User-agent: *
  Disallow: /search
  Disallow: /*?q=
  ```
  Keep other routes crawlable so entity pages capture organic traffic.
- **Meta** — `app/search/page.tsx` exports `metadata = { robots: { index: false, follow: false }, alternates: { canonical: '/search' } }` to prevent accidental indexing even if robots misconfigures.
- **Canonical Entities** — Entity result links reinforce the curated `/people`, `/places`, `/topics` URLs as the authoritative destinations.
- **Privacy** — Search queries are not persisted server-side; GA4 events remain anonymous and aggregated per existing policy in `/docs/environment.md`.

---

## 6. Technical Requirements & Open Questions

| Area | Requirement | Open Questions |
| --- | --- | --- |
| Build pipeline | Chain `npm run build:search` after the existing pipeline command. Fail CI if the script detects missing artefacts or exceeds payload budgets. | Should the command also run during `npm run dev`? (default: optional via flag to keep dev hot reload fast). |
| Runtime | Ensure search modal/component is tree-shaken from initial bundle unless enabled via `searchEnabled` feature flag. | Do we ship search in the first public release or feature-flag for staged rollout? |
| Internationalization | Index in lowercase ASCII with accent folding (matching slug rules) so diacritics do not block matches. | Future: add transliteration helpers for non-Latin queries? |
| Error handling | If `/search-index.json` fails to load, show inline error (“Search unavailable”) and log to GA4 with `search_error`. | None. |

---

## 7. Milestones

1. **Index builder complete** — Script outputs deterministic JSON and unit tests green.
2. **Client feature complete** — Global Search renders results, filters operate, analytics fire in Storybook/dev.
3. **SEO safeguards landed** — robots + `noindex` metadata merged.
4. **Launch review** — Verify payload size, mobile performance (Lighthouse), and analytics dashboards before enabling feature flag (if used).

---

## 8. Implementation Plan (2025-11-13)

### 8.1 Build-Time Index Generation
- Add `scripts/build-search-index.ts` that loads `public/episodes.json`, `public/series.json`, and the curated entity registries via the existing catalog helpers. The script normalises IDs/slugs, builds a MiniSearch instance with weighted fields (title 10, summary 4, keywords 3, description 1), and emits deterministic documents for:
  - **Episodes** – include slug, title, summary, series meta, year range, part badge, trimmed people/place/topic slug arrays, and keyword unions (title tokens, description highlights, entity aliases).
  - **Series** – include slug, title, narrative summary, episode count, year range, and aggregated entity keywords.
  - **Entities** – pull straight from the registries with aliases + notes.
- Serialise the ready-to-query index via `MiniSearch.saveJSON` to `public/search-index.json` plus a companion metadata file (counts + SHA hash). Fail the script if the gzipped payload exceeds 1 MB to guard mobile performance.
- Ship unit coverage that loads the saved JSON, hydrates MiniSearch, and asserts representative queries (e.g., “Nelson”, “1066”) return deterministic slugs.
- Hook the script into npm as `build:search` and document the workflow (`npm run dev:pipeline && npm run build:search`). CI should run the script (with the gzip budget enforced) after pipeline plan mode so PRs fail fast if the index build or size check fails.

### 8.2 Client Overlay & Lazy Loading
- Create a search index hook (`src/lib/search/useSearchIndex.ts`) that dynamically imports MiniSearch, fetches `/search-index.json`, caches the hydrated instance, and exposes `prime()` + `search(query, filters)` APIs. Handle errors with retries and fire the `search_error` GA event.
- Build a reusable overlay in `src/components/search/` comprised of:
  - `SearchOverlay` shell with focus trap, ESC handling, and responsive layouts (full-screen on mobile, centered panel on desktop).
  - `SearchInput` pill control with clear button, minimum query enforcement, and `search_submit` instrumentation.
  - `SearchFilterChips` for people/place/topic filters (single-select per type) that emit `filter_chip_click`.
  - `SearchResults` list that mixes episodes/series/entities with badges, year spans, and pill snippets; keyboard navigation (Up/Down, Enter) and `search_result_click` telemetry.
- Lazy mount the overlay via `next/dynamic`/`useSearchOverlay` so no additional JS is loaded until the user triggers search.

### 8.3 Global Triggers & Layout Integration
- Add a slim “utility” top bar (light beige) rendered through `LayoutDetail`/`app/layout.tsx` so every major page shows a left-aligned “← Timeline” link and a right-aligned search trigger button (icon-only on mobile, pill with label on desktop). Trigger opens the overlay and focuses the shared input.
- Update the timeline/homepage hero: treat the hero as a responsive two-column layout on desktop with the latest-episode card on the right. Place a pill-style search input directly under that card (or stacked below the hero content on mobile). This input is a trigger only—clicking/tapping it opens the overlay.
- Ensure the overlay trigger also appears on entity pages by virtue of the shared top bar; no per-page duplication.

### 8.4 Analytics & QA
- GA4 events (paused until global instrumentation is live):
  - `search_submit` (payload `{ query, result_count, filters }`).
  - `search_result_click` (payload `{ query, rank, type, slug, filters }`).
  - `filter_chip_click` (payload `{ chip_type, chip_slug, state }`).
  - `search_error`.
- Add accessibility polish: `aria-label` on the input (“Search episodes, series, people, places, topics”), `role="dialog"` on the overlay, `role="listbox"`/`role="option"` for results, ESC closes overlay, focus returns to the trigger.
- Validate bundle impact (overlay bundle stays out of the critical path), confirm search-index fetch remains ≤1 MB gzipped, and run Lighthouse on mobile after integration.

---

## 9. References
- `docs/PRD-UI.md` — high-level Vault UI specification.
- `docs/PRD-Pipeline.md` — describes artefact generation that feeds the index.
- `docs/PRD-UI-DetailViews.md` — describes episode/series detail requirements consumed by search results.
- `docs/DATA_MODEL.md` — authoritative schema for episode/series payloads.
