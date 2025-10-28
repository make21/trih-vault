import test from "node:test";
import assert from "node:assert/strict";
import { detectSeriesGroups } from "../series";
import type { Episode } from "../types";

const baseEpisode = (episode: number, title: string, date: string, extra?: Partial<Episode>): Episode => ({
  episode,
  title_feed: title,
  title_sheet: null,
  description: null,
  pubDate: date,
  slug: `ep-${episode}`,
  ...extra,
});

test("detects sequential series with gaps", () => {
  const episodes: Episode[] = [
    baseEpisode(10, "Columbus Part I", "2023-01-01"),
    baseEpisode(11, "Columbus Part II", "2023-01-05"),
    baseEpisode(13, "Columbus Part III", "2023-01-12"),
    baseEpisode(14, "Bonus Episode", "2023-01-20"),
  ];
  const result = detectSeriesGroups(episodes);
  const group = result.get("columbus");
  assert.ok(group);
  assert.equal(group?.episodes.length, 3);
  assert.equal(group?.parts[group.parts.length - 1], 3);
});

test("rejects series with large gaps", () => {
  const episodes: Episode[] = [
    baseEpisode(1, "Vikings Part I", "2023-01-01"),
    baseEpisode(5, "Vikings Part II", "2023-03-01"),
  ];
  const result = detectSeriesGroups(episodes);
  assert.equal(result.size, 0);
});

test("handles roman numerals", () => {
  const episodes: Episode[] = [
    baseEpisode(20, "Normans Part I", "2023-02-01"),
    baseEpisode(21, "Normans Part II", "2023-02-05"),
    baseEpisode(22, "Normans Part III", "2023-02-10"),
  ];
  const result = detectSeriesGroups(episodes);
  assert.equal(result.get("normans")?.parts[2], 3);
});
