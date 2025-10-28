import OpenAI from 'openai';
import { createHash } from 'crypto';
import {
  readJsonFile,
  writeJsonFile,
} from './utils.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EPISODE_SYSTEM_PROMPT = `You extract structured historical metadata from a podcast episode.
Return strict JSON only, matching the provided schema. Use only the episode title and description.
Do not invent facts. If unsure, use null or empty arrays.`;

const SERIES_SYSTEM_PROMPT = `You summarize a mini-series title and its historical span using only member episode titles/descriptions.
Return strict JSON only. Do not invent dates.`;

const EPISODE_USER_TEMPLATE = `EPISODE:
Title: {{title}}
Description (HTML may appear): {{description}}

TASKS:
1) yearFrom/yearTo: earliest and latest historical year clearly covered in this episode.
2) keyPeople: proper names of historical figures.
3) keyPlaces: places/regions/cities/countries.
4) keyBattles: battle/campaign names if explicitly mentioned.
5) keyDates: precise dates in "YYYY-MM-DD" when present; otherwise "YYYY".
6) organizations: armies/navies/governments/parties if mentioned.
7) themes: 3–7 topical tags.

Return JSON:
{
  "yearFrom": number|null,
  "yearTo": number|null,
  "keyPeople": string[],
  "keyPlaces": string[],
  "keyBattles": string[],
  "keyDates": string[],
  "organizations": string[],
  "themes": string[],
  "confidence": number
}`;

const SERIES_USER_TEMPLATE = `SERIES ANCHOR TITLE: {{seriesTitle}}
EPISODES (title + description):
{{episodes}}

TASKS:
1) publicTitle: concise, evocative series display title (max ~60 chars), avoid duplication with episode subtitles.
2) yearFrom/yearTo: min/max historical years covered across these episodes.

