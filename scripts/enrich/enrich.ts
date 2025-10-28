import fs from "fs";
import path from "path";
import { z } from "zod";
import {
  Collection,
  EnrichedEpisode,
  Episode,
  EpisodeSchema,
  EnrichmentSummary,
  LegacyCachedInference,
  LegacyCachedInferenceSchema,
  Series,
  SeriesArraySchema,
  SeriesInferenceCache,
  SeriesInferenceCacheEntry,
  SeriesInferenceCacheSchema,
  UmbrellaIndex,
} from "./types";
import { detectSeriesGroups, SeriesGroup } from "./series";
import { createLLMClient, LLMClient, SeriesLLMInput, SeriesLLMResult } from "./llm";
import { loadCenturyMap, centuryLabelToRange } from "./century";
import { applyUmbrellaOverrides, buildUmbrellaIndex, loadUmbrellaOverrides } from "./umbrellas";
import {
  average,
  median,
  sortEpisodesByNumber,
  toKebabCase,
  toTitleCase,
  uniqueSorted,
} from "./utils";

const EPISODES_PATH = ["public", "episodes.json"];
const SERIES_PATH = ["public", "series.json"];
const COLLECTIONS_PATH = ["public", "collections.json"];
const UMBRELLAS_PATH = ["public", "umbrellas.json"];
const CACHE_PATH = ["data", "inference-cache.json"];

const LOW_CONFIDENCE_THRESHOLD = 0.55;
const FALLBACK_CONFIDENCE = 0.4;

export interface EnrichOptions {
  rootDir?: string;
  dryRun?: boolean;
  refresh?: boolean;
  onlySlug?: string | null;
  verbose?: boolean;
  cacheOnly?: boolean;
  seriesOnly?: boolean;
  llmClient?: LLMClient | null;
  logger?: Pick<typeof console, "log" | "warn" | "error">;
}

interface EpisodeSeed {
  episode: Episode;
  centuryLabel: string | null;
}

interface SeriesSeed {
  id: string;
  detectionKey: string;
  provisionalStem: string;
  detectionSource: "multi" | "singleton";
  episodes: EpisodeSeed[];
  parts: number[];
  firstEpisodeNumber: number;
}

interface SeedContext {
  seed: SeriesSeed;
  previousSeries: Series | null;
  inference: SeriesLLMResult | null;
  inferenceSource: "cache" | "legacy" | "llm" | "fallback" | "none";
  allowsLLM: boolean;
}

interface CacheLoadResult {
  cache: SeriesInferenceCache;
  legacy: Record<string, LegacyCachedInference> | null;
}

