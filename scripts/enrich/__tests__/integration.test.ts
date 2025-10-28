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
  assert.equal(result.collections.map((item) => item.key).join(","), [...result.collections].map((item) => item.key).sort().join(","));
  for (const episodes of Object.values(result.umbrellas.index) as number[][]) {
    const sorted = [...episodes].sort((a, b) => a - b);
    assert.deepEqual(episodes, sorted);
  }
  assert.equal(result.summary.llmCalls, 0);
  assert.equal(result.summary.llmSkipped, 0);
});
