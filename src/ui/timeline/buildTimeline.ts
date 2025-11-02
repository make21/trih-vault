import type { TimelineRow } from "@/ui/timeline/layout";

export type RawEpisodeInput = {
  id: string;
  cleanTitle: string;
  yearFrom: number | null;
  yearTo: number | null;
  seriesId: string | null;
  part: number | null;
  publishedAt: string | null;
};

export type RawSeriesDerived = {
  episodeCount: number;
  episodeSummaries?: {
    cleanDescriptionText: string;
    cleanTitle: string;
    part: number | null;
  }[];
};

export type RawSeriesInput = {
  id: string;
  seriesTitle: string;
  yearFrom: number | null;
  yearTo: number | null;
  episodeIds: string[];
  episodeCount?: number;
  derived?: RawSeriesDerived;
};

export type EpisodeSummary = {
  id: string;
  title: string;
  yearLabel: string | null;
  partLabel: string | null;
};

export type UndatedEpisode = {
  id: string;
  title: string;
  publishedLabel: string;
};

export type TimelineEpisodeRowData = {
  kind: "episode";
  yearLabel: string;
  yearValue: number | null;
};

export type TimelineSeriesRowData = {
  kind: "series";
  yearLabel: string;
  yearValue: number | null;
  episodeCount: number;
  episodes: EpisodeSummary[];
};

export type TimelineDisplayRowData = TimelineEpisodeRowData | TimelineSeriesRowData;
export type TimelineDisplayRow = TimelineRow<TimelineDisplayRowData>;

export type BuildTimelineOptions = {
  episodes: RawEpisodeInput[];
  series: RawSeriesInput[];
};

export type BuildTimelineResult = {
  rows: TimelineDisplayRow[];
  undated: UndatedEpisode[];
};

const primaryYear = (yearFrom: number | null, yearTo: number | null): number | null => {
  if (typeof yearFrom === "number") {
    return yearFrom;
  }
  if (typeof yearTo === "number") {
    return yearTo;
  }
  return null;
};

const formatYearValue = (year: number): string => {
  if (year < 0) {
    return `${Math.abs(year)} BC`;
  }
  return `${year}`;
};

const formatYearRange = (yearFrom: number | null, yearTo: number | null): string => {
  if (typeof yearFrom === "number" && typeof yearTo === "number") {
    if (yearFrom === yearTo) {
      return formatYearValue(yearFrom);
    }
    return `${formatYearValue(yearFrom)} – ${formatYearValue(yearTo)}`;
  }
  if (typeof yearFrom === "number") {
    return formatYearValue(yearFrom);
  }
  if (typeof yearTo === "number") {
    return formatYearValue(yearTo);
  }
  return "Undated";
};

const formatPartLabel = (part: number | null): string | null => {
  if (!part || Number.isNaN(part)) {
    return null;
  }
  return `Part ${part}`;
};

const formatPublishedLabel = (publishedAt: string | null): string => {
  if (!publishedAt) {
    return "Published date unknown";
  }

  const time = Date.parse(publishedAt);
  if (Number.isNaN(time)) {
    return "Published date unknown";
  }

  return `Published ${new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(time)}`;
};

