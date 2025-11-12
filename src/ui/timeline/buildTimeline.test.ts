import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  type RawEpisodeInput,
  type RawSeriesInput,
  type TimelineDisplayRow
} from "./buildTimeline";

const baseEpisode = (overrides: Partial<RawEpisodeInput>): RawEpisodeInput => {
  const id = overrides.id ?? "episode";
  return {
    id,
    slug: overrides.slug ?? id,
    cleanTitle: "Episode",
    yearFrom: null,
    yearTo: null,
    seriesId: null,
    part: null,
    publishedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
};

describe("buildTimeline", () => {
  it("returns episode rows with formatted BC ranges", () => {
    const episodes: RawEpisodeInput[] = [
      baseEpisode({ id: "ep-44bc", cleanTitle: "44 BC", yearFrom: -44, yearTo: -44 }),
      baseEpisode({ id: "ep-cross", cleanTitle: "Birth of Christ", yearFrom: -4, yearTo: 33 })
    ];

    const { rows } = buildTimeline({ episodes, series: [] });

    const episodeRows = rows.filter((row) => row.data?.kind === "episode");
    expect(episodeRows).toHaveLength(2);
    const [first, second] = episodeRows as TimelineDisplayRow[];
    expect(first.data).toMatchObject({ yearLabel: "44 BC", yearValue: -44 });
    expect(second.data).toMatchObject({ yearLabel: "4 BC – 33", yearValue: -4 });
  });

  it("aggregates series metadata into a single row", () => {
    const seriesEpisodes: RawEpisodeInput[] = [
      baseEpisode({
        id: "part-1",
        cleanTitle: "Episode One",
        yearFrom: 1914,
        seriesId: "series-ww1",
        part: 1
      }),
      baseEpisode({
        id: "part-2",
        cleanTitle: "Episode Two",
        yearTo: 1918,
        seriesId: "series-ww1",
        part: 2
      })
    ];

    const standaloneEpisodes: RawEpisodeInput[] = [
      baseEpisode({ id: "standalone", cleanTitle: "Cold War", yearFrom: 1950 })
    ];

    const series: RawSeriesInput[] = [
      {
        id: "series-ww1",
        slug: "world-war-i",
        seriesTitle: "World War I",
        yearFrom: null,
        yearTo: null,
        episodeCount: 2,
        episodeIds: ["part-1", "part-2"]
      }
    ];

    const { rows, undated } = buildTimeline({
      episodes: [...seriesEpisodes, ...standaloneEpisodes],
      series
    });

    const seriesRow = rows.find((row) => row.id === "series-ww1");
    expect(seriesRow?.data).toMatchObject({
      kind: "series",
      yearLabel: "1914 – 1918",
      yearValue: 1914,
      episodeCount: 2
    });
    expect(seriesRow?.href).toBe("/series/world-war-i");
    expect(seriesRow?.data && "episodes" in seriesRow.data ? seriesRow.data.episodes : []).toEqual([
      expect.objectContaining({ id: "part-1", partLabel: "Part 1", yearLabel: "1914" }),
      expect.objectContaining({ id: "part-2", partLabel: "Part 2", yearLabel: "1918" })
    ]);

    const episodeRow = rows.find((row) => row.id === "standalone");
    expect(episodeRow?.data).toMatchObject({ kind: "episode", yearLabel: "1950", yearValue: 1950 });
    expect(episodeRow?.href).toBe("/episode/standalone");

    expect(undated).toHaveLength(0);
  });

  it("collects undated standalone episodes", () => {
    const episodes: RawEpisodeInput[] = [
      baseEpisode({ id: "dated", cleanTitle: "Stonehenge", yearFrom: -3000 }),
      baseEpisode({ id: "undated", cleanTitle: "Mystery", yearFrom: null, yearTo: null })
    ];

    const { rows, undated } = buildTimeline({ episodes, series: [] });

    expect(rows.map((row) => row.id)).toContain("dated");
    expect(undated).toHaveLength(1);
    expect(undated[0]).toMatchObject({ id: "undated", slug: "undated", title: "Mystery" });
    expect(undated[0]!.publishedLabel.startsWith("Published ")).toBe(true);
  });
});
