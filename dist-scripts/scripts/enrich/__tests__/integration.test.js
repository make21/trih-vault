"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const enrich_1 = require("../enrich");
const rootDir = process.cwd();
(0, node_test_1.default)("dry-run enrichment builds collections deterministically", async () => {
    const result = await (0, enrich_1.enrichEpisodes)({
        rootDir,
        dryRun: true,
        cacheOnly: true,
        verbose: false,
    });
    strict_1.default.ok(Array.isArray(result.episodes));
    strict_1.default.ok(result.episodes.length > 0);
    const collectionKeys = result.collections.map((item) => item.key);
    strict_1.default.equal(new Set(collectionKeys).size, collectionKeys.length);
    for (const umbrella of result.umbrellas.umbrellas) {
        const uniqueKeys = new Set(umbrella.seriesKeys);
        strict_1.default.equal(uniqueKeys.size, umbrella.seriesKeys.length);
        strict_1.default.equal(umbrella.count, umbrella.seriesKeys.length);
        if (umbrella.years.min !== null && umbrella.years.max !== null) {
            strict_1.default.ok(umbrella.years.min <= umbrella.years.max);
        }
    }
    strict_1.default.equal(result.summary.llmCalls, 0);
    strict_1.default.equal(result.summary.llmSkipped, 0);
});
