import {
  computeEpisodeCacheKey,
  computeSeriesHash,
  deriveStemAndPart,
  describeTopic,
  ensureSeriesStub,
  inferYearsFromText,
  kebabCase,
  nowIso,
  pickTopicTitle,
  readJsonFile,
  seriesTitleFromStem,
  shortHash,
  sortEpisodeIdsByDate,
  uniqueStrings,
  writeJsonFile,
  cosineSimilarity,
} from './utils.js';

function aggregateYears(values) {
  const nonNull = values.filter((value) => value.yearFrom !== null || value.yearTo !== null);
  if (nonNull.length === 0) {
    return { yearFrom: null, yearTo: null };
  }
  const fromValues = nonNull.map((value) => value.yearFrom).filter((value) => value !== null);
  const toValues = nonNull.map((value) => value.yearTo).filter((value) => value !== null);
  const yearFrom = fromValues.length > 0 ? Math.min(...fromValues) : null;
  const yearToCandidate = toValues.length > 0 ? Math.max(...toValues) : yearFrom;
  return { yearFrom, yearTo: yearToCandidate ?? null };
}

function buildSeriesId(topicId, seriesStub, years) {
  const yearSuffix = years.yearFrom ?? years.yearTo;
  const parts = [topicId, seriesStub];
  if (typeof yearSuffix === 'number') {
    parts.push(String(yearSuffix));
  }
  return parts.join('__');
}

function ensureTopicAlias(topic, values) {
  const aliases = new Set(topic.aliases ?? []);
  for (const value of values) {
    if (!value) continue;
    if (value !== topic.title) {
      aliases.add(value);
    }
  }
  const next = Array.from(aliases).filter(Boolean);
  topic.aliases = next.length > 0 ? next : undefined;
}

function resolveTopic(naming, topics, topicsById) {
  const candidateTitle = naming.topicTitle.trim() || naming.seriesTitle.trim();
  const slugBase = kebabCase(candidateTitle || naming.seriesStub);
  const topicId = slugBase || `topic-${shortHash(candidateTitle || naming.seriesStub, 8)}`;
  const direct = topicsById.get(topicId);
  if (direct) {
    ensureTopicAlias(direct, [candidateTitle, ...naming.aliases]);
    return { topic: direct, created: false };
  }

  const candidateSignature = `${candidateTitle} ${naming.aliases.join(' ')}`.trim();
  let best = null;
  let bestScore = 0;
  for (const existing of topics) {
    const score = cosineSimilarity(candidateSignature, describeTopic(existing));
    if (score > bestScore) {
      best = existing;
      bestScore = score;
    }
  }
  if (best && bestScore >= 0.88) {
    ensureTopicAlias(best, [candidateTitle, ...naming.aliases]);
    return { topic: best, created: false };
  }

  const topic = {
    id: topicId,
    title: candidateTitle,
    aliases: naming.aliases.length > 0 ? uniqueStrings(naming.aliases) : undefined,
    seriesIds: [],
  };
  topics.push(topic);
  topicsById.set(topicId, topic);
  return { topic, created: true };
}

function buildSeriesNaming(groupKey, metas, cache) {
  const representativeStem = metas[0]?.stem ?? groupKey.replace(/-/g, ' ');
  const hash = computeSeriesHash(
    metas.map((meta) => ({
      id: meta.episode.id,
      title: meta.episode.title,
      description: meta.episode.description,
      years: meta.years,
    })),
  );
  const cached = cache[groupKey];
  if (cached && cached.hash === hash) {
    return cached;
  }

  const seriesStub = ensureSeriesStub(representativeStem);
  const seriesTitle = seriesTitleFromStem(representativeStem);
  const topicTitle = pickTopicTitle(representativeStem);
  const entry = {
    hash,
    seriesStub,
    seriesTitle,
    topicTitle,
    aliases: [],
    cachedAt: nowIso(),
  };
  cache[groupKey] = entry;
  return entry;
}

