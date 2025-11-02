# The Rest Is History Explorer — UI PRD (v1)

Last updated: 2025-10-30  

---

## 1. Product Snapshot

**Goal**  
Make it effortless to “see the show as history”: a mobile-first vertical timeline for browsing, fast full-text search for discovery, and clean deep links to each series or episode.

**Primary Users**
- *Die-hard listeners* — recall favourite arcs, browse multi-part series, jump to specific instalments.
- *New listeners* — discover an approachable starting arc without endless podcast-app scrolling.

**Success Metrics (first 2 weeks post-launch)**
- ≥50% of sessions scroll past three decade markers on the timeline.
- ≥25% of sessions use search.
- ≥20% of sessions click through to a series or episode detail view.
- ≥5% share click-through rate from Twitter/OG previews (baseline for later OG image work).

---

## 2. Scope

**In v1**
- Mobile-first vertical timeline on `/` combining `public/series.json` and `public/episodes.json`.
- Undated items pinned in a dedicated “Undated” section.
- Mixed client-side search (episodes + series) with People/Places facet chips (no type filter).
- Series detail pages (`/series/[slug]`) with narrative summaries and part lists.
- Episode detail pages (`/episode/[slug]`) with audio playback, people/places chips, and breadcrumbs.
- Deterministic slugs emitted during composition, plus `public/slug-registry.json`.
- Canonical URLs, sitemap, robots.txt, JSON-LD metadata, GA4 event instrumentation.
- Twitter/OG summary card (no custom image in v1).

**Out of Scope (defer or post-v1)**
- Rich OG images.
- Server-side or hosted search engine.
- Advanced filters (themes, regions, timelines).
- Apple/Spotify canonical links (fallback to store search URLs).
- Personalized recommendations.

---

## 3. Data Inputs & Determinism

**`public/episodes.json`** (sorted by `publishedAt`)  
Fields: `id`, `slug`, `cleanTitle`, `cleanDescriptionText`, `audioUrl`, `keyPeople[]`, `keyPlaces[]`, `keyThemes[]`, `seriesId`, `yearFrom`, `yearTo`, `part`.

**`public/series.json`** (sorted by first member date)  
Fields: `id`, `slug`, `seriesTitle`, `narrativeSummary`, `episodeCount`, `episodeIds[]`, `yearFrom`, `yearTo`.

**`public/slug-registry.json`**  
Map of `{ [slug]: { type: "episode" | "series", id } }` produced by the composer. Enforces global slug uniqueness.

Composition ensures slugs are deterministic and consistent across runs; registry collisions are resolved predictably.

---

## 4. Information Architecture & Routing

| Route | Purpose | Notes |
| --- | --- | --- |
| `/` | Timeline home | Mobile-first vertical spine with sticky decade markers. |
| `/series/[slug]` | Series detail | Narrative, year span chip, ordered list of parts. |
| `/episode/[slug]` | Episode detail | Title, part badge, audio player, chips, description. |

Series pages link to their constituent episodes via `/episode/[episodeSlug]`. No nested routes in v1.

---

## 5. Slug Strategy (Programmatic, Deterministic)

**Episodes**
1. Base anchor derived from the last word of the first `keyPeople` entry; fallback to `seriesKey` or `trih`.
2. Augment with a short location/theme anchor (place > theme > cleanTitle tokens; remove leading numerals).
3. Disambiguate via suffixes in order: `-pt{N}`, `-{yearFrom}`, `-v{N}`.

**Series**
1. Use 2–3 words from `seriesKey` or `seriesTitle` (`nelson-wars`, `modern-olympics`, etc.).
2. Apply the same registry-based suffixing when collisions occur.

Composer writes the chosen slug onto each record and updates the registry atomically.

---

## 6. Timeline Experience (Home)

- Vertical spine with decade/century markers (markers sticky as the list scrolls).
- **Series cards**: title, part-count badge, optional year-span chip; expands inline to list parts with direct links.
- **Episode cards**: compact card/dot with title; links to episode detail.
- **Gap markers**: large empty spans collapse to a spine-mounted vertical ellipsis button; accessible labels announce the skipped years and the gap expands on click.
- BCE support: negative `yearFrom`/`yearTo` render with `BC` suffixes (e.g. “264 BC – 216 BC”).
- Ordering rules:
  - Series sorted by `min(yearFrom)` ascending, ties broken by `max(yearTo)` then `seriesTitle`.
  - Standalone episodes sorted by `yearFrom` / `yearTo`; ties break on `cleanTitle`.
  - Items lacking year ranges appear under “Undated” beneath the hero section, ordered by `publishedAt`.
- Virtualised list (e.g., `react-virtuoso` or `react-window`) remains a stretch goal once we exceed a few hundred rows.
- Keyboard navigation follows timeline order; focus states clearly visible.

---

## 7. Visual System: Era Themes & Illustrations

### Overview

The timeline’s visual language shifts as users progress through history. Each era applies its own palette, typography accent, and lightweight illustration so the experience feels like moving through design epochs rather than a single static UI. Transitions are data-driven from a central configuration and blend smoothly in the scroll direction.

