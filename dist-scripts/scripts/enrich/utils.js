"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = slugify;
exports.cleanTitleStem = cleanTitleStem;
exports.parseDate = parseDate;
exports.daysBetween = daysBetween;
exports.uniqueSorted = uniqueSorted;
exports.clamp = clamp;
exports.median = median;
exports.average = average;
exports.sortEpisodesByNumber = sortEpisodesByNumber;
exports.toKebabCase = toKebabCase;
exports.ensureArray = ensureArray;
exports.toTitleCase = toTitleCase;
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
}
function cleanTitleStem(stem) {
    return stem
        .replace(/[\s\-:–—]+$/g, "")
        .replace(/^[-:–—\s]+/g, "")
        .trim();
}
function parseDate(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed;
}
function daysBetween(a, b) {
    if (!a || !b)
        return null;
    const diff = Math.abs(a.getTime() - b.getTime());
    return Math.round(diff / (1000 * 60 * 60 * 24));
}
function uniqueSorted(values) {
    return Array.from(new Set(values)).sort();
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function median(values) {
    if (!values.length)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}
function average(values) {
    if (!values.length)
        return null;
    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
}
function sortEpisodesByNumber(items) {
    return [...items].sort((a, b) => a.episode - b.episode);
}
function toKebabCase(value) {
    return slugify(value);
}
function ensureArray(value) {
    if (Array.isArray(value))
        return value;
    if (value === null || value === undefined)
        return [];
    return [value];
}
function toTitleCase(value) {
    return value
        .split(/\s+/)
        .map((segment) => {
        if (!segment)
            return segment;
        const lower = segment.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
        .join(" ")
        .trim();
}
