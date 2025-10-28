"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadUmbrellaOverrides = loadUmbrellaOverrides;
exports.applyUmbrellaOverrides = applyUmbrellaOverrides;
exports.buildUmbrellaIndex = buildUmbrellaIndex;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
const utils_1 = require("./utils");
const UmbrellaOverrideSchema = zod_1.z.object({
    key: zod_1.z.string().optional(),
    title: zod_1.z.string().optional(),
});
const UmbrellaOverridesSchema = zod_1.z.record(zod_1.z.string(), UmbrellaOverrideSchema);
function resolveOverridePath(rootDir) {
    return path_1.default.join(rootDir, "data", "umbrella-overrides.json");
}
function loadUmbrellaOverrides(rootDir) {
    const filePath = resolveOverridePath(rootDir);
    if (!fs_1.default.existsSync(filePath)) {
        return {};
    }
    const raw = fs_1.default.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const result = UmbrellaOverridesSchema.safeParse(parsed);
    if (!result.success) {
        throw new Error(`Umbrella overrides at ${filePath} failed validation`);
    }
    return result.data;
}
function pickYearFloor(series) {
    return series.yearFrom ?? series.yearPrimary ?? series.yearTo ?? null;
}
function pickYearCeil(series) {
    return series.yearTo ?? series.yearPrimary ?? series.yearFrom ?? null;
}
function applyOverridesToSeries(series, overrides) {
    const override = overrides[series.umbrellaKey];
    if (!override) {
        return series;
    }
    const nextKey = override.key ? (0, utils_1.toKebabCase)(override.key) : series.umbrellaKey;
    const nextTitle = override.title ?? series.umbrellaTitle;
    return {
        ...series,
        umbrellaKey: nextKey,
        umbrellaTitle: nextTitle,
        source: "override",
    };
}
function applyUmbrellaOverrides(seriesList, overrides) {
    if (!Object.keys(overrides).length) {
        return seriesList;
    }
    return seriesList.map((series) => applyOverridesToSeries(series, overrides));
}
function buildUmbrellaIndex(seriesList) {
    const buckets = new Map();
    for (const series of seriesList) {
        const minYear = pickYearFloor(series);
        const maxYear = pickYearCeil(series);
        const existing = buckets.get(series.umbrellaKey);
        if (!existing) {
            buckets.set(series.umbrellaKey, {
                key: series.umbrellaKey,
                title: series.umbrellaTitle,
                series: [series],
                minYear,
                maxYear,
            });
        }
        else {
            existing.series.push(series);
            if (minYear !== null) {
                existing.minYear = existing.minYear === null ? minYear : Math.min(existing.minYear, minYear);
            }
            if (maxYear !== null) {
                existing.maxYear = existing.maxYear === null ? maxYear : Math.max(existing.maxYear, maxYear);
            }
        }
    }
    const umbrellas = Array.from(buckets.values()).map((bucket) => {
        const sortedSeries = [...bucket.series];
        sortedSeries.sort((a, b) => {
            const yearA = pickYearFloor(a) ?? Number.MAX_SAFE_INTEGER;
            const yearB = pickYearFloor(b) ?? Number.MAX_SAFE_INTEGER;
            if (yearA !== yearB) {
                return yearA - yearB;
            }
            const episodeA = Math.min(...a.episodeNumbers);
            const episodeB = Math.min(...b.episodeNumbers);
            if (episodeA !== episodeB) {
                return episodeA - episodeB;
            }
            return a.key.localeCompare(b.key);
        });
        const seriesKeys = sortedSeries.map((item) => item.key);
        return {
            key: bucket.key,
            title: bucket.title,
            seriesKeys,
            years: {
                min: bucket.minYear,
                max: bucket.maxYear,
            },
            count: seriesKeys.length,
        };
    });
    umbrellas.sort((a, b) => {
        const yearA = a.years.min ?? Number.MAX_SAFE_INTEGER;
        const yearB = b.years.min ?? Number.MAX_SAFE_INTEGER;
        if (yearA !== yearB) {
            return yearA - yearB;
        }
        return a.key.localeCompare(b.key);
    });
    return { umbrellas };
}
