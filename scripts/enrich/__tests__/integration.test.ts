import test from "node:test";
import assert from "node:assert/strict";
import { enrichEpisodes } from "../enrich";

const rootDir = process.cwd();

test("dry-run enrichment builds collections deterministically", async () => {
  const result = await enrichEpisodes({
    rootDir,
    dryRun: true,
    cacheOnly: true,
    verbose: false,
  });

  assert.ok(Array.isArray(result.episodes));
  assert.ok(result.episodes.length > 0);
  const collectionKeys = result.collections.map((item) => item.key);
  assert.equal(new Set(collectionKeys).size, collectionKeys.length);
  for (const umbrella of result.umbrellas.umbrellas) {
    const uniqueKeys = new Set(umbrella.seriesKeys);
    assert.equal(uniqueKeys.size, umbrella.seriesKeys.length);
    assert.equal(umbrella.count, umbrella.seriesKeys.length);
    if (umbrella.years.min !== null && umbrella.years.max !== null) {
      assert.ok(umbrella.years.min <= umbrella.years.max);
    }
  }
  assert.equal(result.summary.llmCalls, 0);
  assert.equal(result.summary.llmSkipped, 0);
});
