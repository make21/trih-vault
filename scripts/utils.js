import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

/**
 * @typedef {Object} Episode
 * @property {string} id
 * @property {string} title
 * @property {string} pubDate
 * @property {string} description
 * @property {string} audioUrl
 * @property {string=} seriesId
 * @property {(number|null)=} part
 */

/**
 * @typedef {Object} Series
 * @property {string} id
 * @property {string} title
 * @property {string[]} episodeIds
 * @property {(number|null)=} yearFrom
 * @property {(number|null)=} yearTo
 * @property {string} topicId
 */

/**
 * @typedef {Object} Topic
 * @property {string} id
 * @property {string} title
 * @property {string[]=} aliases
 * @property {string[]} seriesIds
 */

/**
 * @typedef {Object} YearRange
 * @property {(number|null)} yearFrom
 * @property {(number|null)} yearTo
 */

/**
 * @typedef {YearRange & { cachedAt: string }} EpisodeYearsCacheEntry
 */

/** @typedef {Record<string, EpisodeYearsCacheEntry>} EpisodeYearsCache */

/**
 * @typedef {Object} SeriesNamingCacheEntry
 * @property {string} hash
 * @property {string} seriesStub
 * @property {string} seriesTitle
 * @property {string} topicTitle
 * @property {string[]} aliases
 * @property {string} cachedAt
 */

/** @typedef {Record<string, SeriesNamingCacheEntry>} SeriesNamingCache */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

export const FEED_URL = 'https://feeds.megaphone.fm/GLT4787413333';

export async function readJsonFile(relativePath, defaultValue) {
  const fullPath = path.join(ROOT_DIR, relativePath);
  try {
    const data = await fs.readFile(fullPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error && typeof error === 'object' && /** @type {{ code?: string }} */ (error).code === 'ENOENT') {
      return defaultValue;
    }
    throw error;
  }
}

export async function writeJsonFile(relativePath, data) {
  const fullPath = path.join(ROOT_DIR, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function shortHash(input, length = 10) {
  return createHash('sha1').update(input).digest('hex').slice(0, length);
}

export function slugify(input) {
  const normalised = input
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[_]/g, ' ')
    .toLowerCase();
  const collapsed = normalised
    .split(/\s+/)
    .filter(Boolean)
    .join('-');
  return collapsed.replace(/-+/g, '-');
}

export function kebabCase(input) {
  const slug = slugify(input);
  return slug.startsWith('-') ? slug.slice(1) : slug;
}

export function normaliseWhitespace(input) {
  return input.replace(/\s+/g, ' ').trim();
}

export function deriveStemAndPart(title) {
  const partMatch = title.match(/\bPart\s*(\d+)\b/i);
  let stem = title;
  let part = null;
  if (partMatch) {
    part = Number(partMatch[1]);
    const before = stem.slice(0, partMatch.index ?? 0);
    const after = stem.slice((partMatch.index ?? 0) + partMatch[0].length);
    stem = normaliseWhitespace(`${before} ${after}`);
    stem = stem.replace(/\s*[-:–]\s*$/u, '').trim();
  }
  if (!stem) {
    stem = title;
  }
  stem = stem.replace(/[()]/g, ' ');
  stem = normaliseWhitespace(stem);
  return { stem, part };
}

export function toTitleCase(input) {
  const lower = input.toLowerCase();
  return lower.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

export function computeEpisodeCacheKey(title, description) {
  return shortHash(`${title}\u0000${description}`, 20);
}

export function computeSeriesHash(items) {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  return shortHash(JSON.stringify(sorted), 20);
}

function tokenize(input) {
  const counts = new Map();
  const cleaned = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ');
  for (const word of cleaned.split(/\s+/)) {
    if (!word) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

export function cosineSimilarity(a, b) {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const value of tokensA.values()) {
    normA += value * value;
  }
  for (const value of tokensB.values()) {
    normB += value * value;
  }
  for (const [token, valueA] of tokensA.entries()) {
    const valueB = tokensB.get(token);
    if (valueB) {
      dot += valueA * valueB;
    }
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function uniqueStrings(values) {
  return Array.from(new Set(values));
}

export function ensureSeriesStub(stem) {
  const cleaned = stem
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ');
  let words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    words = ['series'];
  }
  while (words.length < 3) {
    words.push('story');
  }
  if (words.length > 6) {
    words = words.slice(0, 6);
  }
  return words.join('-');
}

export function pickTopicTitle(stem) {
  const [beforeColon, afterColon] = stem.split(/:\s*/, 2);
  if (afterColon) {
    return toTitleCase(beforeColon);
  }
  return toTitleCase(stem);
}

export function seriesTitleFromStem(stem) {
  return toTitleCase(stem);
}

export function nowIso() {
  return new Date().toISOString();
}

export function sortEpisodeIdsByDate(episodeIds, episodesById) {
  return [...episodeIds].sort((a, b) => {
    const episodeA = episodesById.get(a);
    const episodeB = episodesById.get(b);
    if (!episodeA || !episodeB) return a.localeCompare(b);
    return new Date(episodeA.pubDate).getTime() - new Date(episodeB.pubDate).getTime();
  });
}

export function clampYear(year) {
  if (year < -3000) return -3000;
  if (year > 2025) return 2025;
  return year;
}

export function inferYearsFromText(title, description) {
  const combined = `${title}\n${description}`;
  const matches = combined.match(/-?\d{3,4}/g) ?? [];
  const values = [];
  for (const match of matches) {
    const value = Number(match);
    if (!Number.isFinite(value)) continue;
    if (value < -3000 || value > 2025) continue;
    values.push(clampYear(value));
  }
  if (values.length === 0) {
    return { yearFrom: null, yearTo: null };
  }
  return {
    yearFrom: Math.min(...values),
    yearTo: Math.max(...values),
  };
}

export function describeTopic(topic) {
  const aliasText = topic.aliases?.join(' ') ?? '';
  return `${topic.title} ${aliasText}`.trim();
}

