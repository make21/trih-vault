import {
  ARC_GAP_DAYS,
  extractPart,
  kebabCase,
  normalizeTitle,
  readJsonFile,
  seriesHead,
  shortHash,
  shouldStartNewArc,
  toTitleCase,
  writeJsonFile,
} from './utils.js';

function getItunesEpisode(episode) {
  const value = typeof episode.itunesEpisode === 'number' ? episode.itunesEpisode : null;
  if (value !== null && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function getPubDateValue(pubDate) {
  const value = Date.parse(pubDate ?? '');
  if (Number.isFinite(value)) {
    return value;
  }
  return Number.MAX_SAFE_INTEGER;
}

async function main() {
  const episodes = await readJsonFile('public/episodes.json', []);
  if (episodes.length === 0) {
    console.log('No episodes found.');
    return;
  }

  const baseEpisodes = new Map();
  for (const episode of episodes) {
    const cleaned = { ...episode };
    delete cleaned.seriesId;
    delete cleaned.topicId;
    cleaned.part = null;
    baseEpisodes.set(episode.id, cleaned);
  }

  const episodesForGrouping = [...episodes].sort((a, b) => {
    const aEpisode = getItunesEpisode(a);
    const bEpisode = getItunesEpisode(b);
    const safeAEpisode = aEpisode === null ? Number.MAX_SAFE_INTEGER : aEpisode;
    const safeBEpisode = bEpisode === null ? Number.MAX_SAFE_INTEGER : bEpisode;
    if (safeAEpisode !== safeBEpisode) {
      return safeAEpisode - safeBEpisode;
    }
    const aDate = getPubDateValue(a.pubDate);
    const bDate = getPubDateValue(b.pubDate);
    if (aDate !== bDate) {
      return aDate - bDate;
    }
    return a.id.localeCompare(b.id);
  });

  const candidatesByHead = new Map();

  for (const episode of episodesForGrouping) {
    const title = episode.title ?? '';
    const normalizedTitle = normalizeTitle(title || episode.id || '');
    const partFromEpisode = typeof episode.part === 'number' && Number.isFinite(episode.part) ? episode.part : null;
    const partFromTitle = extractPart(title);
    const part = partFromEpisode ?? partFromTitle ?? null;
    if (part === null) {
      continue;
    }

    const headValueRaw = seriesHead(title);
    const fallbackHead = headValueRaw || normalizedTitle || episode.id || '';
    const headValue = headValueRaw || fallbackHead;
    const headKeyBase = headValue || fallbackHead;
    const headKeySlug = kebabCase(headKeyBase);
    const headKey = headKeySlug || kebabCase(episode.id ?? '') || `series-${shortHash(headKeyBase)}`;

    if (!candidatesByHead.has(headKey)) {
      candidatesByHead.set(headKey, {
        headKey,
        headValue,
        entries: [],
      });
    }

    const collection = candidatesByHead.get(headKey);
    if (!collection) continue;

    collection.entries.push({
      episode,
      part,
      itunesEpisode: getItunesEpisode(episode),
      pubDateValue: getPubDateValue(episode.pubDate),
    });
  }

  /** @type {Map<string, Array<{ headKey: string, headValue: string, anchorId: string, entries: any[], partsSeen: Set<number>, firstPubValue: number|null, lastPubValue: number|null }>>} */
  const bucketsByHead = new Map();

  for (const collection of candidatesByHead.values()) {
    const sortedEntries = [...collection.entries].sort((a, b) => {
      if (a.pubDateValue !== b.pubDateValue) {
        return a.pubDateValue - b.pubDateValue;
      }
      const aEpisode = a.itunesEpisode ?? Number.MAX_SAFE_INTEGER;
      const bEpisode = b.itunesEpisode ?? Number.MAX_SAFE_INTEGER;
      if (aEpisode !== bEpisode) {
        return aEpisode - bEpisode;
      }
      if (a.part !== b.part) {
        return a.part - b.part;
      }
      return a.episode.id.localeCompare(b.episode.id);
    });

    const headBuckets = [];

    for (const entry of sortedEntries) {
      const lastBucket = headBuckets[headBuckets.length - 1];
      if (shouldStartNewArc(lastBucket, entry, ARC_GAP_DAYS)) {
        headBuckets.push({
          headKey: collection.headKey,
          headValue: collection.headValue,
          // Use the first episode id in the arc as the anchor to keep hashes stable.
          anchorId: entry.episode.id,
          entries: [],
          partsSeen: new Set(),
          firstPubValue: Number.isFinite(entry.pubDateValue) ? entry.pubDateValue : null,
          lastPubValue: Number.isFinite(entry.pubDateValue) ? entry.pubDateValue : null,
        });
      }

      const targetBucket = headBuckets[headBuckets.length - 1];
      if (!targetBucket) {
        continue;
      }

      targetBucket.entries.push(entry);
      targetBucket.partsSeen.add(entry.part);

      if (Number.isFinite(entry.pubDateValue)) {
        if (targetBucket.firstPubValue === null || targetBucket.firstPubValue === undefined) {
          targetBucket.firstPubValue = entry.pubDateValue;
        }
        targetBucket.lastPubValue = entry.pubDateValue;
      }
    }

    if (headBuckets.length > 0) {
      bucketsByHead.set(collection.headKey, headBuckets);
    }
  }

  const seriesRecords = [];
  const debugSeries = [];

  for (const headBuckets of bucketsByHead.values()) {
    for (const bucket of headBuckets) {
      if (bucket.entries.length < 2) {
        continue;
      }

      const sortedEntries = [...bucket.entries].sort((a, b) => {
        if (a.part !== b.part) {
          return a.part - b.part;
        }
        const aEpisode = a.itunesEpisode ?? Number.MAX_SAFE_INTEGER;
        const bEpisode = b.itunesEpisode ?? Number.MAX_SAFE_INTEGER;
        if (aEpisode !== bEpisode) {
          return aEpisode - bEpisode;
        }
        if (a.pubDateValue !== b.pubDateValue) {
          return a.pubDateValue - b.pubDateValue;
        }
        return a.episode.id.localeCompare(b.episode.id);
      });

      const seriesId = `s_${shortHash(`${bucket.headKey}::${bucket.anchorId}`)}`;
      const titleSource = bucket.headValue || bucket.headKey.replace(/-/g, ' ');
      const seriesTitle = toTitleCase(titleSource);

      const episodeIds = [];
      for (const entry of sortedEntries) {
        const existing = baseEpisodes.get(entry.episode.id);
        if (!existing) {
          continue;
        }
        existing.part = entry.part;
        existing.seriesId = seriesId;
        delete existing.topicId;
        baseEpisodes.set(entry.episode.id, existing);
        episodeIds.push(entry.episode.id);
      }

      const uniqueEpisodeIds = Array.from(new Set(episodeIds));

      seriesRecords.push({
        id: seriesId,
        title: seriesTitle,
        episodeIds: uniqueEpisodeIds,
        yearFrom: null,
        yearTo: null,
        provisional: {
          head: bucket.headKey,
        },
      });

      debugSeries.push({
        headKey: bucket.headKey,
        seriesId,
        parts: sortedEntries.map((entry) => entry.part),
        firstPubValue: bucket.firstPubValue ?? null,
        lastPubValue: bucket.lastPubValue ?? null,
      });
    }
  }

  const updatedEpisodes = Array.from(baseEpisodes.values());
  updatedEpisodes.sort((a, b) => {
    const dateA = getPubDateValue(a.pubDate);
    const dateB = getPubDateValue(b.pubDate);
    if (dateA !== dateB) {
      return dateA - dateB;
    }
    return a.id.localeCompare(b.id);
  });

  seriesRecords.sort((a, b) => a.id.localeCompare(b.id));

  await writeJsonFile('public/episodes.json', updatedEpisodes);
  await writeJsonFile('public/series.json', seriesRecords);
  const singletonsCount = updatedEpisodes.reduce((count, episode) => (episode.seriesId ? count : count + 1), 0);

  console.log('Total episodes:', episodes.length);
  console.log('Series (multi-part):', seriesRecords.length);
  console.log('Singletons:', singletonsCount);
  console.log('Examples:');

  const formatDate = (value) => {
    if (!Number.isFinite(value)) {
      return 'unknown';
    }
    return new Date(value).toISOString().slice(0, 10);
  };

  const nelsonEntries = debugSeries.filter((entry) => entry.headKey === 'nelson');
  const remainingSlots = Math.max(0, 10 - nelsonEntries.length);
  const otherEntries = debugSeries
    .filter((entry) => entry.headKey !== 'nelson')
    .slice(0, remainingSlots);
  const exampleEntries = [...nelsonEntries, ...otherEntries];

  if (exampleEntries.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of exampleEntries) {
      const firstDate = entry.firstPubValue == null ? 'unknown' : formatDate(entry.firstPubValue);
      const lastDate = entry.lastPubValue == null ? 'unknown' : formatDate(entry.lastPubValue);
      console.log(
        `  - ${entry.headKey}: ${entry.seriesId} parts=[${entry.parts.join(', ')}] first=${firstDate} last=${lastDate}`
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