Return JSON:
{
  "publicTitle": "string",
  "yearFrom": number|null,
  "yearTo": number|null,
  "confidence": number
}`;

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const bypassCacheReads = args.includes('--no-cache');

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
  console.error('Error: Missing OPENAI_API_KEY. Please set it in your repository secrets.');
  process.exit(1);
}

function stripHtml(value) {
  if (!value) return '';
  return value
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r?\n/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hashSha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

function buildEpisodeCacheKey(episode) {
  const title = episode.title ?? '';
  const description = episode.description ?? '';
  const hash = hashSha256(`${title}\n${description}`);
  return `EP::${episode.id}::${hash}`;
}

function buildSeriesCacheKey(series, episodesById) {
  const items = [];
  for (const episodeId of series.episodeIds ?? []) {
    const episode = episodesById.get(episodeId);
    if (!episode) continue;
    const title = episode.title ?? '';
    const description = episode.description ?? '';
    items.push(`${title}\n${description}`);
  }
  const payload = `${series.title ?? ''}\n${items.join('\n--\n')}`;
  const hash = hashSha256(payload);
  return `SER::${series.id}::${hash}`;
}

function formatEpisodePrompt(episode, withReminder = false) {
  const cleanDescription = stripHtml(episode.description ?? '');
  const base = EPISODE_USER_TEMPLATE
    .replace('{{title}}', episode.title ?? '')
    .replace('{{description}}', cleanDescription);
  if (withReminder) {
    return `${base}\n\nREMINDER: Return strict JSON only.`;
  }
  return base;
}

function formatSeriesPrompt(series, orderedEpisodes, withReminder = false) {
  const parts = orderedEpisodes.map((episode) => {
    const cleanDescription = stripHtml(episode.description ?? '');
    return `- ${episode.title ?? ''}\n  ${cleanDescription}`;
  });
  const episodesBlock = parts.join('\n');
  const base = SERIES_USER_TEMPLATE
    .replace('{{seriesTitle}}', series.title ?? '')
    .replace('{{episodes}}', episodesBlock);
  if (withReminder) {
    return `${base}\n\nREMINDER: Return strict JSON only.`;
  }
  return base;
}

function ensureStringArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const results = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    results.push(trimmed);
  }
  return results;
}

function sanitizeYear(value) {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  if (normalized < -10000 || normalized > 3000) {
    return null;
  }
  return normalized;
}

function sanitizeConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

function normalizeExistingYear(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return null;
}

function applyEpisodeDefaults(episode) {
  episode.yearFrom = normalizeExistingYear(episode.yearFrom);
  episode.yearTo = normalizeExistingYear(episode.yearTo);
  const arrayFields = [
    'keyPeople',
    'keyPlaces',
    'keyBattles',
    'keyDates',
    'organizations',
    'themes',
  ];
  for (const field of arrayFields) {
    if (!Array.isArray(episode[field])) {
      episode[field] = [];
    } else {
      episode[field] = ensureStringArray(episode[field]);
    }
  }
  if (typeof episode.confidence !== 'number' || !Number.isFinite(episode.confidence)) {
    episode.confidence = 0;
  }
}

function applySeriesDefaults(series) {
  if (typeof series.publicTitle !== 'string') {
    series.publicTitle = series.title ?? '';
  } else {
    series.publicTitle = series.publicTitle.trim() || (series.title ?? '');
  }
  series.yearFrom = normalizeExistingYear(series.yearFrom);
  series.yearTo = normalizeExistingYear(series.yearTo);
}

function validateEpisodePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Episode payload must be an object.');
  }
  const cleaned = {
    yearFrom: sanitizeYear(payload.yearFrom),
    yearTo: sanitizeYear(payload.yearTo),
    keyPeople: ensureStringArray(payload.keyPeople),
    keyPlaces: ensureStringArray(payload.keyPlaces),
    keyBattles: ensureStringArray(payload.keyBattles),
    keyDates: ensureStringArray(payload.keyDates),
    organizations: ensureStringArray(payload.organizations),
    themes: ensureStringArray(payload.themes),
    confidence: sanitizeConfidence(payload.confidence),
  };
  if (cleaned.yearFrom !== null && cleaned.yearTo !== null && cleaned.yearFrom > cleaned.yearTo) {
    const min = Math.min(cleaned.yearFrom, cleaned.yearTo);
    const max = Math.max(cleaned.yearFrom, cleaned.yearTo);
    cleaned.yearFrom = min;
    cleaned.yearTo = max;
  }
  return cleaned;
}

function validateSeriesPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Series payload must be an object.');
  }
  const publicTitle = typeof payload.publicTitle === 'string' ? payload.publicTitle.trim() : '';
  const cleaned = {
    publicTitle,
    yearFrom: sanitizeYear(payload.yearFrom),
    yearTo: sanitizeYear(payload.yearTo),
    confidence: sanitizeConfidence(payload.confidence),
  };
  if (cleaned.yearFrom !== null && cleaned.yearTo !== null && cleaned.yearFrom > cleaned.yearTo) {
    const min = Math.min(cleaned.yearFrom, cleaned.yearTo);
    const max = Math.max(cleaned.yearFrom, cleaned.yearTo);
    cleaned.yearFrom = min;
    cleaned.yearTo = max;
  }
  return cleaned;
}

async function callChatCompletions({ messages, label }) {
  const model = process.env.LLM_MODEL || 'gpt-5-nano';
  const basePayload = {
    model,
    messages,
    response_format: { type: 'json_object' },
  };

  if (model !== 'gpt-5-nano') {
    basePayload.temperature = 0.2;
  }

  try {
    const response = await openai.chat.completions.create(basePayload);
    const usage = response?.usage ?? {};
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
    console.log(`LLM call (${label}) using ${basePayload.model}: prompt ${promptTokens}, completion ${completionTokens}, total ${totalTokens}`);
    return { response, model: basePayload.model, usage };
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? error.message : String(error);
    console.warn(`LLM call (${label}) failed on ${basePayload.model}: ${message}`);

    if (model !== 'gpt-5-nano') {
      throw error;
    }

    console.warn(`Primary model ${model} failed, retrying with gpt-4.1-mini`);
    basePayload.model = 'gpt-4.1-mini';
    basePayload.temperature = 0.2;

    const retry = await openai.chat.completions.create(basePayload);
    const usage = retry?.usage ?? {};
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
    console.log(`LLM call (${label}) using ${basePayload.model}: prompt ${promptTokens}, completion ${completionTokens}, total ${totalTokens}`);
    return { response: retry, model: basePayload.model, usage };
  }
}

async function fetchEpisodeEnrichment(episode) {
  const messagesBase = [
    { role: 'system', content: EPISODE_SYSTEM_PROMPT },
  ];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const withReminder = attempt === 1;
    const userContent = formatEpisodePrompt(episode, withReminder);
    const messages = [...messagesBase, { role: 'user', content: userContent }];
    try {
      const { response, model, usage } = await callChatCompletions({ messages, label: `episode ${episode.id}` });
      const content = response?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('Empty response content.');
      }
      const parsed = JSON.parse(content);
      const validated = validateEpisodePayload(parsed);
      return { data: validated, model, usage };
    } catch (error) {
      if (attempt === 0) {
        const message = error && typeof error === 'object' && 'message' in error ? error.message : String(error);
        console.warn(`Episode ${episode.id} attempt ${attempt + 1} failed: ${message}. Retrying with strict reminder.`);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Episode ${episode.id} enrichment failed after retries.`);
}

