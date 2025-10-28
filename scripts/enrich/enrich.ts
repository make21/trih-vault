import fs from "fs";
import path from "path";
import { z } from "zod";
import {
  CachedInference,
  EnrichedEpisode,
  EnrichedEpisodeSchema,
  Episode,
  EpisodeSchema,
  EnrichmentSummary,
  InferenceCache,
  InferenceCacheSchema,
  Collection,
  CollectionsSchema,
  UmbrellaSummary,
  UmbrellaSummarySchema,
} from "./types";
import { detectSeries, SeriesAssignment } from "./series";
import { createLLMClient, LLMClient, LLMInput } from "./llm";
import { loadCenturyMap, centuryLabelToRange } from "./century";
import { average, clamp, median, slugify } from "./utils";
import { sanitizeUmbrellas } from "./umbrellas";

const EPISODES_PATH = ["public", "episodes.json"];
const COLLECTIONS_PATH = ["public", "collections.json"];
const UMBRELLAS_PATH = ["public", "umbrellas.json"];
const CACHE_PATH = ["data", "inference-cache.json"];

const LOW_CONFIDENCE_THRESHOLD = 0.55;

export interface EnrichOptions {
  rootDir?: string;
  dryRun?: boolean;
  refresh?: boolean;
  onlySlug?: string | null;
  verbose?: boolean;
  cacheOnly?: boolean;
  llmClient?: LLMClient | null;
  logger?: Pick<typeof console, "log" | "warn" | "error">;
}

export interface EpisodeState {
  base: Episode;
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
  inference?: CachedInference | null;
  centuryLabel: string | null;
}

export interface EnrichResult {
  episodes: EnrichedEpisode[];
  collections: Collection[];
  umbrellas: UmbrellaSummary;
  cache: InferenceCache;
  summary: EnrichmentSummary;
}

function resolvePath(rootDir: string, segments: string[]): string {
  return path.join(rootDir, ...segments);
}

function readJsonArray<T>(filePath: string, schema: z.ZodType<T>): T {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return schema.parse(parsed);
}

function loadEpisodes(rootDir: string): Episode[] {
  const filePath = resolvePath(rootDir, EPISODES_PATH);
  const schema = z.array(EpisodeSchema);
  return readJsonArray(filePath, schema);
}

