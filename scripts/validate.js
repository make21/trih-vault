import { readJsonFile } from './utils.js';

async function main() {
  const episodes = await readJsonFile('public/episodes.json', []);
  const series = await readJsonFile('public/series.json', []);
  const topics = await readJsonFile('public/topics.json', []);

  const errors = [];

  const uniqueCheck = (items, label) => {
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.id)) {
        errors.push(`${label} duplicate id: ${item.id}`);
      }
      seen.add(item.id);
    }
  };

  uniqueCheck(episodes, 'Episode');
  uniqueCheck(series, 'Series');
  uniqueCheck(topics, 'Topic');

  const episodesById = new Map(episodes.map((entry) => [entry.id, entry]));
  const seriesById = new Map(series.map((entry) => [entry.id, entry]));
  const topicsById = new Map(topics.map((entry) => [entry.id, entry]));

  for (const episode of episodes) {
    if (!episode.seriesId) {
      errors.push(`Episode ${episode.id} missing seriesId`);
      continue;
    }
    if (!seriesById.has(episode.seriesId)) {
      errors.push(`Episode ${episode.id} references missing series ${episode.seriesId}`);
    }
  }

  for (const entry of series) {
    if (!topicsById.has(entry.topicId)) {
      errors.push(`Series ${entry.id} references missing topic ${entry.topicId}`);
    }
    if (typeof entry.yearFrom === 'number' && typeof entry.yearTo === 'number' && entry.yearFrom > entry.yearTo) {
      errors.push(`Series ${entry.id} has invalid year range ${entry.yearFrom} > ${entry.yearTo}`);
    }
    const seen = new Set();
    for (const episodeId of entry.episodeIds) {
      if (!seen.add(episodeId)) {
        errors.push(`Series ${entry.id} repeats episode ${episodeId}`);
      }
      const episode = episodesById.get(episodeId);
      if (!episode) {
        errors.push(`Series ${entry.id} references missing episode ${episodeId}`);
      } else if (episode.seriesId !== entry.id) {
        errors.push(`Episode ${episode.id} expects series ${episode.seriesId} but listed under ${entry.id}`);
      }
    }
  }

  for (const topic of topics) {
    const seen = new Set();
    for (const seriesId of topic.seriesIds) {
      if (!seen.add(seriesId)) {
        errors.push(`Topic ${topic.id} repeats series ${seriesId}`);
      }
      const seriesEntry = seriesById.get(seriesId);
      if (!seriesEntry) {
        errors.push(`Topic ${topic.id} references missing series ${seriesId}`);
      } else if (seriesEntry.topicId !== topic.id) {
        errors.push(`Series ${seriesId} mapped to topic ${seriesEntry.topicId} but listed under topic ${topic.id}`);
      }
    }
  }

  for (const entry of series) {
    const topic = topicsById.get(entry.topicId);
    if (topic && !topic.seriesIds.includes(entry.id)) {
      errors.push(`Topic ${topic.id} missing series ${entry.id}`);
    }
  }

  if (errors.length > 0) {
    console.error('Validation failed:');
    for (const message of errors) {
      console.error(` - ${message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Validation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