async function fetchSeriesEnrichment(series, orderedEpisodes) {
  const messagesBase = [
    { role: 'system', content: SERIES_SYSTEM_PROMPT },
  ];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const withReminder = attempt === 1;
    const userContent = formatSeriesPrompt(series, orderedEpisodes, withReminder);
    const messages = [...messagesBase, { role: 'user', content: userContent }];
    try {
      const { response, model, usage } = await callChatCompletions({ messages, label: `series ${series.id}` });
      const content = response?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('Empty response content.');
      }
      const parsed = JSON.parse(content);
      const validated = validateSeriesPayload(parsed);
      return { data: validated, model, usage };
    } catch (error) {
      if (attempt === 0) {
        const message = error && typeof error === 'object' && 'message' in error ? error.message : String(error);
        console.warn(`Series ${series.id} attempt ${attempt + 1} failed: ${message}. Retrying with strict reminder.`);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Series ${series.id} enrichment failed after retries.`);
}

async function main() {
  const [episodes, series] = await Promise.all([
    readJsonFile('public/episodes.json', []),
    readJsonFile('public/series.json', []),
  ]);
  const cache = await readJsonFile('data/inference-cache.json', {});
  const episodesById = new Map(episodes.map((episode) => [episode.id, episode]));

  let cacheChanged = false;
  let episodesUpdated = 0;
  let episodesCached = 0;
  let seriesUpdated = 0;
  let seriesCached = 0;

  for (const episode of episodes) {
    applyEpisodeDefaults(episode);
    if (!episode || typeof episode.id !== 'string') {
      continue;
    }
    const cacheKey = buildEpisodeCacheKey(episode);
    const cachedEntry = !bypassCacheReads ? cache[cacheKey] : undefined;
    let payload = null;
    let fromCache = false;
    if (cachedEntry && cachedEntry.data) {
      try {
        payload = validateEpisodePayload(cachedEntry.data);
        fromCache = true;
      } catch (error) {
        console.warn(`Invalid cached episode payload for ${episode.id}, ignoring cache: ${error.message ?? error}`);
      }
    }
    if (!payload) {
      try {
        const { data, model, usage } = await fetchEpisodeEnrichment(episode);
        payload = data;
        if (!isDryRun) {
          cache[cacheKey] = {
            type: 'episode',
            cachedAt: new Date().toISOString(),
            model,
            usage,
            data: payload,
          };
          cacheChanged = true;
        }
      } catch (error) {
        const message = error && typeof error === 'object' && 'message' in error ? error.message : String(error);
        console.error(`Failed to enrich episode ${episode.id}: ${message}`);
        payload = null;
      }
    }
    if (payload) {
      episode.yearFrom = payload.yearFrom;
      episode.yearTo = payload.yearTo;
      episode.keyPeople = payload.keyPeople;
      episode.keyPlaces = payload.keyPlaces;
      episode.keyBattles = payload.keyBattles;
      episode.keyDates = payload.keyDates;
      episode.organizations = payload.organizations;
      episode.themes = payload.themes;
      episode.confidence = payload.confidence;
      episodesUpdated += 1;
      if (fromCache) {
        episodesCached += 1;
      }
    }
  }

  for (const entry of series) {
    applySeriesDefaults(entry);
    if (!entry || typeof entry.id !== 'string') {
      continue;
    }
    const relevantEpisodes = (entry.episodeIds ?? [])
      .map((episodeId) => episodesById.get(episodeId))
      .filter((episode) => Boolean(episode));
    const cacheKey = buildSeriesCacheKey(entry, episodesById);
    const cachedEntry = !bypassCacheReads ? cache[cacheKey] : undefined;
    let payload = null;
    let fromCache = false;
    if (cachedEntry && cachedEntry.data) {
      try {
        payload = validateSeriesPayload(cachedEntry.data);
        fromCache = true;
      } catch (error) {
        console.warn(`Invalid cached series payload for ${entry.id}, ignoring cache: ${error.message ?? error}`);
      }
    }
    if (!payload && relevantEpisodes.length > 0) {
      try {
        const orderedEpisodes = relevantEpisodes.map((episode) => episode);
        const { data, model, usage } = await fetchSeriesEnrichment(entry, orderedEpisodes);
        payload = data;
        if (!isDryRun) {
          cache[cacheKey] = {
            type: 'series',
            cachedAt: new Date().toISOString(),
            model,
            usage,
            data: payload,
          };
          cacheChanged = true;
        }
      } catch (error) {
        const message = error && typeof error === 'object' && 'message' in error ? error.message : String(error);
        console.error(`Failed to enrich series ${entry.id}: ${message}`);
        payload = null;
      }
    }
    if (payload) {
      entry.publicTitle = payload.publicTitle || (entry.title ?? '');
      entry.yearFrom = payload.yearFrom;
      entry.yearTo = payload.yearTo;
      seriesUpdated += 1;
      if (fromCache) {
        seriesCached += 1;
      }
    } else {
      entry.publicTitle = entry.publicTitle || (entry.title ?? '');
      if (entry.yearFrom !== null && typeof entry.yearFrom !== 'number') {
        entry.yearFrom = null;
      }
      if (entry.yearTo !== null && typeof entry.yearTo !== 'number') {
        entry.yearTo = null;
      }
    }
  }

  if (!isDryRun) {
    await writeJsonFile('public/episodes.json', episodes);
    await writeJsonFile('public/series.json', series);
    if (cacheChanged) {
      await writeJsonFile('data/inference-cache.json', cache);
    }
  } else {
    console.log('Dry run enabled: skipping writes to disk.');
  }

  console.log(`LLM Enrich: episodes updated ${episodesUpdated} (cached ${episodesCached}), series updated ${seriesUpdated} (cached ${seriesCached})${isDryRun ? ' (dry-run)' : ''}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
