"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeriesInferenceCacheSchema = exports.SeriesInferenceCacheEntrySchema = exports.LegacyCachedInferenceSchema = exports.UmbrellaIndexSchema = exports.CollectionsSchema = exports.CollectionSchema = exports.EnrichedEpisodeSchema = exports.SeriesArraySchema = exports.SeriesSchema = exports.EpisodeSchema = exports.ScopeSchema = void 0;
const zod_1 = require("zod");
exports.ScopeSchema = zod_1.z.enum(["point", "range", "broad", "unknown"]);
const NullableText = zod_1.z
    .union([zod_1.z.string(), zod_1.z.number(), zod_1.z.null()])
    .optional()
    .transform((value) => {
    if (value === undefined || value === null)
        return null;
    return String(value);
});
exports.EpisodeSchema = zod_1.z
    .object({
    episode: zod_1.z.number(),
    title_feed: NullableText,
    title_sheet: NullableText,
    description: NullableText,
    pubDate: zod_1.z.string(),
    slug: zod_1.z.string(),
    eras: zod_1.z.array(zod_1.z.string()).optional(),
    regions: zod_1.z.array(zod_1.z.string()).optional(),
})
    .passthrough();
exports.SeriesSchema = zod_1.z.object({
    key: zod_1.z.string(),
    title: zod_1.z.string(),
    umbrellaKey: zod_1.z.string(),
    umbrellaTitle: zod_1.z.string(),
    episodeNumbers: zod_1.z.array(zod_1.z.number().int()),
    episodeSlugs: zod_1.z.array(zod_1.z.string()),
    parts: zod_1.z.array(zod_1.z.number().int()),
    yearPrimary: zod_1.z.number().int().nullable(),
    yearFrom: zod_1.z.number().int().nullable(),
    yearTo: zod_1.z.number().int().nullable(),
    scope: exports.ScopeSchema,
    confidence: zod_1.z.number().min(0).max(1).nullable(),
    singleton: zod_1.z.boolean(),
    source: zod_1.z.enum(["rules", "llm", "override", "mixed"]),
});
exports.SeriesArraySchema = zod_1.z.array(exports.SeriesSchema);
exports.EnrichedEpisodeSchema = exports.EpisodeSchema.extend({
    seriesKey: zod_1.z.string(),
    seriesPart: zod_1.z.number().int().positive().nullable(),
    yearPrimary: zod_1.z.number().int().nullable(),
    yearFrom: zod_1.z.number().int().nullable(),
    yearTo: zod_1.z.number().int().nullable(),
    scope: exports.ScopeSchema,
    source: zod_1.z.enum(["series", "override"]),
});
exports.CollectionSchema = zod_1.z.object({
    key: zod_1.z.string(),
    title: zod_1.z.string(),
    umbrellaKey: zod_1.z.string(),
    umbrellaTitle: zod_1.z.string(),
    count: zod_1.z.number().int(),
    parts: zod_1.z.array(zod_1.z.number().int()),
    episodes: zod_1.z.array(zod_1.z.number().int()),
    slugs: zod_1.z.array(zod_1.z.string()),
    years: zod_1.z.object({
        min: zod_1.z.number().int().nullable(),
        max: zod_1.z.number().int().nullable(),
    }),
});
exports.CollectionsSchema = zod_1.z.array(exports.CollectionSchema);
exports.UmbrellaIndexSchema = zod_1.z.object({
    umbrellas: zod_1.z.array(zod_1.z.object({
        key: zod_1.z.string(),
        title: zod_1.z.string(),
        seriesKeys: zod_1.z.array(zod_1.z.string()),
        years: zod_1.z.object({
            min: zod_1.z.number().int().nullable(),
            max: zod_1.z.number().int().nullable(),
        }),
        count: zod_1.z.number().int(),
    })),
});
exports.LegacyCachedInferenceSchema = zod_1.z.object({
    seriesTitle: zod_1.z.string().nullable(),
    seriesPart: zod_1.z.number().int().positive().nullable(),
    yearPrimary: zod_1.z.number().int().nullable(),
    yearFrom: zod_1.z.number().int().nullable(),
    yearTo: zod_1.z.number().int().nullable(),
    scope: exports.ScopeSchema,
    umbrellas: zod_1.z.array(zod_1.z.string()),
    confidence: zod_1.z.number().min(0).max(1).nullable(),
}).passthrough();
exports.SeriesInferenceCacheEntrySchema = zod_1.z.object({
    title: zod_1.z.string(),
    umbrellaKey: zod_1.z.string(),
    umbrellaTitle: zod_1.z.string(),
    yearPrimary: zod_1.z.number().int().nullable(),
    yearFrom: zod_1.z.number().int().nullable(),
    yearTo: zod_1.z.number().int().nullable(),
    scope: exports.ScopeSchema,
    confidence: zod_1.z.number().min(0).max(1).nullable(),
    version: zod_1.z.literal(1),
});
exports.SeriesInferenceCacheSchema = zod_1.z.record(zod_1.z.string(), exports.SeriesInferenceCacheEntrySchema);
