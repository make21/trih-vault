import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import MiniSearch from "minisearch";
import { afterEach, describe, expect, it } from "vitest";

import { MINI_SEARCH_OPTIONS } from "@/lib/search/options";

import { buildSearchIndex } from "../build-search-index";

describe("buildSearchIndex", () => {
  let tempDir: string | null = null;

  const runBuilder = () => {
    tempDir = mkdtempSync(join(tmpdir(), "search-index-test-"));
    const outputPath = join(tempDir, "search-index.json");
    const metadataPath = join(tempDir, "search-index.meta.json");
    buildSearchIndex({
      outputPath,
      metadataPath,
      enableLogging: false,
      enforceBudget: false
    });
    return { outputPath, metadataPath };
  };

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("produces a searchable MiniSearch index with episodes, series, and entities", () => {
    const { outputPath, metadataPath } = runBuilder();
    const rawIndex = readFileSync(outputPath, "utf-8");
    const miniSearch = MiniSearch.loadJSON(rawIndex, MINI_SEARCH_OPTIONS);

    const hannibalHits = miniSearch.search("Hannibal");
    expect(hannibalHits.some((hit) => hit.slug === "people/hannibal")).toBe(true);

    const nelsonHits = miniSearch.search("Nelson");
    expect(nelsonHits.some((hit) => typeof hit.slug === "string" && hit.slug.includes("nelson"))).toBe(true);

    const yearHits = miniSearch.search("1066");
    expect(yearHits.length).toBeGreaterThan(0);

    const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
    expect(metadata.facets.people.length).toBeGreaterThan(0);
  });
});
