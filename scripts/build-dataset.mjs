import { XMLParser } from 'fast-xml-parser';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RSS_URL = 'https://feeds.megaphone.fm/GLT4787413333';

async function fetchWithRetry(url, { retries = 2, timeoutMs = 10_000 } = {}) {
  let attempt = 0;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'TheRestIsHistoryTimeline/1.0 (+https://github.com/trih-browser/trih-browser)',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown fetch error';

      if (attempt === retries) {
        throw new Error(
          `Failed to fetch ${url} after ${retries + 1} attempts: ${message}`
        );
      }

      console.warn(
        `Fetch attempt ${attempt + 1} for ${url} failed: ${message}. Retrying...`
      );
      attempt += 1;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Failed to fetch ${url}`);
}

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

function decodeHtmlEntities(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const codePoint = parseInt(entity.slice(2), 16);
      if (!Number.isNaN(codePoint)) {
        return String.fromCodePoint(codePoint);
      }
      return match;
    }

    if (entity.startsWith('#')) {
      const codePoint = parseInt(entity.slice(1), 10);
      if (!Number.isNaN(codePoint)) {
        return String.fromCodePoint(codePoint);
      }
      return match;
    }

    return NAMED_ENTITIES[entity] ?? match;
  });
}

function stripHtmlAndDecode(input) {
  if (!input) {
    return '';
  }

  const withoutTags = input.replace(/<[^>]*>/g, ' ');
  const decoded = decodeHtmlEntities(withoutTags);
  return decoded.replace(/\s+/g, ' ').trim();
}

async function fetchRSS() {
  console.log('Fetching RSS feed...');
  const response = await fetchWithRetry(RSS_URL);
  const xml = await response.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  const result = parser.parse(xml);
  const items = result?.rss?.channel?.item || [];

  let fallbackEpisodeCount = 0;
  const rssItems = items
    .map((item) => {
      const title = item['itunes:title'] || item.title;
      const enclosure = item.enclosure;
      const audio = enclosure?.['@_url'] || null;
      const duration = item['itunes:duration'] || null;

      if (!title) {
        return null;
      }

      const rawEpisode = item['itunes:episode'] || item['itunes:episodeNumber'];
      let episodeNumber = rawEpisode
        ? parseInt(String(rawEpisode), 10)
        : Number.NaN;

      if (Number.isNaN(episodeNumber) && typeof title === 'string') {
        const fallbackMatch = title.match(/^\s*(\d+)\./);
        if (fallbackMatch) {
          episodeNumber = parseInt(fallbackMatch[1], 10);
          fallbackEpisodeCount += 1;
        }
      }

      if (Number.isNaN(episodeNumber)) {
        const guid = item.guid?._text || item.guid || 'unknown';
        console.warn(
          `Skipping RSS item without episode number: title="${title}" guid="${guid}"`
        );
        return null;
      }

      const description = stripHtmlAndDecode(
        item.description || item['itunes:summary'] || ''
      );

      return {
        episode: episodeNumber,
        title,
        pubDate: item.pubDate || '',
        description,
        duration,
        audio,
      };
    })
    .filter((item) => item !== null);

  console.log(`Parsed ${rssItems.length} episodes from RSS`);
  if (fallbackEpisodeCount > 0) {
    console.log(
      `Applied title-based episode fallback for ${fallbackEpisodeCount} RSS items`
    );
  }
  return rssItems;
}

function readCSV() {
  console.log('Reading CSV...');
  const csvPath = path.join(__dirname, '..', 'data', 'trih_episode_list.csv');
  const fileContent = fs.readFileSync(csvPath, 'utf-8');

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const csvRows = [];

  for (const record of records) {
    const episodeValue = record.Episode || record.episode;

    if (!episodeValue || episodeValue === '#VALUE!') {
      continue;
    }

    const episodeNum = parseInt(episodeValue, 10);
    if (isNaN(episodeNum)) {
      continue;
    }

    const era = (record['Time Period'] || record.era || '').trim();
    const region = (record.Region || record.region || '').trim();
    const title = (record.Title || record.title || '').trim();

    if (!era && !region) {
      continue;
    }

    csvRows.push({
      episode: episodeNum,
      title: title || undefined,
      era,
      region,
    });
  }

  console.log(`Parsed ${csvRows.length} rows from CSV`);
  return csvRows;
}

function joinData(rssItems, csvRows) {
  console.log('Joining datasets...');
  const csvByEpisode = new Map();

  for (const row of csvRows) {
    const existing = csvByEpisode.get(row.episode) || [];
    existing.push(row);
    csvByEpisode.set(row.episode, existing);
  }

  const episodes = rssItems.map((item) => {
    const csvData = csvByEpisode.get(item.episode) || [];

    const eras = Array.from(
      new Set(csvData.map((r) => r.era).filter((e) => e))
    ).sort();

    const regions = Array.from(
      new Set(csvData.map((r) => r.region).filter((r) => r))
    ).sort();

    const title_sheet = csvData.find((r) => r.title)?.title || null;

    return {
      episode: item.episode,
      title_feed: item.title,
      title_sheet,
      pubDate: item.pubDate,
      description: item.description,
      duration: item.duration,
      audio: item.audio,
      eras,
      regions,
    };
  });

  episodes.sort((a, b) => b.episode - a.episode);

  console.log(`Created ${episodes.length} merged episodes`);
  return episodes;
}

async function main() {
  try {
    const rssItems = await fetchRSS();
    const csvRows = readCSV();
    const episodes = joinData(rssItems, csvRows);

    const outputPath = path.join(__dirname, '..', 'public', 'episodes.json');
    fs.writeFileSync(outputPath, JSON.stringify(episodes, null, 2));

    console.log(`✅ Successfully wrote ${episodes.length} episodes to public/episodes.json`);
  } catch (error) {
    console.error('❌ Error building dataset:', error);
    process.exit(1);
  }
}

main();
