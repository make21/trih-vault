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
    strict_1.default.equal(result.collections.map((item) => item.key).join(","), [...result.collections].map((item) => item.key).sort().join(","));
    for (const episodes of Object.values(result.umbrellas.index)) {
        const sorted = [...episodes].sort((a, b) => a - b);
        strict_1.default.deepEqual(episodes, sorted);
    }
    strict_1.default.equal(result.summary.llmCalls, 0);
    strict_1.default.equal(result.summary.llmSkipped, 0);
});
