import { describe, it, expect } from "vitest";

import { buildEpisodeStructuredData, stringifyJsonLd } from "../structuredData";
import type { PublicEpisode } from "@/types";

const baseEpisode: PublicEpisode = {
  id: "1",
  episodeId: "ep1",
  title: "Episode",
  slug: "episode",
  publishedAt: "2024-01-01",
  description: "Description",
  audioUrl: "https://example.com/audio.mp3",
  rssLastSeenAt: "2024-01-02",
  itunesEpisode: null,
  cleanTitle: "Episode",
  cleanDescriptionMarkdown: "Episode description",
  cleanDescriptionText: "Episode description",
  descriptionBlocks: [],
  fingerprint: "fp",
  cleanupVersion: 1,
  seriesId: null,
  seriesKey: null,
  seriesKeyRaw: null,
  seriesGroupingConfidence: "high",
  keyPeople: [],
  keyPlaces: [],
  keyThemes: [],
  keyTopics: [],
  yearFrom: null,
  yearTo: null,
  yearConfidence: "unknown",
  part: null
};

describe("stringifyJsonLd", () => {
  it("escapes closing script tags from episode descriptions", () => {
    const episode = {
      ...baseEpisode,
      cleanDescriptionMarkdown: "Episode </script> description",
      cleanDescriptionText: "Episode </script> description"
    } satisfies PublicEpisode;

    const structuredData = stringifyJsonLd(buildEpisodeStructuredData(episode));

    expect(structuredData).not.toContain("</script>");
    expect(structuredData).toContain("\\u003C/script\\u003E");
  });

  it("escapes characters that can break script tags", () => {
    const json = stringifyJsonLd({ value: "<&>\u2028\u2029" });

    expect(json).toContain("\\u003C");
    expect(json).toContain("\\u003E");
    expect(json).toContain("\\u0026");
    expect(json).toContain("\\u2028");
    expect(json).toContain("\\u2029");
  });
});
