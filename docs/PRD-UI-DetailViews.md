# TRIH Vault — Detail Views Implementation Notes

_Last updated: 2025-11-02_

This document bridges the brainstorming spec for Episode, People, and Places pages with the current repository state. It confirms what data already exists in `public/*.json`, calls out missing prerequisites (e.g., slugs, indexes), and outlines an implementation plan that keeps the discovery-first UX intact without overreaching the data we have today.

---

## 1. Data Reality Check (2025-10-30 artefacts)
- `public/episodes.json` (639 records) already ships `cleanTitle`, `cleanDescriptionMarkdown/Text`, `descriptionBlocks`, `audioUrl`, `keyPeople[]`, `keyPlaces[]`, `keyThemes[]`, `keyTopics[]` (coming soon), `seriesId`, `part`, `yearFrom`, `yearTo`, `yearConfidence`, `publishedAt`, and `itunesEpisode`.
- Coverage snapshots:
  - 530 episodes include ≥1 `keyPeople`; 596 include ≥1 `keyPlaces`.
  - 450 episodes provide both `yearFrom` and `yearTo`; year confidence is currently `low`/`unknown` (no `high` values yet).
  - 325 episodes belong to a `seriesId`; others are stand-alone.
- `public/series.json` (97 records) includes `seriesId`, `seriesTitle`, `narrativeSummary`, `episodeIds[]`, `memberEpisodeFingerprints[]`, `yearFrom/To`, `yearConfidence`.
- There is **no slug field** emitted yet for episodes, series, people, or places. `seriesId` values are URL-friendly (`the-world-cup-of-gods-20210531`) but episode IDs remain UUIDs.
- Artefacts do not include external platform links (Spotify, Apple, etc.); only the canonical `audioUrl`.
- There is no `public/slug-registry.json` yet; App Router currently imports JSON directly (`app/page.tsx`).

Implication: the brainstormed UX is mostly supported, but we need deterministic slugs (and probably a registry) plus a handful of helper indexes before implementing the pages.

---

## 2. Slugs & Routing Prerequisites
- **Episodes & series:** adopt the V7 deterministic strategy (series handle + subtitle tokens + optional `ptN`, four-token cap). We need the shared helpers (`slugify`, stop words, domain topics) and generators described in the implementation plan so every artefact has an associated slug before we wire up pages.
- **Interim helpers:** until the pipeline emits slugs, add a build-time slug registry (`public/slug-registry.json`) produced by a script that reads `public/episodes.json` / `public/series.json`, applies the V7 rules, and resolves collisions with stable suffixes.
- **Routing:** the registry drives `generateStaticParams` and runtime lookups; `/episode/[slug]` and `/series/[slug]` must read from it (with a temporary UUID fallback during transition).
- **People & places:** display labels still need simple slugification for index pages. Reuse the same helper so all slug generation stays consistent; maintain bi-directional maps (`slug ↔ label`) when building indexes to avoid collisions (`-v2`, etc.).

---

## 3. Episode Page (`/episode/[slug]`) Outline

Data sources: one `PublicEpisode`, matching `PublicSeries` (optional), plus prebuilt indexes for people/place relationships and similarity scoring.

Implementation checklist:
- **Hero & summary**
  - Hero shows title + first paragraph of `cleanDescriptionMarkdown`. Longer copy collapses behind a “Read more” toggle that reveals promos/sponsor text inline.
  - When an episode belongs to a series, include a subtle inline note (“From the {seriesTitle} arc”) under the hero.
  - Format publish date via shared `formatDate(publishedAt)`. Year range chip uses `formatYearRange(yearFrom, yearTo)`, falls back to publish year.
- **Series context (conditional)**
  - If `seriesId` exists, surface a prominent CTA (e.g., inline banner or pill) near the header that links to the parent Series page and calls out the current `part` / total parts.
  - Include the series card inside “Connected Threads” even when the episode belongs to it, so the loop remains obvious.
- **Highlight & summary**
  - Use the first meaningful sentence from `descriptionBlocks` as the highlight (it is already split by the programmatic cleanup).
  - Render `cleanDescriptionMarkdown` inside a `prose` container with a `CollapsibleText` component that auto-collapses beyond ~320 words and exposes “Show more”.
- **Quick Facts**
  - Definition-list style component fed by `yearFrom`/`yearTo`, `yearConfidence`, `keyPeople`, `keyPlaces`, `keyTopics`, `seriesTitle`.
  - Show `part` only when `seriesId` exists; omit for standalone episodes. Drop `itunesEpisode` from surfaced UI unless debugging requires it.
  - Each person/place uses `PillLink` to `/people/[slug]` or `/places/[slug]`. Hide sections when arrays are empty.
- **Connected Threads**
  - Time: link to `/timeline?from={yearFrom}&to={yearTo}` once that filter view exists. Until then, link to `/` with query params we can read later.
  - People/Places/Series reuse the same pill components so there are no dead-ends.
  - “In This Series” list doubles as a mini navigator; add “Jump to Part N” anchors or visually distinct markers for accessibility.
