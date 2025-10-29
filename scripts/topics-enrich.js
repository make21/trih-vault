import {
  kebabCase,
  readJsonFile,
  toTitleCase,
  writeJsonFile,
} from './utils.js';

const TOPICS_SYSTEM_PROMPT =
  'You are an expert historian and data normalizer. Always reply with valid JSON that follows the requested schema. Never include commentary.';

const SERIES_CHUNK_SIZE = 200;
const MAX_ATTEMPTS = 3;

const exampleInput = [
  { id: 's_5c75481c8c', title: 'The French Revolution', publicTitle: 'France in Revolt: 1788–1792' },
  { id: 's_63e442b4d4', title: 'The French Revolution', publicTitle: 'France in Revolt (1792–1793)' },
];

const exampleOutput = {
  topics: [
    {
      id: 't_french-revolution',
      title: 'The French Revolution',
      seriesIds: ['s_5c75481c8c', 's_63e442b4d4'],
      yearFrom: 1788,
      yearTo: 1793,
    },
  ],
};

function normalizeForMatching(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/part\s+[ivx\d]+/gi, ' ')
    .replace(/part\s+\d+/gi, ' ')
    .replace(/\b(?:volume|vol|episode|ep)\s+[ivx\d]+\b/gi, ' ')
    .replace(/\b\d{1,4}\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSeriesPromptEntry(series) {
  return {
    id: series.id,
    title: series.title ?? '',
    publicTitle: series.publicTitle ?? null,
    normalizedTitle: normalizeForMatching(series.title ?? ''),
    normalizedPublicTitle: normalizeForMatching(series.publicTitle ?? ''),
    yearFrom: sanitizeYear(series.yearFrom),
    yearTo: sanitizeYear(series.yearTo),
  };
}

function sanitizeYear(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.trunc(value);
  if (normalized < -5000 || normalized > 3000) {
    return null;
  }
  return normalized;
}

function buildUserPrompt(chunk, withReminder = false) {
  const header = [
    'Group the following series objects into topics when two or more clearly describe the same historical subject or figure.',
    'Ignore standalone series that have no related siblings based on their normalized tokens.',
    'Return JSON only in this exact format:',
    JSON.stringify(exampleOutput, null, 2),
    '',
    'Normalization rules:',
    '- Lowercase the titles.',
    '- Remove punctuation, brackets, episode markers, parts ("Part N"), and year ranges.',
    '- Strip numeric suffixes before comparing tokens.',
    '',
    'Example input and output for guidance:',
    `Input:\n${JSON.stringify(exampleInput, null, 2)}`,
    `Output:\n${JSON.stringify(exampleOutput, null, 2)}`,
    '',
    'Here are the series entries:',
    JSON.stringify(chunk.map(buildSeriesPromptEntry), null, 2),
  ];

  if (withReminder) {
    header.push('', 'REMINDER: Return strict JSON only.');
  }

  return header.join('\n');
}

async function requestTopics(openai, chunk, attempt = 0) {
  const userPrompt = buildUserPrompt(chunk, attempt > 0);
  const response = await openai.chat.completions.create({
    model: 'gpt-5-nano',
    messages: [
      { role: 'system', content: TOPICS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const content = response?.choices?.[0]?.message?.content ?? '';
  const parsed = safeParseJson(content);
  if (parsed && Array.isArray(parsed.topics)) {
    return parsed.topics;
  }

  if (attempt + 1 < MAX_ATTEMPTS) {
    return requestTopics(openai, chunk, attempt + 1);
  }

  throw new Error('Failed to parse topics response from OpenAI');
}

function safeParseJson(payload) {
  if (typeof payload !== 'string') {
    return null;
  }
  try {
    return JSON.parse(payload);
  } catch (error) {
    const firstBrace = payload.indexOf('{');
    const lastBrace = payload.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }
    const candidate = payload.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (innerError) {
      return null;
    }
  }
}

function sanitizeTopic(topic, seriesById) {
  if (!topic || typeof topic !== 'object') {
    return null;
  }

  const providedTitle = typeof topic.title === 'string' ? topic.title.trim() : '';
  const titleFallback = typeof topic.id === 'string' ? topic.id.replace(/^t[_-]/i, '').replace(/[_-]+/g, ' ') : '';
  const usableTitle = providedTitle || titleFallback;
  const slug = kebabCase(usableTitle);
  if (!slug) {
    return null;
  }
  const id = `t_${slug}`;
  const finalTitle = providedTitle || toTitleCase(slug.replace(/-/g, ' '));

  const rawSeriesIds = Array.isArray(topic.seriesIds) ? topic.seriesIds : [];
  const seen = new Set();
  const seriesIds = [];
  for (const rawId of rawSeriesIds) {
    if (typeof rawId !== 'string') continue;
    const trimmed = rawId.trim();
    if (!trimmed) continue;
    if (!seriesById.has(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    seriesIds.push(trimmed);
  }

  if (seriesIds.length < 2) {
    return null;
  }

  seriesIds.sort();

  let yearFrom = null;
  let yearTo = null;

  for (const seriesId of seriesIds) {
    const series = seriesById.get(seriesId);
    if (!series) continue;
    const from = sanitizeYear(series.yearFrom);
    const to = sanitizeYear(series.yearTo);
    if (from !== null) {
      yearFrom = yearFrom === null ? from : Math.min(yearFrom, from);
    }
    if (to !== null) {
      yearTo = yearTo === null ? to : Math.max(yearTo, to);
    }
  }

  const fallbackFrom = sanitizeYear(topic.yearFrom);
  const fallbackTo = sanitizeYear(topic.yearTo);

  if (yearFrom === null) {
    yearFrom = fallbackFrom;
  }
  if (yearTo === null) {
    yearTo = fallbackTo;
  }

  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
    const minYear = Math.min(yearFrom, yearTo);
    const maxYear = Math.max(yearFrom, yearTo);
    yearFrom = minYear;
    yearTo = maxYear;
  }

  return {
    id,
    title: finalTitle,
    seriesIds,
    yearFrom,
    yearTo,
  };
}

function topicsEqual(a, b) {
  if (!a || !b) return false;
  if (a.id !== b.id) return false;
  if (a.title !== b.title) return false;
  const idsA = JSON.stringify(a.seriesIds);
  const idsB = JSON.stringify(b.seriesIds);
  if (idsA !== idsB) return false;
  if (a.yearFrom !== b.yearFrom) return false;
  if (a.yearTo !== b.yearTo) return false;
  return true;
}

function chunkSeries(series, size) {
  const chunks = [];
  for (let index = 0; index < series.length; index += size) {
    chunks.push(series.slice(index, index + size));
  }
  return chunks;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('🧩 Topics Enrichment');
    console.log('- Skipping topics generation (missing OPENAI_API_KEY).');
    return;
  }

  let OpenAI;
  try {
    ({ default: OpenAI } = await import('openai'));
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') {
      console.log('🧩 Topics Enrichment');
      console.log('- Skipping topics generation (OpenAI client not installed).');
      return;
    }
    throw error;
  }

  const series = await readJsonFile('public/series.json', []);
  if (series.length === 0) {
    console.log('🧩 Topics Enrichment');
    console.log('- No series found. Skipping topics generation.');
    return;
  }

  const existingTopicsRaw = await readJsonFile('public/topics.json', []);
  const openai = new OpenAI({ apiKey });
  const seriesById = new Map(series.map((entry) => [entry.id, entry]));

  const orderedSeries = [...series].sort((a, b) => {
    const aKey = normalizeForMatching(a.title ?? a.publicTitle ?? '');
    const bKey = normalizeForMatching(b.title ?? b.publicTitle ?? '');
    if (aKey && bKey && aKey !== bKey) {
      return aKey.localeCompare(bKey);
    }
    return (a.title ?? '').localeCompare(b.title ?? '');
  });

  const chunks = chunkSeries(orderedSeries, SERIES_CHUNK_SIZE);
  const generatedTopics = [];

  for (const chunk of chunks) {
    const topics = await requestTopics(openai, chunk);
    for (const topic of topics) {
      const sanitized = sanitizeTopic(topic, seriesById);
      if (sanitized) {
        generatedTopics.push(sanitized);
      }
    }
  }

  const existingSanitized = existingTopicsRaw
    .map((topic) => sanitizeTopic(topic, seriesById))
    .filter((topic) => topic !== null);

  const existingMap = new Map(existingSanitized.map((topic) => [topic.id, topic]));

  const existingSorted = [...existingSanitized].sort((a, b) => a.title.localeCompare(b.title));
  const existingJson = JSON.stringify(existingSorted, null, 2);

  let newCount = 0;
  let updatedCount = 0;

  for (const topic of generatedTopics) {
    const previous = existingMap.get(topic.id);
    if (!previous) {
      existingMap.set(topic.id, topic);
      newCount += 1;
    } else if (!topicsEqual(previous, topic)) {
      existingMap.set(topic.id, topic);
      updatedCount += 1;
    }
  }

  const finalTopics = [...existingMap.values()].sort((a, b) => a.title.localeCompare(b.title));
  const finalJson = JSON.stringify(finalTopics, null, 2);
  const changed = finalJson !== existingJson;

  const unchangedCount = finalTopics.length - newCount - updatedCount;
  const summaryParts = [];
  if (newCount > 0) summaryParts.push(`${newCount} new`);
  if (updatedCount > 0) summaryParts.push(`${updatedCount} updated`);
  if (unchangedCount > 0) summaryParts.push(`${unchangedCount} unchanged`);
  if (summaryParts.length === 0) summaryParts.push('0 changes');

  console.log('🧩 Topics Enrichment');
  console.log(`- Loaded ${series.length} series`);
  console.log(`- Generated ${finalTopics.length} topics (${summaryParts.join(', ')})`);

  if (changed) {
    if (isDryRun) {
      console.log('- Detected changes (dry run, no write)');
    } else {
      await writeJsonFile('public/topics.json', finalTopics);
      console.log('- Wrote /public/topics.json');
    }
  } else {
    console.log('- No changes to /public/topics.json');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

