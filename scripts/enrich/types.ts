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

export const EnrichedFieldsSchema = z.object({
  seriesKey: z.string().nullable(),
  seriesTitle: z.string().nullable(),
  seriesPart: z.number().int().positive().nullable(),
  yearPrimary: z.number().int().nullable(),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  scope: ScopeSchema,
  umbrellas: z.array(z.string()),
  confidence: z.number().min(0).max(1).nullable(),
  source: z.enum(["rules", "series", "century", "llm", "override", "mixed"]).nullable(),
});

export const EnrichedEpisodeSchema = EpisodeSchema.merge(EnrichedFieldsSchema);
export type EnrichedEpisode = z.infer<typeof EnrichedEpisodeSchema>;

export const LLMInferenceSchema = z.object({
  seriesTitle: z.string().nullable(),
  seriesPart: z.number().int().positive().nullable(),
  yearPrimary: z.number().int().nullable(),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  scope: ScopeSchema,
  umbrellas: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});
export type LLMInference = z.infer<typeof LLMInferenceSchema>;

export const CachedInferenceSchema = LLMInferenceSchema.omit({ rationale: true }).extend({
  scope: ScopeSchema,
});
export type CachedInference = z.infer<typeof CachedInferenceSchema>;

export const CollectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  count: z.number().int(),
  episodes: z.array(z.number().int()),
  slugs: z.array(z.string()),
  parts: z.array(z.number().int()),
  years: z.object({
    min: z.number().int().nullable(),
    max: z.number().int().nullable(),
  }),
});

export type Collection = z.infer<typeof CollectionSchema>;

export const CollectionsSchema = z.array(CollectionSchema);

export const UmbrellaSummarySchema = z.object({
  index: z.record(z.string(), z.array(z.number().int())),
  counts: z.record(z.string(), z.number().int()),
});
export type UmbrellaSummary = z.infer<typeof UmbrellaSummarySchema>;

export const InferenceCacheSchema = z.record(z.string(), CachedInferenceSchema);
export type InferenceCache = z.infer<typeof InferenceCacheSchema>;

export interface EnrichmentSummary {
  totalEpisodes: number;
  totalSeries: number;
  llmCalls: number;
  llmSkipped: number;
  lowConfidence: { unknown: number; broad: number };
}

export interface RunContext {
  dryRun: boolean;
  refresh: boolean;
  verbose: boolean;
  onlySlug: string | null;
  cacheOnly: boolean;
}
