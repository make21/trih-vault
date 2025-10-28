import {
  extractPart,
  kebabCase,
  readJsonFile,
  seriesStem,
  toTitleCase,
  writeJsonFile,
} from './utils.js';

function parseEpisodeNumber(id) {
  if (!id) return Number.MAX_SAFE_INTEGER;
  const match = String(id).match(/(\d+)/);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

async function main() {
  const episodes = await readJsonFile('public/episodes.json', []);
  if (episodes.length === 0) {
    console.log('No episodes found.');
    return;
  }

  const groups = new Map();

  for (const episode of episodes) {
    const partFromEpisode = typeof episode.part === 'number' ? episode.part : null;
    const partFromTitle = extractPart(episode.title ?? '');
    const part = partFromEpisode ?? partFromTitle ?? null;
    const rawStem = seriesStem(episode.title ?? episode.id ?? '');
    const safeStem = rawStem || (episode.title ?? '').trim().toLowerCase() || episode.id.toLowerCase();
    const seriesIdBase = kebabCase(rawStem || episode.title || episode.id);
    const seriesId = seriesIdBase || kebabCase(episode.id) || episode.id.toLowerCase();
    if (!groups.has(safeStem)) {
      groups.set(safeStem, {
        rawStem: rawStem || safeStem,
        seriesId,
        entries: [],
      });
    }
    groups.get(safeStem).entries.push({
      episode,
      part,
      sortValue: parseEpisodeNumber(episode.id),
    });
  }

  const updatedEpisodes = [];
  const multiSeriesRecords = [];
  const topicsRecords = [];
  let multiCount = 0;
  let singletonCount = 0;
  const debugEntries = [];

  for (const group of groups.values()) {
    group.entries.sort((a, b) => {
      if (a.sortValue !== b.sortValue) {
        return a.sortValue - b.sortValue;
      }
      return a.episode.id.localeCompare(b.episode.id);
    });

    const parts = group.entries.map((entry) => entry.part);
    const hasParts = parts.some((value) => typeof value === 'number' && Number.isFinite(value));
    const stemTitle = toTitleCase(group.rawStem);

    debugEntries.push({ stem: stemTitle, parts });

    if (hasParts) {
      multiCount += 1;
      const episodeIds = group.entries.map((entry) => entry.episode.id);
      multiSeriesRecords.push({
        series: {
          id: group.seriesId,
          title: stemTitle,
          episodeIds,
          topicId: group.seriesId,
          yearFrom: null,
          yearTo: null,
        },
        sortValue: group.entries[0]?.sortValue ?? Number.MAX_SAFE_INTEGER,
      });
      topicsRecords.push({
        topic: {
          id: group.seriesId,
          title: stemTitle,
          seriesIds: [group.seriesId],
        },
        sortValue: group.entries[0]?.sortValue ?? Number.MAX_SAFE_INTEGER,
      });
      for (const entry of group.entries) {
        const updated = {
          ...entry.episode,
          part: entry.part ?? null,
          seriesId: group.seriesId,
        };
        updatedEpisodes.push(updated);
      }
    } else {
      singletonCount += 1;
      for (const entry of group.entries) {
        const updated = {
          ...entry.episode,
          part: entry.part ?? null,
        };
        delete updated.seriesId;
        updatedEpisodes.push(updated);
      }
    }
  }

  updatedEpisodes.sort((a, b) => {
    const dateA = new Date(a.pubDate).getTime();
    const dateB = new Date(b.pubDate).getTime();
    if (!Number.isFinite(dateA) || !Number.isFinite(dateB)) {
      return a.id.localeCompare(b.id);
    }
    if (dateA !== dateB) {
      return dateA - dateB;
    }
    return a.id.localeCompare(b.id);
  });

  multiSeriesRecords.sort((a, b) => {
    if (a.sortValue !== b.sortValue) {
      return a.sortValue - b.sortValue;
    }
    return a.series.id.localeCompare(b.series.id);
  });
  topicsRecords.sort((a, b) => {
    if (a.sortValue !== b.sortValue) {
      return a.sortValue - b.sortValue;
    }
    return a.topic.id.localeCompare(b.topic.id);
  });

  const nextSeries = multiSeriesRecords.map((entry) => entry.series);
  const nextTopics = topicsRecords.map((entry) => entry.topic);

  await writeJsonFile('public/episodes.json', updatedEpisodes);
  await writeJsonFile('public/series.json', nextSeries);
  await writeJsonFile('public/topics.json', nextTopics);

  console.log(`Total episodes: ${episodes.length}`);
  console.log(`Multi-part series: ${multiCount}`);
  console.log(`Singleton groups: ${singletonCount}`);

  const topDebug = debugEntries
    .sort((a, b) => b.parts.length - a.parts.length || a.stem.localeCompare(b.stem))
    .slice(0, 20);
  console.log('Top stems with part arrays:');
  for (const entry of topDebug) {
    const partsText = entry.parts.map((value) => (value === null ? 'null' : String(value))).join(', ');
    console.log(` - ${entry.stem}: [${partsText}]`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
