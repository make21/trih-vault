# The Rest Is History — Enrichment Pipeline

This repository hosts a minimal, deterministic data pipeline for enriching *The Rest Is History* podcast feed. The system ingests the public RSS feed, normalises new episodes incrementally, and derives structured series/topic metadata ready for deployment.

## Commands

| Command | Description |
| --- | --- |
| `npm run fetch` | Pass A – download the latest RSS snapshot and append any newly published episodes. |
| `npm run enrich` | Passes B–D – derive episode years, consolidate series, and name topics. |
| `npm run validate` | Run contract checks ensuring the generated JSON artefacts remain consistent. |

## Data Outputs

Generated files live under `public/`:

- `episodes.json` – episode leaf nodes used by downstream consumers
- `series.json` – ordered series groupings referencing topic IDs
- `topics.json` – high-level topics containing their series

Caching for LLM prompts is persisted under `data/cache/` so repeated runs remain deterministic.

## Environment

Provide API credentials (e.g. `OPENAI_API_KEY`) through the runtime environment. A sample file is available at `.env.local.sample` – do **not** commit real keys.

## Development Notes

- When network access is unavailable the fetch script falls back to the bundled sample feed (`data/source/rss.sample.xml`). This ensures repeatable local runs while still exercising the incremental pipeline.

## Deployment

The GitHub Actions workflow at `.github/workflows/enrich.yml` executes the full pipeline daily and on pushes to `main`, keeping JSON artefacts fresh without manual intervention.