export function buildTimeline(options: BuildTimelineOptions): BuildTimelineResult {
  const { episodes, series } = options;

  const episodesById = new Map<string, RawEpisodeInput>();
  episodes.forEach((episode) => {
    episodesById.set(episode.id, episode);
  });

  const standaloneEpisodes = episodes
    .filter((episode) => !episode.seriesId)
    .map((episode) => ({
      id: episode.id,
      title: episode.cleanTitle,
      yearFrom: episode.yearFrom,
      yearTo: episode.yearTo,
      primaryYear: primaryYear(episode.yearFrom, episode.yearTo)
    }));

  const undatedEpisodes = standaloneEpisodes
    .filter((episode) => episode.primaryYear === null)
    .map((episode) => {
      const raw = episodesById.get(episode.id);
      return {
        id: episode.id,
        title: episode.title,
        publishedLabel: formatPublishedLabel(raw?.publishedAt ?? null)
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  const datedStandaloneEpisodes = standaloneEpisodes.filter((episode) => episode.primaryYear !== null);

  const seriesRows: TimelineDisplayRow[] = series.map((seriesRecord) => {
    const orderIndex = new Map<string, number>();
    seriesRecord.episodeIds.forEach((episodeId, index) => {
      orderIndex.set(episodeId, index);
    });

    const resolvedEpisodeCount =
      typeof seriesRecord.derived?.episodeCount === "number"
        ? seriesRecord.derived.episodeCount
        : typeof seriesRecord.episodeCount === "number"
          ? seriesRecord.episodeCount
          : seriesRecord.episodeIds.length;

    const memberEpisodes = seriesRecord.episodeIds
      .map((episodeId) => episodesById.get(episodeId))
      .filter((episode): episode is RawEpisodeInput => Boolean(episode));

    const derivedYearFrom =
      typeof seriesRecord.yearFrom === "number"
        ? seriesRecord.yearFrom
        : memberEpisodes.reduce<number | null>((acc, episode) => {
            const candidate = primaryYear(episode.yearFrom, episode.yearTo);
            if (candidate === null) {
              return acc;
            }
            if (acc === null || candidate < acc) {
              return candidate;
            }
            return acc;
          }, null);

    const derivedYearTo =
      typeof seriesRecord.yearTo === "number"
        ? seriesRecord.yearTo
        : memberEpisodes.reduce<number | null>((acc, episode) => {
            const candidate =
              typeof episode.yearTo === "number" ? episode.yearTo : primaryYear(episode.yearFrom, episode.yearTo);
            if (candidate === null) {
              return acc;
            }
            if (acc === null || candidate > acc) {
              return candidate;
            }
            return acc;
          }, null);

    const sortedMemberEpisodes = [...memberEpisodes].sort((a, b) => {
      const indexA = orderIndex.get(a.id) ?? Number.POSITIVE_INFINITY;
      const indexB = orderIndex.get(b.id) ?? Number.POSITIVE_INFINITY;
      if (indexA !== indexB) {
        return indexA - indexB;
      }
      const yearA = primaryYear(a.yearFrom, a.yearTo);
      const yearB = primaryYear(b.yearFrom, b.yearTo);
      if (yearA !== null && yearB !== null && yearA !== yearB) {
        return yearA - yearB;
      }
      const partA = a.part ?? Number.POSITIVE_INFINITY;
      const partB = b.part ?? Number.POSITIVE_INFINITY;
      if (partA !== partB) {
        return partA - partB;
      }
      return a.cleanTitle.localeCompare(b.cleanTitle);
    });

    return {
      id: seriesRecord.id,
      title: seriesRecord.seriesTitle,
      yearFrom: derivedYearFrom,
      yearTo: derivedYearTo,
      data: {
        kind: "series" as const,
        yearLabel: formatYearRange(derivedYearFrom, derivedYearTo),
        yearValue: primaryYear(derivedYearFrom, derivedYearTo),
        episodeCount: resolvedEpisodeCount,
        episodes: sortedMemberEpisodes.map((episode) => ({
          id: episode.id,
          title: episode.cleanTitle,
          yearLabel:
            typeof episode.yearFrom === "number" || typeof episode.yearTo === "number"
              ? formatYearRange(episode.yearFrom, episode.yearTo)
              : null,
          partLabel: formatPartLabel(episode.part)
        }))
      }
    };
  });

  const datedSeriesRows = seriesRows.filter(
    (row) => typeof row.yearFrom === "number" || typeof row.yearTo === "number"
  );

  const episodeRows: TimelineDisplayRow[] = datedStandaloneEpisodes.map((episode) => ({
    id: episode.id,
    title: episode.title,
    yearFrom: episode.yearFrom,
    yearTo: episode.yearTo,
    data: {
      kind: "episode" as const,
      yearLabel: formatYearRange(episode.yearFrom, episode.yearTo),
      yearValue: primaryYear(episode.yearFrom, episode.yearTo)
    }
  }));

  return {
    rows: [...datedSeriesRows, ...episodeRows],
    undated: undatedEpisodes
  };
}