### Goals

- Reinforce the sense of time passing via evolving but harmonious visuals.
- Keep transitions light and performant (color morphs, no layout jumps, minimal paints).
- Centralise theming in `eras.ts` so design tokens and illustrations are editable without code churn.
- Use subtle pencil-style illustrations that add depth while preserving text contrast and readability.

### Era Breakdown (targeted for v2 visual pass)

| # | Era | Years | Visual Mood | Illustration Motif (pencil sketch) |
| --- | --- | --- | --- | --- |
| 1 | Ancient Civilisations | 3000 BC – 476 AD | Marble, parchment, empire | Ionic column, chariot, ancient galley |
| 2 | Early Medieval (Dark Ages) | 477 – 1000 | Monastic manuscript | Candle, quill, simple cross motif |
| 3 | High Medieval / Gothic | 1000 – 1492 | Cathedral & heraldry | Castle silhouette, stained-glass rose |
| 4 | Renaissance & Discovery | 1493 – 1650 | Mapmaker aesthetic | Caravel ship, compass rose |
| 5 | Enlightenment & Revolutions | 1651 – 1789 | Diagrams, salons, reason | Telescope, astrolabe |
| 6 | Industrial Revolution (Early) | 1790 – 1850 | Steam & invention | Steam locomotive, gear, smokestack |
| 7 | Victorian / Belle Époque | 1851 – 1914 | Ornate poster art | Wrought-iron ornament, early camera |
| 8 | Interwar / Early Modernism | 1915 – 1945 | Bauhaus geometry | Radio tower, geometric grid |
| 9 | Postwar Modern (Mid-Century) | 1946 – 1970 | Magazine minimalism | Jet, television, space rocket |
| 10 | Late 20th Century (Digital Dawn) | 1971 – 1990 | Analog → digital transition | Cassette tape, pixel grid |
| 11 | Early Internet / Win95 Era | 1991 – 2008 | Nostalgic beige UI | CRT monitor, floppy disk, mouse |
| 12 | Contemporary / Streaming Age | 2009 – Today | Flat, neon minimalism | Cloud, fibre-optic arcs |

### Illustration Workflow

1. **AI concept pass** — Generate base pencil-style sketches (DALL·E, Midjourney, etc.) using prompts in a Tolkien map aesthetic. Keep outputs centred, white background, minimal shading.
2. **Manual cleanup** — Process in Canva (or equivalent): remove background, adjust contrast, crop to 1024×1024, export transparent SVG (preferred) with PNG fallback. Naming convention: `public/illu/<era-key>.svg`.
3. **Texture pairing** — Produce subtle paper/linen textures per era (`public/tx/<era-key>.webp`) for optional overlay, tuned for 0.2–0.3 opacity.

### Technical Implementation

- `src/ui/eras.ts` exports an ordered array of era configs:

```ts
export const ERAS = [
  {
    key: 'industrial',
    start: 1790,
    end: 1850,
    tokens: {
      bg: '#F6F1E8',
      ink: '#2A2622',
      accent: '#9A5F3E',
      texture: '/tx/industrial.webp',
      illustration: '/illu/industrial.svg',
      fontFamily: 'var(--font-serif)'
    }
  },
  // …
];
```

- The active era is derived from the current timeline waypoint (IntersectionObserver or scroll listener). CSS custom properties (`--bg`, `--ink`, `--accent`, `--texture`, `--illustration`) tween between eras with a 300–500 px overlap to avoid hard cuts.
- A single fixed overlay element renders texture + illustration layers:

```css
.app-texture::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image: var(--texture), var(--illustration);
  background-repeat: repeat, no-repeat;
  background-size: cover, min(900px, 70vw) auto;
  background-position: center, right 8% bottom 12%;
  opacity: var(--texture-opacity, 0.25);
  mix-blend-mode: multiply;
  transition: background-image 260ms ease, opacity 200ms ease;
}
```

- Fonts shift only at era boundaries; specify fallback stacks to avoid flashes.
- Support dark mode by extending tokens with `dark` variants while keeping illustration linework legible (adjust opacity or invertation on demand).
- Preload illustration assets to avoid fetch jank; clamp file size (<200 KB) to maintain initial load performance.

### Design Tone

- Illustrations act as faint artefacts—present but never overpowering timeline content.
- Transitions should feel “buttery” and storybook-like; aim for eased color interpolation rather than instantaneous swaps.
- Ensure WCAG contrast for all text/card states regardless of background tint.

### Deliverables

- Era config file with colour/typography/asset tokens for all 12 eras.
- 12 cleaned transparent illustrations (SVG + PNG fallback).
- 12 subtle textures (WEBP), or confirmed decision to reuse a single neutral texture.
- Implementation of the IntersectionObserver + CSS variable theming system.
- QA on mobile and desktop to verify performance, contrast, and scroll behaviour.

---

## 8. Search Experience (SERP)

