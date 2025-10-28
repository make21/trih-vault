"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCenturyFallback = applyCenturyFallback;
exports.applySeriesSmoothing = applySeriesSmoothing;
exports.prepareState = prepareState;
exports.enrichEpisodes = enrichEpisodes;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
const types_1 = require("./types");
const series_1 = require("./series");
const llm_1 = require("./llm");
const century_1 = require("./century");
const utils_1 = require("./utils");
const umbrellas_1 = require("./umbrellas");
const EPISODES_PATH = ["public", "episodes.json"];
const COLLECTIONS_PATH = ["public", "collections.json"];
const UMBRELLAS_PATH = ["public", "umbrellas.json"];
const CACHE_PATH = ["data", "inference-cache.json"];
const LOW_CONFIDENCE_THRESHOLD = 0.55;
function resolvePath(rootDir, segments) {
    return path_1.default.join(rootDir, ...segments);
}
function readJsonArray(filePath, schema) {
    const raw = fs_1.default.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return schema.parse(parsed);
}
function loadEpisodes(rootDir) {
    const filePath = resolvePath(rootDir, EPISODES_PATH);
    const schema = zod_1.z.array(types_1.EpisodeSchema);
    return readJsonArray(filePath, schema);
}
function loadCache(rootDir) {
    const filePath = resolvePath(rootDir, CACHE_PATH);
    if (!fs_1.default.existsSync(filePath)) {
        return {};
    }
    const raw = fs_1.default.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const result = types_1.InferenceCacheSchema.safeParse(parsed);
    if (!result.success) {
        throw new Error(`Inference cache at ${filePath} failed validation`);
    }
    return result.data;
}
function writeJson(filePath, data) {
    fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
    fs_1.default.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
function sanitizeYear(value) {
    if (value === null || value === undefined)
        return null;
    if (Number.isNaN(value))
        return null;
    if (value < 0 || value > 2100)
        return null;
    return value;
}
function applyCenturyFallback(state) {
    if (!state.centuryLabel)
        return;
    const range = (0, century_1.centuryLabelToRange)(state.centuryLabel);
    if (!range)
        return;
    state.yearFrom = range.from;
    state.yearTo = range.to;
    state.yearPrimary = Math.round((range.from + range.to) / 2);
    state.scope = range.from === range.to ? "point" : "range";
    state.confidence = 0.4;
    state.source = state.source ? "mixed" : "century";
}
function applySeriesSmoothing(states) {
    const byKey = new Map();
    for (const state of states) {
        if (!state.seriesKey)
            continue;
        const bucket = byKey.get(state.seriesKey) ?? [];
        bucket.push(state);
        byKey.set(state.seriesKey, bucket);
    }
    for (const episodes of byKey.values()) {
        const withYears = episodes.filter((episode) => episode.scope !== "broad" && (episode.yearPrimary !== null || episode.yearFrom !== null || episode.yearTo !== null));
        if (!withYears.length) {
            continue;
        }
        const rangeStarts = withYears
            .map((episode) => (episode.yearFrom ?? episode.yearPrimary ?? null))
            .filter((value) => value !== null);
        const rangeEnds = withYears
            .map((episode) => (episode.yearTo ?? episode.yearPrimary ?? null))
            .filter((value) => value !== null);
        const primaryValues = withYears
            .map((episode) => {
            if (episode.yearPrimary !== null)
                return episode.yearPrimary;
            if (episode.yearFrom !== null && episode.yearTo !== null) {
                return Math.round((episode.yearFrom + episode.yearTo) / 2);
            }
            return null;
        })
            .filter((value) => value !== null);
        const groupFrom = rangeStarts.length ? Math.min(...rangeStarts) : null;
        const groupTo = rangeEnds.length ? Math.max(...rangeEnds) : null;
        const groupMedian = (0, utils_1.median)(primaryValues);
        const groupConfidence = (0, utils_1.average)(withYears.map((episode) => (episode.confidence ?? LOW_CONFIDENCE_THRESHOLD)));
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
                    episode.yearPrimary = (0, utils_1.clamp)(episode.yearPrimary, episode.yearFrom, episode.yearTo);
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
function buildCollections(states) {
    const byKey = new Map();
    for (const state of states) {
        if (!state.seriesKey)
            continue;
        const bucket = byKey.get(state.seriesKey) ?? [];
        bucket.push(state);
        byKey.set(state.seriesKey, bucket);
    }
    const collections = [];
    for (const [key, episodes] of byKey.entries()) {
        const sorted = [...episodes].sort((a, b) => a.base.episode - b.base.episode);
        const years = sorted
            .map((episode) => [episode.yearFrom, episode.yearTo, episode.yearPrimary])
            .flat()
            .filter((value) => value !== null);
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
    return types_1.CollectionsSchema.parse(collections);
}
function buildUmbrellaSummary(states) {
    const index = {};
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
    const counts = Object.fromEntries(Object.entries(index).map(([key, episodes]) => [key, episodes.length]));
    return types_1.UmbrellaSummarySchema.parse({ index, counts });
}
function prepareState(episode, centuryLabel) {
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
function mergeSeriesAssignment(state, assignment) {
    if (!assignment)
        return;
    state.seriesKey = assignment.key;
    state.seriesTitle = assignment.title;
    state.seriesPart = assignment.part;
}
function hydrateFromInference(state, inference) {
    if (!inference)
        return;
    state.inference = inference;
    if (!state.seriesKey && inference.seriesTitle) {
        state.seriesKey = (0, utils_1.slugify)(inference.seriesTitle);
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
    state.umbrellas = (0, umbrellas_1.sanitizeUmbrellas)(inference.umbrellas ?? []);
    state.confidence = acceptedConfidence;
    state.source = yearPrimary !== null || yearFrom !== null || yearTo !== null ? "llm" : state.source;
}
function finalizeState(state) {
    if (state.yearFrom !== null && state.yearTo !== null && state.yearFrom > state.yearTo) {
        const swap = state.yearFrom;
        state.yearFrom = state.yearTo;
        state.yearTo = swap;
    }
    if (state.yearFrom !== null && state.yearTo !== null && state.yearPrimary !== null) {
        state.yearPrimary = (0, utils_1.clamp)(state.yearPrimary, state.yearFrom, state.yearTo);
    }
    return types_1.EnrichedEpisodeSchema.parse({
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
async function enrichEpisodes(options = {}) {
    const rootDir = options.rootDir ?? process.cwd();
    const dryRun = options.dryRun ?? false;
    const refresh = options.refresh ?? false;
    const onlySlug = options.onlySlug ?? null;
    const verbose = options.verbose ?? false;
    const cacheOnly = options.cacheOnly ?? false;
    const logger = options.logger ?? console;
    const episodes = loadEpisodes(rootDir);
    const cache = refresh ? {} : loadCache(rootDir);
    const centuryMap = (0, century_1.loadCenturyMap)(rootDir);
    const { assignmentsBySlug, groupsByKey } = (0, series_1.detectSeries)(episodes);
    const states = episodes.map((episode) => {
        const centuryLabel = centuryMap.get(episode.episode) ?? null;
        const state = prepareState(episode, centuryLabel);
        const assignment = assignmentsBySlug.get(episode.slug);
        if (assignment) {
            mergeSeriesAssignment(state, assignment);
        }
        return state;
    });
    const cacheUpdates = { ...cache };
    const llmNeeded = [];
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
        const activeClient = options.llmClient ?? (apiKey ? (0, llm_1.createLLMClient)(apiKey) : null);
        if (!activeClient) {
            llmSkipped = llmNeeded.length;
            const hint = "Set OPENAI_API_KEY to enable live enrichment or rerun with --cache-only to avoid LLM calls.";
            logger.warn(`Skipping ${llmSkipped} LLM inference${llmSkipped === 1 ? "" : "s"} because OPENAI_API_KEY is not set. ${hint}`);
        }
        else {
            if (verbose) {
                logger.log(`Requesting inference for ${llmNeeded.length} episode(s)...`);
            }
            for (const state of llmNeeded) {
                const input = {
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
    const summary = {
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
        logger.log(`Enriched ${summary.totalEpisodes} episodes. Series detected: ${summary.totalSeries}. ` +
            `LLM calls: ${summary.llmCalls}. Unknown: ${summary.lowConfidence.unknown}, Broad: ${summary.lowConfidence.broad}.`);
    }
    return {
        episodes: enrichedEpisodes,
        collections,
        umbrellas,
        cache: cacheUpdates,
        summary,
    };
}