export interface EnrichResult {
  series: Series[];
  episodes: EnrichedEpisode[];
  collections: Collection[];
  umbrellas: UmbrellaIndex;
  cache: SeriesInferenceCache;
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

function loadExistingSeries(rootDir: string): Series[] {
  const filePath = resolvePath(rootDir, SERIES_PATH);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return readJsonArray(filePath, SeriesArraySchema);
}

function loadSeriesCache(rootDir: string): CacheLoadResult {
  const filePath = resolvePath(rootDir, CACHE_PATH);
  if (!fs.existsSync(filePath)) {
    return { cache: {}, legacy: null };
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const modern = SeriesInferenceCacheSchema.safeParse(parsed);
  if (modern.success) {
    return { cache: modern.data, legacy: null };
  }
  const legacy = z.record(z.string(), LegacyCachedInferenceSchema).safeParse(parsed);
  if (legacy.success) {
    return { cache: {}, legacy: legacy.data };
  }
  throw new Error(`Inference cache at ${filePath} failed validation`);
}

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function sanitizeNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (Number.isNaN(value)) return null;
  if (value < -5000 || value > 2500) return null;
  return Math.trunc(value);
}

function deriveSingletonStem(episode: Episode): string {
  const source = episode.title_sheet ?? episode.title_feed ?? null;
  if (source && source.trim()) {
    return source.trim();
  }
  return `Episode ${episode.episode}`;
}

function buildSeriesSeeds(episodes: Episode[], centuryMap: Map<number, string>): SeriesSeed[] {
  const groups = detectSeriesGroups(episodes);
  const assigned = new Set<string>();
  const seeds: SeriesSeed[] = [];
  let counter = 0;

  const addSeed = (group: SeriesGroup | null, episodeList: Episode[], detectionSource: "multi" | "singleton") => {
    const sorted = sortEpisodesByNumber(episodeList);
    const seedEpisodes: EpisodeSeed[] = sorted.map((episode) => ({
      episode,
      centuryLabel: centuryMap.get(episode.episode) ?? null,
    }));
    const provisionalStem = group ? group.stem : deriveSingletonStem(sorted[0]!);
    const parts = sorted.map((_, index) => index + 1);
    const seed: SeriesSeed = {
      id: `series-${counter}`,
      detectionKey: group ? group.key : sorted[0]!.slug,
      provisionalStem,
      detectionSource,
      episodes: seedEpisodes,
      parts,
      firstEpisodeNumber: sorted[0]!.episode,
    };
    counter += 1;
    for (const entry of sorted) {
      assigned.add(entry.slug);
    }
    seeds.push(seed);
  };

  for (const group of groups.values()) {
    addSeed(group, group.episodes, "multi");
  }

  const remaining = sortEpisodesByNumber(episodes).filter((episode) => !assigned.has(episode.slug));
  for (const episode of remaining) {
    addSeed(null, [episode], "singleton");
  }

  seeds.sort((a, b) => a.firstEpisodeNumber - b.firstEpisodeNumber);
  return seeds;
}

interface SeriesYears {
  yearPrimary: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  scope: "point" | "range" | "broad" | "unknown";
  confidence: number | null;
}

function collectEpisodeYearData(seed: SeriesSeed) {
  const from: number[] = [];
  const to: number[] = [];
  const primary: number[] = [];
  const scopes: string[] = [];
  const confidences: number[] = [];

  for (const entry of seed.episodes) {
    const base = entry.episode as unknown as Record<string, unknown>;
    const yearFrom = sanitizeNumber(base.yearFrom as number | null | undefined);
    const yearTo = sanitizeNumber(base.yearTo as number | null | undefined);
    const yearPrimary = sanitizeNumber(base.yearPrimary as number | null | undefined);
    const scope = typeof base.scope === "string" ? base.scope : null;
    const confidence = typeof base.confidence === "number" ? base.confidence : null;
    if (yearFrom !== null) from.push(yearFrom);
    if (yearTo !== null) to.push(yearTo);
    if (yearPrimary !== null) primary.push(yearPrimary);
    if (scope) scopes.push(scope);
    if (confidence !== null) confidences.push(confidence);
  }

  return { from, to, primary, scopes, confidences };
}

function deriveYearsFromEpisodes(seed: SeriesSeed): SeriesYears | null {
  const data = collectEpisodeYearData(seed);
  if (!data.from.length && !data.to.length && !data.primary.length) {
    return null;
  }
  const yearFrom = data.from.length ? Math.min(...data.from) : null;
  const yearTo = data.to.length ? Math.max(...data.to) : null;
  const yearPrimary = data.primary.length ? median(data.primary) : null;
  let scope: "point" | "range" | "broad" | "unknown" = "unknown";
  if (data.scopes.length) {
    const counts = new Map<string, number>();
    for (const value of data.scopes) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const ordered = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const candidate = ordered[0]?.[0] ?? "unknown";
    if (candidate === "point" || candidate === "range" || candidate === "broad") {
      scope = candidate;
    }
  }
  if (scope === "unknown") {
    if (yearFrom !== null && yearTo !== null && yearFrom !== yearTo) {
      scope = "range";
    } else if (yearPrimary !== null) {
      scope = "point";
    }
  }
  const confidence = data.confidences.length ? average(data.confidences) : FALLBACK_CONFIDENCE;
  return {
    yearPrimary: sanitizeNumber(yearPrimary),
    yearFrom: sanitizeNumber(yearFrom),
    yearTo: sanitizeNumber(yearTo),
    scope,
    confidence: confidence ?? FALLBACK_CONFIDENCE,
  };
}

function deriveYearsFromCentury(seed: SeriesSeed): SeriesYears | null {
  const labels = uniqueSorted(
    seed.episodes
      .map((entry) => entry.centuryLabel)
      .filter((value): value is string => Boolean(value))
  );
  if (!labels.length) return null;
  const ranges = labels
    .map((label) => centuryLabelToRange(label))
    .filter((value): value is { from: number; to: number } => value !== null);
  if (!ranges.length) return null;
  const from = Math.min(...ranges.map((range) => range.from));
  const to = Math.max(...ranges.map((range) => range.to));
  const midpoint = Math.round((from + to) / 2);
  return {
    yearPrimary: sanitizeNumber(midpoint),
    yearFrom: sanitizeNumber(from),
    yearTo: sanitizeNumber(to),
    scope: from === to ? "point" : "range",
    confidence: FALLBACK_CONFIDENCE,
  };
}

function convertCacheEntry(entry: SeriesInferenceCacheEntry): SeriesLLMResult {
  return {
    seriesTitle: entry.title,
    umbrellaTitle: entry.umbrellaTitle,
    yearPrimary: sanitizeNumber(entry.yearPrimary),
    yearFrom: sanitizeNumber(entry.yearFrom),
    yearTo: sanitizeNumber(entry.yearTo),
    scope: entry.scope,
    confidence: entry.confidence ?? null,
  };
}

function promoteLegacyCache(seed: SeriesSeed, legacy: Record<string, LegacyCachedInference>): SeriesInferenceCacheEntry | null {
  const entries: LegacyCachedInference[] = [];
  for (const { episode } of seed.episodes) {
    const cached = legacy[episode.slug];
    if (cached) {
      entries.push(cached);
    }
  }
  if (!entries.length) return null;

  const titleCandidate = entries.find((entry) => entry.seriesTitle && entry.seriesTitle.trim());
  const seriesTitle = titleCandidate?.seriesTitle?.trim() || seed.provisionalStem;

  const umbrellaCandidate = entries
    .map((entry) => entry.umbrellas?.[0])
    .find((value) => typeof value === "string" && value.trim().length);
  const umbrellaKey = toKebabCase(umbrellaCandidate ?? seriesTitle);
  const umbrellaTitle = umbrellaCandidate ? toTitleCase(umbrellaCandidate) : seriesTitle;

  const fromValues = entries
    .map((entry) => sanitizeNumber(entry.yearFrom))
    .filter((value): value is number => value !== null);
  const toValues = entries
    .map((entry) => sanitizeNumber(entry.yearTo))
    .filter((value): value is number => value !== null);
  const primaryValues = entries
    .map((entry) => sanitizeNumber(entry.yearPrimary))
    .filter((value): value is number => value !== null);

  const scopeCandidate = entries
    .map((entry) => entry.scope)
    .find((value) => value === "point" || value === "range" || value === "broad");

  const confidenceValues = entries
    .map((entry) => (typeof entry.confidence === "number" ? entry.confidence : null))
    .filter((value): value is number => value !== null);

  const yearFrom = fromValues.length ? Math.min(...fromValues) : null;
  const yearTo = toValues.length ? Math.max(...toValues) : null;
  const yearPrimary = primaryValues.length ? median(primaryValues) : null;
  const scope = scopeCandidate ?? (yearFrom !== null && yearTo !== null && yearFrom !== yearTo ? "range" : "unknown");
  const confidence = confidenceValues.length ? average(confidenceValues) : null;

  return {
    title: seriesTitle,
    umbrellaKey,
    umbrellaTitle,
    yearPrimary: sanitizeNumber(yearPrimary),
    yearFrom: sanitizeNumber(yearFrom),
    yearTo: sanitizeNumber(yearTo),
    scope,
    confidence: confidence ?? FALLBACK_CONFIDENCE,
    version: 1,
  };
}

function computeSeriesKey(title: string, fallback: string, firstEpisodeNumber: number, used: Set<string>): string {
  const base = toKebabCase(title) || toKebabCase(fallback) || `series-${firstEpisodeNumber}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const withEpisode = `${base}-e${firstEpisodeNumber}`;
  if (!used.has(withEpisode)) {
    used.add(withEpisode);
    return withEpisode;
  }
  let counter = 2;
  let candidate = `${withEpisode}-${counter}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${withEpisode}-${counter}`;
  }
  used.add(candidate);
  return candidate;
}

const LEGACY_FIELDS = new Set([
  "seriesKey",
  "seriesTitle",
  "seriesPart",
  "yearPrimary",
  "yearFrom",
  "yearTo",
  "scope",
  "umbrellas",
  "confidence",
  "source",
]);

function sanitizeEpisodeBase(episode: Episode): Episode {
  const clone = { ...(episode as unknown as Record<string, unknown>) };
  for (const field of LEGACY_FIELDS) {
    delete clone[field];
  }
  return clone as Episode;
}

function buildCacheEntryFromSeries(series: Series): SeriesInferenceCacheEntry {
  return {
    title: series.title,
    umbrellaKey: series.umbrellaKey,
    umbrellaTitle: series.umbrellaTitle,
    yearPrimary: series.yearPrimary,
    yearFrom: series.yearFrom,
    yearTo: series.yearTo,
    scope: series.scope,
    confidence: series.confidence,
    version: 1,
  };
}

function buildCollections(seriesList: Series[]): Collection[] {
  return seriesList.map((series) => ({
    key: series.key,
    title: series.title,
    umbrellaKey: series.umbrellaKey,
    umbrellaTitle: series.umbrellaTitle,
    count: series.episodeNumbers.length,
    parts: series.parts,
    episodes: series.episodeNumbers,
    slugs: series.episodeSlugs,
    years: {
      min: series.yearFrom,
      max: series.yearTo,
    },
  }));
}

function buildEpisodes(seriesList: Series[], seeds: SeriesSeed[]): EnrichedEpisode[] {
  const episodes: EnrichedEpisode[] = [];
  for (let index = 0; index < seriesList.length; index += 1) {
    const series = seriesList[index]!;
    const seed = seeds[index]!;
    for (let i = 0; i < seed.episodes.length; i += 1) {
      const baseEpisode = sanitizeEpisodeBase(seed.episodes[i]!.episode);
      const part = series.singleton ? null : series.parts[i] ?? i + 1;
      episodes.push({
        ...(baseEpisode as Episode),
        seriesKey: series.key,
        seriesPart: part,
        yearPrimary: series.yearPrimary,
        yearFrom: series.yearFrom,
        yearTo: series.yearTo,
        scope: series.scope,
        source: series.source === "override" ? "override" : "series",
      });
    }
  }
  episodes.sort((a, b) => a.episode - b.episode);
  return episodes;
}

export async function enrichEpisodes(options: EnrichOptions = {}): Promise<EnrichResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const refresh = options.refresh ?? false;
  const onlySlug = options.onlySlug ?? null;
  const verbose = options.verbose ?? false;
  const cacheOnly = options.cacheOnly ?? false;
  const seriesOnly = options.seriesOnly ?? false;
  const logger = options.logger ?? console;

  const episodes = loadEpisodes(rootDir);
  const centuryMap = loadCenturyMap(rootDir);
  const seeds = buildSeriesSeeds(episodes, centuryMap);

  const existingSeries = loadExistingSeries(rootDir);
  const seriesBySlug = new Map<string, Series>();
  for (const series of existingSeries) {
    for (const slug of series.episodeSlugs) {
      seriesBySlug.set(slug, series);
    }
  }

  const cacheState = refresh ? { cache: {}, legacy: null } : loadSeriesCache(rootDir);
  const overrides = loadUmbrellaOverrides(rootDir);

  const contexts: SeedContext[] = seeds.map((seed) => {
    const previousSeries = seriesBySlug.get(seed.episodes[0]!.episode.slug) ?? null;
    const allowsLLM = !onlySlug || seed.episodes.some((entry) => entry.episode.slug === onlySlug);
    return {
      seed,
      previousSeries,
      inference: null,
      inferenceSource: "none",
      allowsLLM,
    };
  });

  const legacyCache = cacheState.legacy;

  for (const context of contexts) {
    if (refresh) {
      continue;
    }
    const previousKey = context.previousSeries?.key ?? null;
    if (previousKey) {
      const cached = cacheState.cache[previousKey];
      if (cached) {
        context.inference = convertCacheEntry(cached);
        context.inferenceSource = "cache";
        continue;
      }
    }
    if (legacyCache) {
      const promoted = promoteLegacyCache(context.seed, legacyCache);
      if (promoted) {
        context.inference = convertCacheEntry(promoted);
        context.inferenceSource = "legacy";
      }
    }
  }

  const llmTargets = contexts.filter(
    (context) => !context.inference && context.allowsLLM && !cacheOnly
  );

  let llmCalls = 0;
  let llmSkipped = 0;

  if (llmTargets.length) {
    const apiKey = process.env.OPENAI_API_KEY;
    const client = options.llmClient ?? (apiKey ? createLLMClient(apiKey) : null);
    if (!client) {
      llmSkipped = llmTargets.length;
      logger.warn(
        `Skipping ${llmSkipped} series inference${llmSkipped === 1 ? "" : "s"} because OPENAI_API_KEY is not set.`
      );
    } else {
      for (const context of llmTargets) {
        const input: SeriesLLMInput = {
          provisionalStem: context.seed.provisionalStem,
          episodes: context.seed.episodes.map((entry) => ({
            title_feed: entry.episode.title_feed ?? null,
            title_sheet: entry.episode.title_sheet ?? null,
            description: entry.episode.description ?? null,
          })),
          centuryLabels: uniqueSorted(
            context.seed.episodes
              .map((entry) => entry.centuryLabel)
              .filter((value): value is string => Boolean(value))
          ),
        };
        const inference = await client.inferSeries(input);
        context.inference = inference;
        context.inferenceSource = "llm";
        llmCalls += 1;
      }
    }
  }

  for (const context of contexts) {
    if (!context.inference) {
      context.inferenceSource = "fallback";
    }
  }

  const usedKeys = new Set<string>();
  const seriesList: Series[] = [];

  for (const context of contexts) {
    const seed = context.seed;
    const inference = context.inference;
    const episodeYears = deriveYearsFromEpisodes(seed);
    const centuryYears = deriveYearsFromCentury(seed);

    let seriesTitle = inference?.seriesTitle?.trim() || seed.provisionalStem;
    if (!seriesTitle.trim()) {
      seriesTitle = seed.provisionalStem;
    }
    let umbrellaTitle = inference?.umbrellaTitle?.trim() || seriesTitle;
    if (!umbrellaTitle.trim()) {
      umbrellaTitle = seriesTitle;
    }

    let yearFrom = sanitizeNumber(inference?.yearFrom);
    let yearTo = sanitizeNumber(inference?.yearTo);
    let yearPrimary = sanitizeNumber(inference?.yearPrimary);
    let scope = inference?.scope ?? "unknown";
    let confidence = typeof inference?.confidence === "number" ? inference?.confidence : null;
    let source: Series["source"] = inference ? "llm" : "rules";

    if (!inference) {
      const fallback = episodeYears ?? centuryYears;
      if (fallback) {
        yearFrom = fallback.yearFrom;
        yearTo = fallback.yearTo;
        yearPrimary = fallback.yearPrimary;
        scope = fallback.scope;
        confidence = fallback.confidence;
        source = "rules";
      } else {
        scope = "unknown";
        yearFrom = null;
        yearTo = null;
        yearPrimary = null;
        confidence = null;
      }
    } else if (confidence === null || confidence < LOW_CONFIDENCE_THRESHOLD) {
      const fallback = episodeYears ?? centuryYears;
      if (fallback) {
        yearFrom = fallback.yearFrom;
        yearTo = fallback.yearTo;
        yearPrimary = fallback.yearPrimary;
        scope = fallback.scope;
        confidence = Math.min(fallback.confidence ?? FALLBACK_CONFIDENCE, LOW_CONFIDENCE_THRESHOLD);
        source = "mixed";
      } else {
        yearFrom = null;
        yearTo = null;
        yearPrimary = null;
        scope = "unknown";
      }
    }

    if (scope === "point") {
      const primary = yearPrimary ?? yearFrom ?? yearTo;
      if (primary !== null) {
        yearPrimary = primary;
        yearFrom = primary;
        yearTo = primary;
      }
    }
    if (scope === "range") {
      if (yearFrom !== null && yearTo === null) {
        yearTo = yearFrom;
      } else if (yearTo !== null && yearFrom === null) {
        yearFrom = yearTo;
      }
    }
    if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
      const temp = yearFrom;
      yearFrom = yearTo;
      yearTo = temp;
    }
    if (yearPrimary !== null && yearFrom !== null && yearTo !== null) {
      const min = Math.min(yearFrom, yearTo);
      const max = Math.max(yearFrom, yearTo);
      if (yearPrimary < min) {
        yearPrimary = min;
      } else if (yearPrimary > max) {
        yearPrimary = max;
      }
    }

    const umbrellaKey = toKebabCase(umbrellaTitle) || toKebabCase(seriesTitle);
    const finalConfidence = confidence !== null ? Math.max(0, Math.min(1, confidence)) : confidence;

    const episodeNumbers = seed.episodes.map((entry) => entry.episode.episode);
    const episodeSlugs = seed.episodes.map((entry) => entry.episode.slug);

    const key = computeSeriesKey(seriesTitle, seed.detectionKey, seed.firstEpisodeNumber, usedKeys);

    const series: Series = {
      key,
      title: seriesTitle,
      umbrellaKey,
      umbrellaTitle,
      episodeNumbers,
      episodeSlugs,
      parts: seed.parts,
      yearPrimary,
      yearFrom,
      yearTo,
      scope,
      confidence: finalConfidence,
      singleton: seed.episodes.length === 1,
      source,
    };

    seriesList.push(series);
  }

  const overriddenSeries = applyUmbrellaOverrides(seriesList, overrides);
  const finalSeries = overriddenSeries;

  const lowConfidenceSeries = finalSeries.filter(
    (item) => item.confidence !== null && item.confidence < LOW_CONFIDENCE_THRESHOLD
  ).length;
  const singletonSeries = finalSeries.filter((item) => item.singleton).length;

  const enrichedEpisodes = buildEpisodes(finalSeries, seeds);
  const collections = buildCollections(finalSeries);
  const umbrellas = buildUmbrellaIndex(finalSeries);

  const cacheUpdates: SeriesInferenceCache = {};
  for (const series of finalSeries) {
    cacheUpdates[series.key] = buildCacheEntryFromSeries(series);
  }

  if (!dryRun) {
    if (!seriesOnly) {
      writeJson(resolvePath(rootDir, EPISODES_PATH), enrichedEpisodes);
    }
    writeJson(resolvePath(rootDir, SERIES_PATH), finalSeries);
    writeJson(resolvePath(rootDir, COLLECTIONS_PATH), collections);
    writeJson(resolvePath(rootDir, UMBRELLAS_PATH), umbrellas);
    writeJson(resolvePath(rootDir, CACHE_PATH), cacheUpdates);
  }

  const summary: EnrichmentSummary = {
    totalEpisodes: episodes.length,
    totalSeries: finalSeries.length,
    singletonSeries,
    llmCalls,
    llmSkipped,
    umbrellas: umbrellas.umbrellas.length,
    lowConfidenceSeries,
  };

  if (verbose) {
    logger.log(
      `Series: ${summary.totalSeries} | Singletons: ${summary.singletonSeries} | LLM calls: ${summary.llmCalls} | ` +
        `Skipped: ${summary.llmSkipped} | Umbrellas: ${summary.umbrellas} | Low confidence: ${summary.lowConfidenceSeries}`
    );
  }

  return {
    series: finalSeries,
    episodes: enrichedEpisodes,
    collections,
    umbrellas,
    cache: cacheUpdates,
    summary,
  };
}
