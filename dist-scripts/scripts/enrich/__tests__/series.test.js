"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const series_1 = require("../series");
const baseEpisode = (episode, title, date, extra) => ({
    episode,
    title_feed: title,
    title_sheet: null,
    description: null,
    pubDate: date,
    slug: `ep-${episode}`,
    ...extra,
});
(0, node_test_1.default)("detects sequential series with gaps", () => {
    const episodes = [
        baseEpisode(10, "Columbus Part I", "2023-01-01"),
        baseEpisode(11, "Columbus Part II", "2023-01-05"),
        baseEpisode(13, "Columbus Part III", "2023-01-12"),
        baseEpisode(14, "Bonus Episode", "2023-01-20"),
    ];
    const result = (0, series_1.detectSeriesGroups)(episodes);
    const group = result.get("columbus");
    strict_1.default.ok(group);
    strict_1.default.equal(group?.episodes.length, 3);
    strict_1.default.equal(group?.parts[group.parts.length - 1], 3);
});
(0, node_test_1.default)("rejects series with large gaps", () => {
    const episodes = [
        baseEpisode(1, "Vikings Part I", "2023-01-01"),
        baseEpisode(5, "Vikings Part II", "2023-03-01"),
    ];
    const result = (0, series_1.detectSeriesGroups)(episodes);
    strict_1.default.equal(result.size, 0);
});
(0, node_test_1.default)("handles roman numerals", () => {
    const episodes = [
        baseEpisode(20, "Normans Part I", "2023-02-01"),
        baseEpisode(21, "Normans Part II", "2023-02-05"),
        baseEpisode(22, "Normans Part III", "2023-02-10"),
    ];
    const result = (0, series_1.detectSeriesGroups)(episodes);
    strict_1.default.equal(result.get("normans")?.parts[2], 3);
});
