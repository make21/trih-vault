import { readJsonFile } from './utils.js';

async function main() {
  const episodes = await readJsonFile('public/episodes.json', []);
  const series = await readJsonFile('public/series.json', []);
  const topics = await readJsonFile('public/topics.json', []);

  const errors = [];
  if (!Array.isArray(topics)) {
    errors.push('topics.json must contain an array');
  } else if (topics.length !== 0) {
    errors.push('topics.json must remain empty');
  }
  const episodesById = new Map();
  for (const episode of episodes) {
    const label = typeof episode.id === 'string' && episode.id ? episode.id : '<missing id>';
    if (typeof episode.id !== 'string' || episode.id.trim() === '') {
      errors.push(`Episode missing valid id`);
    } else if (episodesById.has(episode.id)) {
      errors.push(`Episode duplicate id: ${episode.id}`);
    } else {
      episodesById.set(episode.id, episode);
    }

    if (typeof episode.title !== 'string' || episode.title.trim() === '') {
      errors.push(`Episode ${label} missing title`);
    }
    if (typeof episode.pubDate !== 'string' || episode.pubDate.trim() === '') {
      errors.push(`Episode ${label} missing pubDate`);
    }
    if (typeof episode.audioUrl !== 'string' || episode.audioUrl.trim() === '') {
      errors.push(`Episode ${label} missing audioUrl`);
    }

    if (episode.part === null || episode.part === undefined) {
      if (episode.seriesId !== null && episode.seriesId !== undefined) {
        errors.push(`Episode ${label} has no part but includes seriesId ${episode.seriesId}`);
      }
    } else if (typeof episode.part === 'number') {
      if (!Number.isFinite(episode.part)) {
        errors.push(`Episode ${label} has non-finite part ${episode.part}`);
      }
      if (typeof episode.seriesId !== 'string' || episode.seriesId.trim() === '') {
        errors.push(`Episode ${label} has part ${episode.part} but missing seriesId`);
      }
    } else {
      errors.push(`Episode ${label} has invalid part value ${episode.part}`);
    }
  }

  const seriesById = new Map();
  for (const entry of series) {
    const label = typeof entry.id === 'string' && entry.id ? entry.id : '<missing id>';
    if (typeof entry.id !== 'string' || entry.id.trim() === '') {
      errors.push('Series missing valid id');
    } else {
      if (!entry.id.startsWith('s_')) {
        errors.push(`Series ${entry.id} id must start with s_`);
      }
      if (seriesById.has(entry.id)) {
        errors.push(`Series duplicate id: ${entry.id}`);
      } else {
        seriesById.set(entry.id, entry);
      }
    }

    if (typeof entry.title !== 'string' || entry.title.trim() === '') {
      errors.push(`Series ${label} missing title`);
    }

    if (entry.yearFrom !== null && entry.yearFrom !== undefined && typeof entry.yearFrom !== 'number') {
      errors.push(`Series ${label} has invalid yearFrom ${entry.yearFrom}`);
    }
    if (entry.yearTo !== null && entry.yearTo !== undefined && typeof entry.yearTo !== 'number') {
      errors.push(`Series ${label} has invalid yearTo ${entry.yearTo}`);
    }
    if (typeof entry.yearFrom === 'number' && typeof entry.yearTo === 'number' && entry.yearFrom > entry.yearTo) {
      errors.push(`Series ${label} has invalid year range ${entry.yearFrom} > ${entry.yearTo}`);
    }

    if (!Array.isArray(entry.episodeIds)) {
      errors.push(`Series ${label} missing episodeIds array`);
      continue;
    }

    if (entry.episodeIds.length < 2) {
      errors.push(`Series ${label} must include at least two episodes`);
    }

    const seenEpisodeIds = new Set();
    const partsInSeries = new Set();
    for (const episodeId of entry.episodeIds) {
      if (typeof episodeId !== 'string' || episodeId.trim() === '') {
        errors.push(`Series ${label} has invalid episode id ${episodeId}`);
        continue;
      }
      if (!seenEpisodeIds.add(episodeId)) {
        errors.push(`Series ${label} repeats episode ${episodeId}`);
      }
      const episode = episodesById.get(episodeId);
      if (!episode) {
        errors.push(`Series ${label} references missing episode ${episodeId}`);
        continue;
      }
      if (episode.seriesId !== entry.id) {
        errors.push(`Episode ${episode.id} expects series ${episode.seriesId ?? '<none>'} but listed under ${entry.id}`);
      }

      if (typeof episode.part !== 'number' || !Number.isFinite(episode.part)) {
        errors.push(`Series ${label} episode ${episode.id} missing numeric part`);
        continue;
      }
      if (!partsInSeries.add(episode.part)) {
        errors.push(`Series ${label} repeats part number ${episode.part}`);
      }
    }
  }

  for (const episode of episodes) {
    if (typeof episode.seriesId === 'string' && episode.seriesId.trim() !== '') {
      const seriesEntry = seriesById.get(episode.seriesId);
      const label = typeof episode.id === 'string' && episode.id ? episode.id : '<missing id>';
      if (!seriesEntry) {
        errors.push(`Episode ${label} references missing series ${episode.seriesId}`);
        continue;
      }
      if (!Array.isArray(seriesEntry.episodeIds) || !seriesEntry.episodeIds.includes(episode.id)) {
        errors.push(`Episode ${label} missing from series ${seriesEntry.id} episodeIds`);
      }
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
