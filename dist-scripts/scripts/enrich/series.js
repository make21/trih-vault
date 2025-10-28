"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectSeriesGroups = detectSeriesGroups;
const utils_1 = require("./utils");
const roman_1 = require("./roman");
const PART_REGEX = /(.*?)(?:\s*[-–—:]\s*)?(?:part|pt\.?)\s*(?:#|no\.?\s*)?([ivxlcdm]+|\d+)/i;
function extractSeriesCandidate(title) {
    if (!title)
        return null;
    const match = title.match(PART_REGEX);
    if (!match)
        return null;
    const rawStem = (0, utils_1.cleanTitleStem)(match[1] ?? "");
    if (!rawStem)
        return null;
    const rawPart = match[2];
    if (!rawPart)
        return null;
    const numeric = /\d+/.test(rawPart) ? Number.parseInt(rawPart, 10) : (0, roman_1.romanToInt)(rawPart);
    if (!numeric || Number.isNaN(numeric) || numeric <= 0)
        return null;
    const key = (0, utils_1.slugify)(rawStem);
    if (!key)
        return null;
    return {
        key,
        stem: rawStem,
        part: numeric,
    };
}
function pickCandidate(episode) {
    const fromSheet = extractSeriesCandidate(episode.title_sheet ?? null);
    if (fromSheet)
        return fromSheet;
    return extractSeriesCandidate(episode.title_feed ?? null);
}
function sortEntries(entries) {
    return [...entries].sort((a, b) => a.episode.episode - b.episode.episode);
}
function isValidSeries(entries) {
    if (entries.length < 2)
        return false;
    const sorted = sortEntries(entries);
    for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (curr.part !== prev.part + 1) {
            return false;
        }
        const episodeGap = curr.episode.episode - prev.episode.episode;
        if (episodeGap > 2) {
            return false;
        }
        const prevDate = (0, utils_1.parseDate)(prev.episode.pubDate);
        const currDate = (0, utils_1.parseDate)(curr.episode.pubDate);
        const diff = (0, utils_1.daysBetween)(prevDate, currDate);
        if (diff !== null && diff > 21) {
            return false;
        }
    }
    return true;
}
function detectSeriesGroups(episodes) {
    const grouped = new Map();
    for (const episode of episodes) {
        const candidate = pickCandidate(episode);
        if (!candidate)
            continue;
        const bucket = grouped.get(candidate.key) ?? [];
        bucket.push({ episode, part: candidate.part, stem: candidate.stem });
        grouped.set(candidate.key, bucket);
    }
    const groupsByKey = new Map();
    for (const [key, entries] of grouped.entries()) {
        if (!isValidSeries(entries)) {
            continue;
        }
        const sorted = sortEntries(entries);
        const stem = sorted[0]?.stem ?? key;
        const parts = sorted.map((item, index) => (index + 1));
        const episodesList = sorted.map((item) => item.episode);
        groupsByKey.set(key, {
            key,
            stem,
            episodes: episodesList,
            parts,
        });
    }
    return groupsByKey;
}
