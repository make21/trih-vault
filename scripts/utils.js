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
 * @property {{ head: string }=} provisional
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

export const ARC_GAP_DAYS = 120;

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

export function normalizeTitle(raw){ return raw.replace(/^\s*\d+\.\s*/,"").replace(/\s+/g," ").trim(); }
export function extractPart(title){ const m=title.match(/\(\s*Part\s*(\d+)\s*\)/i); return m?Number(m[1]):null; }
export function seriesHead(title){
  const normalized = normalizeTitle(title || '');
  if (!normalized) {
    return '';
  }
  const [beforeColon, afterColon] = normalized.split(/:/, 2);
  if (afterColon !== undefined) {
    const candidate = beforeColon.trim();
    if (candidate) {
      return candidate;
    }
  }
  const beforeParen = normalized.split('(')[0]?.trim();
  if (beforeParen) {
    return beforeParen;
  }
  return normalized;
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

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @typedef {Object} ArcCandidate
 * @property {number} part
 * @property {number} pubDateValue
 */

/**
 * @typedef {Object} ArcBucketLike
 * @property {Array<ArcCandidate>} entries
 * @property {Set<number>} partsSeen
 * @property {(number|null|undefined)} lastPubValue
 */

/**
 * Determine whether a new arc bucket should be started for the incoming candidate.
 *
 * @param {(ArcBucketLike|null|undefined)} previousBucket
 * @param {ArcCandidate} candidate
 * @param {number} [gapDays=ARC_GAP_DAYS]
 * @returns {boolean}
 */
export function shouldStartNewArc(previousBucket, candidate, gapDays = ARC_GAP_DAYS) {
  if (!previousBucket || !Array.isArray(previousBucket.entries) || previousBucket.entries.length === 0) {
    return true;
  }

  if (candidate.part === 1 && previousBucket.entries.length > 0) {
    return true;
  }

  const lastPubValue = previousBucket.lastPubValue;
  if (Number.isFinite(lastPubValue) && Number.isFinite(candidate.pubDateValue)) {
    const gap = candidate.pubDateValue - lastPubValue;
    if (gap > gapDays * MILLIS_PER_DAY) {
      return true;
    }
  }

  if (previousBucket.partsSeen?.has(candidate.part)) {
    return true;
  }

  return false;
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