- **Audio player**
  - Native `<audio controls src={audioUrl}>` with labelled fallback (e.g., `aria-label="Play Trailer"`).
  - Offer download link beneath if we want to support long-press.
- **Related Episodes**
  - Use `scoreRelatedEpisodes` helper:
    - Score = `(sharedPeople * 3) + (sharedPlaces * 2) + (sameEra ? 1 : 0)`.
    - `sameEra` true when ranges overlap (treat null ranges as `publishedAt` year).
    - Pool: same series episodes first, then global episodes filtered to those sharing at least one person/place; limit to 3–6 cards.
  - Render `EpisodeCard` with title, year badge, series badge, short description snippet.
  - If the scorer returns fewer than three recommendations, show a friendly placeholder (“More recommendations coming soon”) so the section never feels empty.
- **Find & Listen**
  - Provide direct links: official site episode list, Apple Podcasts show, Spotify show, YouTube podcast feed.
  - Include descriptive `aria-label`s for each button to aid screen readers.
  - Optional: add a download link to `audioUrl` if desired.
- **Keep Exploring**
  - Compute “previous/next in time” by sorting all episodes by `midYear` (fallback to publish year) and finding neighbours.
  - Provide quick era jump buttons if the episode spans a configured range (e.g., `getEraSegments(midYear)` from timeline config).
  - Add a “View on timeline” CTA that deep-links back to the home timeline (query params until dedicated routes exist).

Graceful degradation: if `keyPeople`/`keyPlaces` missing, collapse the associated sections; if both years null, replace the context line with `Set by publish date`.

---

## 4. Series Page (`/series/[seriesId]`) Outline

Data sources: one `PublicSeries`, the set of `PublicEpisode` records referenced in `episodeIds`, plus shared indexes for people/place aggregates.

Implementation checklist:
- **Header**
  - H1 uses `seriesTitle` (LLM generated via composer; see `src/pipeline/composer.ts:117-146`).
  - Subhead: `episodeCount`, optional year range chip from `yearFrom`/`yearTo` + `yearConfidence`.
  - Render `narrativeSummary` as the hero paragraph; fall back to a deterministic title-derived sentence if LLM data is missing.
  - Hero mirrors the episode layout (no breadcrumbs) with the same inline “Read more” treatment for long descriptions and a footer “Back to timeline” pill.
- **Quick Overview**
  - “At a glance” pill list summarises key people/places aggregated across the series (top N from combined episode metadata) using the same layout as the episode detail page.
  - Clamp the default display (e.g., show first 6 chips) with “+ more” expanders to avoid overwhelming the hero.
  - Include “Listen to latest episode” CTA linking to the most recent `publishedAt` entry within the series, plus a complementary “Start at Part 1” CTA for new listeners.
  - “View full arc on timeline” should link to `/` with query params until timeline filters ship; flag it as TODO for dedicated routes.
- **Episode List**
  - Ordered list grouped either by publication order or chronological order (choose whichever better mirrors timeline expectations; default to chronological using `formatYearRange`).
  - Each item shows part badge (if present), `cleanTitle`, year badge, short snippet (first sentence from `descriptionBlocks`), and links directly to the episode detail card.
  - Provide quick filters/toggles for chronological vs. publish order when useful.
  - Respect deep-link context: when navigated from an episode detail, auto-scroll or highlight the matching part.
- **Connected Threads**
  - Time: link to timeline range or `/timeline?seriesId=…` once filters exist.
  - People & Places: highlight top chips linking into respective pages.
  - Related Series: optional block using similarity heuristics (shared key people, overlapping years).
- **Meta**
  - Surface `episodeIds.length`, `seriesGroupingConfidence`, `rssLastSeenAt` for debugging (tuck behind `<details>` if not user-facing).
  - Provide “Back to timeline position” anchor target for future integration with the home page.

Graceful degradation: if `narrativeSummary` is `null`, use `seriesTitleFallback` (available in programmatic data) and compose a simple copy like “A multi-part arc exploring…”.

---

## 5. People Page (`/people/[slug]`) Outline

Data sources: person label ↔ slug map, aggregated index of episodes per person, optional co-occurrence stats.

Implementation checklist:
- **Index builder (`src/lib/indexes/people.ts`):**
  - Iterate `public/episodes.json` and build:
    ```ts
    interface PersonIndexEntry {
      label: string;
      slug: string;
      episodeIds: string[];
      seriesIds: Set<string>;
      coOccurrence: Map<string, number>;
      placeCounts: Map<string, number>;
    }
    ```
  - Persist derived counts (`episodeCount`, `seriesCount`) for quick display.
  - Precompute sorted episode metadata (title, series, year range, keyPlaces snippet) to avoid recompute on each render.
- **Page layout:**
  - Header: name + “Appears in N episodes (S series)”.
  - Sort controls: default by `yearFrom` (fallback to publish year). Secondary option: `publishedAt`.
  - Optional year-range filter: simple client-side slider or dual input.
  - Group episodes:
    - Primary grouping by series (`seriesId`) when available.
    - Standalone episodes grouped by decade bucket derived from `yearFrom`/`publishedAt`.
  - Each episode row uses `EpisodeCard` variant with place pills (first 1–2) and optional series badge.
