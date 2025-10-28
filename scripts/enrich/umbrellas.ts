import fs from "fs";
import path from "path";
import { z } from "zod";
import type { Series, UmbrellaIndex } from "./types";
import { toKebabCase } from "./utils";

const UmbrellaOverrideSchema = z.object({
  key: z.string().optional(),
  title: z.string().optional(),
});

const UmbrellaOverridesSchema = z.record(z.string(), UmbrellaOverrideSchema);

export type UmbrellaOverrides = z.infer<typeof UmbrellaOverridesSchema>;

function resolveOverridePath(rootDir: string): string {
  return path.join(rootDir, "data", "umbrella-overrides.json");
}

export function loadUmbrellaOverrides(rootDir: string): UmbrellaOverrides {
  const filePath = resolveOverridePath(rootDir);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const result = UmbrellaOverridesSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Umbrella overrides at ${filePath} failed validation`);
  }
  return result.data;
}

interface UmbrellaAggregation {
  key: string;
  title: string;
  series: Series[];
  minYear: number | null;
  maxYear: number | null;
}

function pickYearFloor(series: Series): number | null {
  return series.yearFrom ?? series.yearPrimary ?? series.yearTo ?? null;
}

function pickYearCeil(series: Series): number | null {
  return series.yearTo ?? series.yearPrimary ?? series.yearFrom ?? null;
}

function applyOverridesToSeries(series: Series, overrides: UmbrellaOverrides): Series {
  const override = overrides[series.umbrellaKey];
  if (!override) {
    return series;
  }
  const nextKey = override.key ? toKebabCase(override.key) : series.umbrellaKey;
  const nextTitle = override.title ?? series.umbrellaTitle;
  return {
    ...series,
    umbrellaKey: nextKey,
    umbrellaTitle: nextTitle,
    source: "override",
  };
}

export function applyUmbrellaOverrides(seriesList: Series[], overrides: UmbrellaOverrides): Series[] {
  if (!Object.keys(overrides).length) {
    return seriesList;
  }
  return seriesList.map((series) => applyOverridesToSeries(series, overrides));
}

export function buildUmbrellaIndex(seriesList: Series[]): UmbrellaIndex {
  const buckets = new Map<string, UmbrellaAggregation>();

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
    } else {
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