async function main() {
  const episodes = await readJsonFile('public/episodes.json', []);
  if (episodes.length === 0) {
    console.log('No episodes found.');
    return;
  }

  const episodesById = new Map();
  const groups = new Map();
  const metaByEpisodeId = new Map();
  const yearCache = await readJsonFile('data/cache/episodes.years.json', {});
  const namingCache = await readJsonFile('data/cache/series.naming.json', {});

  for (const episode of episodes) {
    episodesById.set(episode.id, episode);
    const { stem, part } = deriveStemAndPart(episode.title);
    const groupKey = kebabCase(stem) || `stem-${episode.id}`;
    const cacheKey = computeEpisodeCacheKey(episode.title, episode.description);
    let cacheEntry = yearCache[cacheKey];
    if (!cacheEntry) {
      const inferred = inferYearsFromText(episode.title, episode.description);
      cacheEntry = { ...inferred, cachedAt: nowIso() };
      yearCache[cacheKey] = cacheEntry;
    }
    const meta = {
      episode,
      stem,
      groupKey,
      part: episode.part ?? part ?? null,
      cacheKey,
      years: { yearFrom: cacheEntry.yearFrom, yearTo: cacheEntry.yearTo },
    };
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(meta);
    metaByEpisodeId.set(episode.id, meta);
  }

  const topicsList = await readJsonFile('public/topics.json', []);

  const topics = topicsList.map((topic) => ({
    ...topic,
    aliases: topic.aliases ? [...topic.aliases] : undefined,
    seriesIds: [...topic.seriesIds],
  }));
  const topicsById = new Map(topics.map((topic) => [topic.id, topic]));

  const nextSeriesMap = new Map();

  for (const [groupKey, metas] of groups.entries()) {
    metas.sort((a, b) => new Date(a.episode.pubDate).getTime() - new Date(b.episode.pubDate).getTime());
    const years = aggregateYears(metas.map((meta) => meta.years));
    const naming = buildSeriesNaming(groupKey, metas, namingCache);
    const { topic } = resolveTopic(naming, topics, topicsById);
    const seriesId = buildSeriesId(topic.id, naming.seriesStub, years);

    const episodeIds = metas.map((meta) => meta.episode.id);
    const orderedEpisodeIds = sortEpisodeIdsByDate(episodeIds, episodesById);
    const seriesRecord = {
      id: seriesId,
      title: naming.seriesTitle,
      episodeIds: orderedEpisodeIds,
      topicId: topic.id,
    };
    if (years.yearFrom !== null) {
      seriesRecord.yearFrom = years.yearFrom;
    }
    if (years.yearTo !== null) {
      seriesRecord.yearTo = years.yearTo;
    }
    nextSeriesMap.set(seriesId, seriesRecord);

    if (!topic.seriesIds.includes(seriesId)) {
      topic.seriesIds.push(seriesId);
    }
  }

  const seriesFirstDate = new Map();
  for (const series of nextSeriesMap.values()) {
    const firstEpisodeId = series.episodeIds[0];
    const firstEpisode = firstEpisodeId ? episodesById.get(firstEpisodeId) : undefined;
    const sortValue = firstEpisode ? new Date(firstEpisode.pubDate).getTime() : Number.MAX_SAFE_INTEGER;
    seriesFirstDate.set(series.id, sortValue);
  }

  for (const topic of topics) {
    topic.seriesIds = topic.seriesIds
      .filter((seriesId) => nextSeriesMap.has(seriesId))
      .filter((value, index, array) => array.indexOf(value) === index)
      .sort((a, b) => (seriesFirstDate.get(a) ?? Number.MAX_SAFE_INTEGER) - (seriesFirstDate.get(b) ?? Number.MAX_SAFE_INTEGER));
  }

  const nextSeries = Array.from(nextSeriesMap.values()).sort((a, b) => {
    const aValue = seriesFirstDate.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bValue = seriesFirstDate.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return aValue - bValue;
  });

  const topicUsage = new Set(nextSeries.map((series) => series.topicId));
  const nextTopics = topics.filter((topic) => topicUsage.has(topic.id));

  const seriesByEpisode = new Map();
  for (const series of nextSeries) {
    for (const episodeId of series.episodeIds) {
      seriesByEpisode.set(episodeId, series.id);
    }
  }

  const updatedEpisodes = episodes.map((episode) => {
    const meta = metaByEpisodeId.get(episode.id);
    const seriesId = seriesByEpisode.get(episode.id);
    if (!seriesId) {
      throw new Error(`Missing series assignment for episode ${episode.id}`);
    }
    const updated = {
      ...episode,
      seriesId,
    };
    if (meta && meta.part !== null) {
      updated.part = meta.part;
    } else if (typeof updated.part === 'undefined') {
      updated.part = null;
    }
    return updated;
  });

  await writeJsonFile('public/episodes.json', updatedEpisodes);
  await writeJsonFile('public/series.json', nextSeries);
  await writeJsonFile('public/topics.json', nextTopics);

  const nextNamingCache = {};
  for (const [groupKey] of groups.entries()) {
    const cached = namingCache[groupKey];
    if (cached) {
      nextNamingCache[groupKey] = cached;
    }
  }

  await writeJsonFile('data/cache/episodes.years.json', yearCache);
  await writeJsonFile('data/cache/series.naming.json', nextNamingCache);

  console.log(`Enriched ${updatedEpisodes.length} episode(s) across ${nextSeries.length} series.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