- **Footer cross-links:**
  - “Frequently co-appears with” — top 3 co-occurring people by count; link to their pages.
  - “Places with this person” — top 3 `keyPlaces`; link to `/places/[slug]`.

Edge cases: some names appear in only one episode—ensure the page still renders with a simple list. Handle slug collisions deterministically when two names normalize to the same slug.

---

## 6. Places Page (`/places/[slug]`) Outline

Data sources: place index derived similarly to people.

Implementation checklist:
- **Index builder (`src/lib/indexes/places.ts`):**
  - Structure mirrors the person index but tracks `peopleCounts` instead.
  - Pre-bucket episodes into eras or centuries for quick group headers (`timeline` config already enumerates era ranges we can reuse).
- **Page layout:**
  - Header: place name + “Featured in N episodes”.
  - Filters: sort (historical vs. publish), optional series filter (dropdown built from the index’s `seriesIds`).
  - Grouping: display episodes under century/era headings based on `yearFrom` (fallback to publish year).
  - Episode row: title, year badge, people pills (first 1–2), series badge, link to detail.
- **Footer cross-links:**
  - “Nearby places” (if we maintain a manual adjacency map; otherwise surface parent region heuristics by splitting hierarchical names like “Berlin, Germany” once such data exists).
  - “People frequently appearing here” — top 3 `peopleCounts`.

Data gap: we do not yet have a canonical hierarchy for places (no continent/country data). For v1, keep “Nearby places” optional or derive from shared prefixes until we have richer metadata.

---

## 7. Shared Utilities & Components
- `src/lib/data.ts`: centralizes JSON loading and exposes helpers like `getAllEpisodes()`, `getEpisodeBySlug()`, `getPeopleIndex()`. Use synchronous `import` for build-time availability and re-export plain objects so dynamic routes can run in the edge runtime if needed.
- `src/lib/slugify.ts`: string normalizer used for people/place slugs and interim episode slugs.
- `src/lib/similar.ts`: exports `scoreRelatedEpisodes`, `rangesOverlap`, `midYear`, `sortEpisodesChronologically`.
- Components to build (can live in `src/components/`):
  - `PillLink` — anchor styled as pill with variant colors.
  - `EpisodeCard` — compact card for related episodes/list rows.
  - `QuickFacts` — definition list wrapper.
  - `CollapsibleText` — summary expander using `useState` + CSS clamp.
  - `RelatedRow` — horizontal scroll list or responsive grid.
  - `FindAndListen` — CTA block generating platform search URLs.
- Consider a `LayoutDetail` wrapper that injects consistent spacing and the persistent “Back to timeline” link (breadcrumbs intentionally removed).

Performance: indexes can be generated once at module scope since artefacts are static; avoid reprocessing on each request. If bundle size grows, gate heavy computation behind `process.env.NEXT_RUNTIME !== "edge"` or precompute JSON at publish time.

---

## 8. Data Prep & Open Questions
- [x] Extend composer to emit deterministic slugs for episodes/series and a `slug-registry.json`. (`npm run dev:pipeline` now writes the registry automatically.)
- [ ] Decide whether `keyPeople` / `keyPlaces` arrays need manual curation (dedupe aliases like “US” vs “United States”) before exposing pages backed by the raw strings.
- [ ] Year ranges lack high-confidence flags; consider a UI treatment (e.g., tooltip when confidence ≠ `high`) and optionally run another LLM pass to tighten ranges.
- [ ] External platform links: confirm whether we want to maintain canonical URLs per episode or continue linking to search results.
- [ ] Timeline filters: confirm plan for `/timeline?from=&to=` or dedicated `/timeline/[range]` view so “Connected Threads → Time” links have a destination.
- [ ] People/Places taxonomy size (704 unique people, 599 unique places) is manageable but may need client-side virtualization for slower devices; monitor once implemented.

---

## 9. Next Steps
1. ~~Implement slug helpers + temporary registry loader; wire `generateStaticParams` for `/episode/[slug]`, `/series/[seriesId]`, `/people/[slug]`, `/places/[slug]`.~~ Done — V7 helpers in `src/lib/slug/*`, registry builder `scripts/build-slug-registry.ts`, and lookup/server utilities and tests are ready for the upcoming routes.
2. Build shared indexes (`people`, `places`, series aggregates) and similarity scoring utilities.
3. Scaffold all four detail pages with placeholder layouts, then fill in components iteratively.
4. ~~Backfill composer work so the pipeline emits slugs and registry artefacts, replacing interim helpers.~~ Done — pipeline + scheduled publish now keep `public/slug-registry.json` in sync.
5. QA data edge cases (missing years, empty arrays) and add Vitest coverage for slug collisions, similarity scoring, and series aggregations.

Once these steps land, we can layer on timeline filters / map-like interactions without reworking the core detail views.