- Single omnibox; queries match title, description, people, places, themes, and series titles.
- Results interleave series and episodes with a badge (“Series” / “Episode”).
- Optional facet chips for People and Places; toggling chips filters results client-side.
- Client-only search index using `minisearch` (preferred) or `Fuse.js`.
  - Indexed fields: `cleanTitle`, `cleanDescriptionText`, `seriesTitle`, `keyPeople`, `keyPlaces`, `keyThemes`.
  - Field boosts: title ×4, keyPeople ×3, keyPlaces ×2, others ×1.
- Analytics on search submissions and result clicks.

---

## 9. Detail Views

**Episode**
- Title + optional “Part N” badge.
- People and Places chips (linking back to filtered search in post-v1 roadmap).
- Summary: short teaser (~160–200 chars) above the fold; full clean description below.
- Embedded HTML5 audio player (`<audio controls src={audioUrl}>`).
- Breadcrumb to series (if applicable) and prev/next navigation within the same series.

**Series**
- Title, narrative summary, episode count, optional year-span chip.
- Ordered list of parts with publication years and part badges.
- CTA to scroll timeline back to the series position (deep link anchor).

Accessibility: provide `aria-expanded` for collapsible sections, descriptive button labels, and ensure screen-reader ordering follows the visual layout.

---

## 10. SEO & Sharing

- Canonical URL per page (`/episode/[slug]`, `/series/[slug]`).
- `twitter:card=summary` (no image in v1).
- Open Graph:
  - `og:title`: `The Rest Is History — {cleanTitle}` or `TRIH Series — {seriesTitle}`.
  - `og:description`: first high-quality sentence (≤160 characters).
- JSON-LD:
  - Episodes as `PodcastEpisode` with `partOfSeries`.
  - Series as `CreativeWorkSeries`.
- `robots.txt` allows all crawlers.
- Sitemap generated from `public/slug-registry.json` either during publish or via `/sitemap.xml`.

---

## 11. Performance & Technical Notes

- Client fetches `public/episodes.json`, `public/series.json`, and `public/slug-registry.json` once; leverage CDN caching.
- Trim index payload (only store fields required for search) to keep bundle sizes manageable.
- Static generation with Incremental Static Regeneration (ISR):
  - `generateStaticParams` reads `slug-registry.json` for pre-render.
  - `revalidate` ~300 s for detail pages, or on-demand revalidation triggered by pipeline publish.
- Long-cache immutable assets; bust via filename hashing when necessary.
- Target Core Web Vitals budgets; avoid layout shift by reserving space for timeline elements.

---

## 12. Analytics (GA4)

- `timeline_scroll_depth` (25 / 50 / 75% markers).
- `search_submit` and `search_result_click`.
- `filter_chip_click` (People/Places).
- `open_series`, `open_episode`.
- `audio_play`.

Integrate via GA4 gtag events with consistent parameters (`content_type`, `content_id`, etc.).

---

## 13. Build & Deploy (Vercel)

- Next.js App Router, static-friendly architecture.
- ISR or on-demand revalidation for detail pages.
- Scheduled GitHub Actions pipeline commits refreshed JSON artefacts to `main`, then calls the Vercel revalidation webhook; deployments pick up changes automatically.
- Ensure environment variables (GA4 measurement ID, etc.) are provisioned in Vercel.
- Monitor build size and ensure JSON artefacts remain below Vercel’s 10 MB edge limit per file.

---

## 14. v1 Ship Checklist

- [ ] Composer emits slugs for all episodes/series and writes `public/slug-registry.json`.
- [ ] Timeline home (`/`) with expandable series and undated section.
- [ ] Client search with People/Places facet chips.
- [ ] Series and episode pages with metadata, audio embed, breadcrumbs.
- [ ] Canonicals, sitemap/robots, JSON-LD metadata.
- [ ] GA4 events wired for timeline, search, detail interactions.
- [ ] ISR/on-demand revalidation path documented and integrated with pipeline.
- [ ] Smoke tests on mobile viewports and screen readers (VoiceOver/NVDA).

---

## 15. Risks & Mitigations

- **Large JSON payloads** — mitigate via virtualised lists and trimmed search index; escalate to server-driven search if growth demands.
- **Missing year ranges** — dedicated “Undated” section keeps ordering deterministic; consider LLM-assisted backfill in future iterations.
- **Slug collisions** — `slug-registry.json` and deterministic resolver enforce uniqueness; add unit tests around collision cases.
- **Asset-less sharing** — rely on text-only summary card for v1; roadmap includes `/api/og` endpoint for richer previews.

---

## 16. Roadmap (Post-v1)

1. Dynamic OG image endpoint (`/api/og`) for richer link previews.
2. Additional filters (themes, regions) and chip-linking from detail pages.
3. Server-side search (Meilisearch/Typesense) if dataset outgrows client index.
4. Apple/Spotify canonical link resolver service.
5. Timeline “mini-map”, random episode button, lightweight favourites (local storage).

---

## 17. Open Questions

- Who owns ongoing GA4 analysis and reporting post-launch?
- Do we need a privacy notice or cookie banner when GA4 goes live?
- Should undated items also surface an inferred year if LLM enrichment suggests one?
- What is the minimum acceptable accessibility score (e.g., Lighthouse ≥90) before launch?