function loadCache(rootDir: string): InferenceCache {
  const filePath = resolvePath(rootDir, CACHE_PATH);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const result = InferenceCacheSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Inference cache at ${filePath} failed validation`);
  }
  return result.data;
}

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function sanitizeYear(value: number | null): number | null {
  if (value === null || value === undefined) return null;
  if (Number.isNaN(value)) return null;
  if (value < 0 || value > 2100) return null;
  return value;
}

export function applyCenturyFallback(state: EpisodeState) {
  if (!state.centuryLabel) return;
  const range = centuryLabelToRange(state.centuryLabel);
  if (!range) return;
  state.yearFrom = range.from;
  state.yearTo = range.to;
  state.yearPrimary = Math.round((range.from + range.to) / 2);
  state.scope = range.from === range.to ? "point" : "range";
  state.confidence = 0.4;
  state.source = state.source ? "mixed" : "century";
}

export function applySeriesSmoothing(states: EpisodeState[]) {
  const byKey = new Map<string, EpisodeState[]>();
  for (const state of states) {
    if (!state.seriesKey) continue;
    const bucket = byKey.get(state.seriesKey) ?? [];
    bucket.push(state);
    byKey.set(state.seriesKey, bucket);
  }

  for (const episodes of byKey.values()) {
    const withYears = episodes.filter((episode) => episode.scope !== "broad" && (
      episode.yearPrimary !== null || episode.yearFrom !== null || episode.yearTo !== null
    ));
    if (!withYears.length) {
      continue;
    }
    const rangeStarts = withYears
      .map((episode) => (episode.yearFrom ?? episode.yearPrimary ?? null))
      .filter((value): value is number => value !== null);
    const rangeEnds = withYears
      .map((episode) => (episode.yearTo ?? episode.yearPrimary ?? null))
      .filter((value): value is number => value !== null);
    const primaryValues = withYears
      .map((episode) => {
        if (episode.yearPrimary !== null) return episode.yearPrimary;
        if (episode.yearFrom !== null && episode.yearTo !== null) {
          return Math.round((episode.yearFrom + episode.yearTo) / 2);
        }
        return null;
      })
      .filter((value): value is number => value !== null);

    const groupFrom = rangeStarts.length ? Math.min(...rangeStarts) : null;
    const groupTo = rangeEnds.length ? Math.max(...rangeEnds) : null;
    const groupMedian = median(primaryValues);
    const groupConfidence = average(
      withYears.map((episode) => (episode.confidence ?? LOW_CONFIDENCE_THRESHOLD))
    );

    for (const episode of episodes) {
      if (episode.scope === "broad") {
        continue;
      }
      let mutated = false;
      if (episode.yearFrom === null && groupFrom !== null) {
        episode.yearFrom = groupFrom;
        mutated = true;
      }
      if (episode.yearTo === null && groupTo !== null) {
        episode.yearTo = groupTo;
        mutated = true;
      }
      if (episode.yearPrimary === null && groupMedian !== null) {
        episode.yearPrimary = Math.round(groupMedian);
        mutated = true;
      }
      if (episode.yearFrom !== null && episode.yearTo !== null) {
        if (episode.yearFrom > episode.yearTo) {
          const swap = episode.yearFrom;
          episode.yearFrom = episode.yearTo;
          episode.yearTo = swap;
        }
        episode.scope = episode.yearFrom === episode.yearTo ? "point" : "range";
        if (episode.yearPrimary !== null) {
          episode.yearPrimary = clamp(episode.yearPrimary, episode.yearFrom, episode.yearTo);
        }
      }
      if (mutated) {
        episode.source = episode.source ? (episode.source === "series" ? "series" : "mixed") : "series";
      }
      if (episode.confidence === null && groupConfidence !== null) {
        episode.confidence = Math.min(Math.max(groupConfidence, 0), 1);
      }
    }
  }
}

function buildCollections(states: EpisodeState[]): Collection[] {
  const byKey = new Map<string, EpisodeState[]>();
  for (const state of states) {
    if (!state.seriesKey) continue;
    const bucket = byKey.get(state.seriesKey) ?? [];
    bucket.push(state);
    byKey.set(state.seriesKey, bucket);
  }
  const collections: Collection[] = [];
  for (const [key, episodes] of byKey.entries()) {
    const sorted = [...episodes].sort((a, b) => a.base.episode - b.base.episode);
    const years = sorted
      .map((episode) => [episode.yearFrom, episode.yearTo, episode.yearPrimary])
      .flat()
      .filter((value): value is number => value !== null);
    const minYear = years.length ? Math.min(...years) : null;
    const maxYear = years.length ? Math.max(...years) : null;
    collections.push({
      key,
      title: sorted[0]?.seriesTitle ?? key,
      count: sorted.length,
      episodes: sorted.map((episode) => episode.base.episode),
      slugs: sorted.map((episode) => episode.base.slug),
      parts: sorted.map((episode) => episode.seriesPart ?? 0),
      years: { min: minYear, max: maxYear },
    });
  }
  collections.sort((a, b) => a.key.localeCompare(b.key));
  return CollectionsSchema.parse(collections);
}

function buildUmbrellaSummary(states: EpisodeState[]): UmbrellaSummary {
  const index: Record<string, number[]> = {};
  for (const state of states) {
    for (const tag of state.umbrellas) {
      if (!index[tag]) {
        index[tag] = [];
      }
      index[tag].push(state.base.episode);
    }
  }
  for (const episodes of Object.values(index)) {
    episodes.sort((a, b) => a - b);
  }
  const counts: Record<string, number> = Object.fromEntries(
    Object.entries(index).map(([key, episodes]) => [key, episodes.length])
  );
  return UmbrellaSummarySchema.parse({ index, counts });
}

export function prepareState(episode: Episode, centuryLabel: string | null): EpisodeState {
  return {
    base: episode,
    seriesKey: null,
    seriesTitle: null,
    seriesPart: null,
    yearPrimary: null,
    yearFrom: null,
    yearTo: null,
    scope: "unknown",
    umbrellas: [],
    confidence: null,
    source: null,
    inference: null,
    centuryLabel,
  };
}

function mergeSeriesAssignment(state: EpisodeState, assignment: SeriesAssignment | undefined) {
  if (!assignment) return;
  state.seriesKey = assignment.key;
  state.seriesTitle = assignment.title;
  state.seriesPart = assignment.part;
}

function hydrateFromInference(state: EpisodeState, inference: CachedInference | null) {
  if (!inference) return;
  state.inference = inference;
  if (!state.seriesKey && inference.seriesTitle) {
    state.seriesKey = slugify(inference.seriesTitle);
  }
  if (!state.seriesTitle && inference.seriesTitle) {
    state.seriesTitle = inference.seriesTitle;
  }
  if (state.seriesPart === null && typeof inference.seriesPart === "number") {
    state.seriesPart = inference.seriesPart;
  }
  const acceptedConfidence = inference.confidence ?? null;
  let yearPrimary = sanitizeYear(inference.yearPrimary ?? null);
  let yearFrom = sanitizeYear(inference.yearFrom ?? null);
  let yearTo = sanitizeYear(inference.yearTo ?? null);
  let scope = inference.scope ?? "unknown";
  if (acceptedConfidence !== null && acceptedConfidence < LOW_CONFIDENCE_THRESHOLD) {
    yearPrimary = null;
    yearFrom = null;
    yearTo = null;
    scope = "unknown";
  }
  state.yearPrimary = yearPrimary;
  state.yearFrom = yearFrom;
  state.yearTo = yearTo;
  state.scope = scope;
  state.umbrellas = sanitizeUmbrellas(inference.umbrellas ?? []);
  state.confidence = acceptedConfidence;
  state.source = yearPrimary !== null || yearFrom !== null || yearTo !== null ? "llm" : state.source;
}

function finalizeState(state: EpisodeState): EnrichedEpisode {
  if (state.yearFrom !== null && state.yearTo !== null && state.yearFrom > state.yearTo) {
    const swap = state.yearFrom;
    state.yearFrom = state.yearTo;
    state.yearTo = swap;
  }
  if (state.yearFrom !== null && state.yearTo !== null && state.yearPrimary !== null) {
    state.yearPrimary = clamp(state.yearPrimary, state.yearFrom, state.yearTo);
  }
  return EnrichedEpisodeSchema.parse({
    ...state.base,
    seriesKey: state.seriesKey ?? null,
    seriesTitle: state.seriesTitle ?? null,
    seriesPart: state.seriesPart ?? null,
    yearPrimary: state.yearPrimary ?? null,
    yearFrom: state.yearFrom ?? null,
    yearTo: state.yearTo ?? null,
    scope: state.scope,
    umbrellas: state.umbrellas,
    confidence: state.confidence ?? null,
    source: state.source ?? null,
  });
}

export async function enrichEpisodes(options: EnrichOptions = {}): Promise<EnrichResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const refresh = options.refresh ?? false;
  const onlySlug = options.onlySlug ?? null;
  const verbose = options.verbose ?? false;
  const cacheOnly = options.cacheOnly ?? false;
  const logger = options.logger ?? console;

  const episodes = loadEpisodes(rootDir);
  const cache: InferenceCache = refresh ? {} : loadCache(rootDir);
  const centuryMap = loadCenturyMap(rootDir);
  const { assignmentsBySlug, groupsByKey } = detectSeries(episodes);

  const states: EpisodeState[] = episodes.map((episode) => {
    const centuryLabel = centuryMap.get(episode.episode) ?? null;
    const state = prepareState(episode, centuryLabel);
    const assignment = assignmentsBySlug.get(episode.slug);
    if (assignment) {
      mergeSeriesAssignment(state, assignment);
    }
    return state;
  });

  const cacheUpdates: InferenceCache = { ...cache };
  const llmNeeded: EpisodeState[] = [];

  for (const state of states) {
    if (onlySlug && state.base.slug !== onlySlug) {
      const cached = cache[state.base.slug];
      hydrateFromInference(state, cached ?? null);
      continue;
    }
    const cached = refresh ? null : cache[state.base.slug];
    if (cached) {
      hydrateFromInference(state, cached);
      continue;
    }
    if (cacheOnly) {
      continue;
    }
    llmNeeded.push(state);
  }

  let llmCalls = 0;
  let llmSkipped = 0;
  if (llmNeeded.length) {
    const apiKey = process.env.OPENAI_API_KEY;
    const activeClient = options.llmClient ?? (apiKey ? createLLMClient(apiKey) : null);
    if (!activeClient) {
      llmSkipped = llmNeeded.length;
      const hint =
        "Set OPENAI_API_KEY to enable live enrichment or rerun with --cache-only to avoid LLM calls.";
      logger.warn(
        `Skipping ${llmSkipped} LLM inference${llmSkipped === 1 ? "" : "s"} because OPENAI_API_KEY is not set. ${hint}`
      );
    } else {
      if (verbose) {
        logger.log(`Requesting inference for ${llmNeeded.length} episode(s)...`);
      }
      for (const state of llmNeeded) {
        const input: LLMInput = {
          title_feed: state.base.title_feed ?? null,
          title_sheet: state.base.title_sheet ?? null,
          description: state.base.description ?? null,
          seriesHint: state.seriesKey
            ? { seriesKey: state.seriesKey, seriesPart: state.seriesPart ?? undefined }
            : null,
          knownCenturyLabel: state.centuryLabel,
        };
        const inference = await activeClient.inferEpisode(input);
        llmCalls += 1;
        cacheUpdates[state.base.slug] = inference;
        hydrateFromInference(state, inference);
      }
    }
  }

  for (const state of states) {
    if (!state.yearPrimary && !state.yearFrom && !state.yearTo) {
      applyCenturyFallback(state);
    }
  }

  applySeriesSmoothing(states);

  const enrichedEpisodes = states.map((state) => finalizeState(state));
  enrichedEpisodes.sort((a, b) => a.episode - b.episode);

  const collections = buildCollections(states);
  const umbrellas = buildUmbrellaSummary(states);

  const unknownCount = states.filter((state) => state.scope === "unknown").length;
  const broadCount = states.filter((state) => state.scope === "broad").length;

  const summary: EnrichmentSummary = {
    totalEpisodes: states.length,
    totalSeries: groupsByKey.size,
    llmCalls,
    llmSkipped,
    lowConfidence: { unknown: unknownCount, broad: broadCount },
  };

  if (!dryRun) {
    writeJson(resolvePath(rootDir, EPISODES_PATH), enrichedEpisodes);
    writeJson(resolvePath(rootDir, COLLECTIONS_PATH), collections);
    writeJson(resolvePath(rootDir, UMBRELLAS_PATH), umbrellas);
    writeJson(resolvePath(rootDir, CACHE_PATH), cacheUpdates);
  }

  if (verbose) {
    logger.log(
      `Enriched ${summary.totalEpisodes} episodes. Series detected: ${summary.totalSeries}. ` +
        `LLM calls: ${summary.llmCalls}. Unknown: ${summary.lowConfidence.unknown}, Broad: ${summary.lowConfidence.broad}.`
    );
  }

  return {
    episodes: enrichedEpisodes,
    collections,
    umbrellas,
    cache: cacheUpdates,
    summary,
  };
}
