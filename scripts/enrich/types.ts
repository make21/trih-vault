import { z } from "zod";

export const ScopeSchema = z.enum(["point", "range", "broad", "unknown"]);
export type Scope = z.infer<typeof ScopeSchema>;

const NullableText = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) return null;
    return String(value);
  });

export const EpisodeSchema = z
  .object({
    episode: z.number(),
    title_feed: NullableText,
    title_sheet: NullableText,
    description: NullableText,
    pubDate: z.string(),
    slug: z.string(),
    eras: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),
  })
  .passthrough();

export type Episode = z.infer<typeof EpisodeSchema>;

export const SeriesSchema = z.object({
  key: z.string(),
  title: z.string(),
  umbrellaKey: z.string(),
  umbrellaTitle: z.string(),
  episodeNumbers: z.array(z.number().int()),
  episodeSlugs: z.array(z.string()),
  parts: z.array(z.number().int()),
  yearPrimary: z.number().int().nullable(),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  scope: ScopeSchema,
  confidence: z.number().min(0).max(1).nullable(),
  singleton: z.boolean(),
  source: z.enum(["rules", "llm", "override", "mixed"]),
});

export type Series = z.infer<typeof SeriesSchema>;

export const SeriesArraySchema = z.array(SeriesSchema);

export const EnrichedEpisodeSchema = EpisodeSchema.extend({
  seriesKey: z.string(),
  seriesPart: z.number().int().positive().nullable(),
  yearPrimary: z.number().int().nullable(),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  scope: ScopeSchema,
  source: z.enum(["series", "override"]),
});

export type EnrichedEpisode = z.infer<typeof EnrichedEpisodeSchema>;

export const CollectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  umbrellaKey: z.string(),
  umbrellaTitle: z.string(),
  count: z.number().int(),
  parts: z.array(z.number().int()),
  episodes: z.array(z.number().int()),
  slugs: z.array(z.string()),
  years: z.object({
    min: z.number().int().nullable(),
    max: z.number().int().nullable(),
  }),
});

export type Collection = z.infer<typeof CollectionSchema>;

export const CollectionsSchema = z.array(CollectionSchema);

export const UmbrellaIndexSchema = z.object({
  umbrellas: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      seriesKeys: z.array(z.string()),
      years: z.object({
        min: z.number().int().nullable(),
        max: z.number().int().nullable(),
      }),
      count: z.number().int(),
    })
  ),
});

export type UmbrellaIndex = z.infer<typeof UmbrellaIndexSchema>;

export const LegacyCachedInferenceSchema = z.object({
  seriesTitle: z.string().nullable(),
  seriesPart: z.number().int().positive().nullable(),
  yearPrimary: z.number().int().nullable(),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  scope: ScopeSchema,
  umbrellas: z.array(z.string()),
  confidence: z.number().min(0).max(1).nullable(),
}).passthrough();

export type LegacyCachedInference = z.infer<typeof LegacyCachedInferenceSchema>;

export const SeriesInferenceCacheEntrySchema = z.object({
  title: z.string(),
  umbrellaKey: z.string(),
  umbrellaTitle: z.string(),
  yearPrimary: z.number().int().nullable(),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  scope: ScopeSchema,
  confidence: z.number().min(0).max(1).nullable(),
  version: z.literal(1),
});

export type SeriesInferenceCacheEntry = z.infer<typeof SeriesInferenceCacheEntrySchema>;

export const SeriesInferenceCacheSchema = z.record(z.string(), SeriesInferenceCacheEntrySchema);

export type SeriesInferenceCache = z.infer<typeof SeriesInferenceCacheSchema>;

export interface EnrichmentSummary {
  totalEpisodes: number;
  totalSeries: number;
  singletonSeries: number;
  llmCalls: number;
  llmSkipped: number;
  umbrellas: number;
  lowConfidenceSeries: number;
}

export interface RunContext {
  dryRun: boolean;
  refresh: boolean;
  verbose: boolean;
  onlySlug: string | null;
  cacheOnly: boolean;
  seriesOnly: boolean;
}
