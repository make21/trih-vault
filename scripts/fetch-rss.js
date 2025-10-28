import { promises as fs } from 'fs';
import path from 'path';
import {
  FEED_URL,
  extractPart,
  readJsonFile,
  shortHash,
  writeJsonFile,
} from './utils.js';

function decodeHtml(value) {
  if (!value) return '';
  const unwrapped = value.replace(/<!\[CDATA\[/g, '').replace(/]]>/g, '');
  const decoded = unwrapped
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
  return decoded.trim();
}

function extractTag(block, tag) {
  const pattern = `<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`;
  const regex = new RegExp(pattern, 'i');
  const match = block.match(regex);
  return match ? match[1].trim() : null;
}

function extractAttribute(block, tag, attribute) {
  const regex = new RegExp(`<${tag}[^>]*${attribute}="([^"]+)"[^>]*>`, 'i');
  const match = block.match(regex);
  if (match) return match[1];
  const singleQuote = new RegExp(`<${tag}[^>]*${attribute}='([^']+)'[^>]*>`, 'i');
  const alt = block.match(singleQuote);
  return alt ? alt[1] : null;
}

function parseItems(xml) {
  const itemMatches = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return itemMatches.map((itemXml) => {
    const title = decodeHtml(extractTag(itemXml, 'title'));
    const description = decodeHtml(extractTag(itemXml, 'content:encoded') ?? extractTag(itemXml, 'description'));
    const pubDate = decodeHtml(extractTag(itemXml, 'pubDate'));
    const guid = decodeHtml(extractTag(itemXml, 'guid'));
    const itunesEpisode = decodeHtml(extractTag(itemXml, 'itunes:episode'));
    const audioUrl = extractAttribute(itemXml, 'enclosure', 'url') ?? undefined;
    const link = decodeHtml(extractTag(itemXml, 'link'));
    return { title, description, pubDate, guid, itunesEpisode, audioUrl, link };
  });
}

function getAudioUrl(item) {
  if (item.audioUrl) return item.audioUrl;
  if (item.link) return item.link;
  return '';
}

async function main() {
  console.log('Fetching RSS feed…');
  let xml;
  try {
    const response = await fetch(FEED_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
    }
    xml = await response.text();
  } catch (error) {
    const fallbackPath = path.join(process.cwd(), 'data/source', 'rss.sample.xml');
    console.warn(`Falling back to local sample RSS (${fallbackPath}):`, error.message ?? error);
    xml = await fs.readFile(fallbackPath, 'utf8');
  }
  const today = new Date().toISOString().slice(0, 10);
  const snapshotPath = path.join('data/source', `rss.${today}.json`);
  await writeJsonFile(snapshotPath, { fetchedAt: new Date().toISOString(), xml });

  const items = parseItems(xml);
  console.log(`Parsed ${items.length} item(s) from feed.`);

  const existingEpisodes = await readJsonFile('public/episodes.json', []);
  const existingById = new Map(existingEpisodes.map((episode) => [episode.id, episode]));

  const newEpisodes = [];

  for (const item of items) {
    const title = (item.title ?? '').trim();
    if (!title) continue;
    const description = (item.description ?? '').trim();
    const pubDateRaw = item.pubDate ? new Date(item.pubDate) : null;
    if (!pubDateRaw || Number.isNaN(pubDateRaw.getTime())) {
      continue;
    }
    const pubDate = pubDateRaw.toISOString();
    const guid = (item.guid && item.guid.trim()) || title;
    const itunesEpisode = item.itunesEpisode && item.itunesEpisode.trim() !== '' ? Number(item.itunesEpisode) : null;
    const id = itunesEpisode !== null && !Number.isNaN(itunesEpisode)
      ? `ep${itunesEpisode}`
      : `ep_${shortHash(guid)}`;
    if (existingById.has(id) || newEpisodes.some((episode) => episode.id === id)) {
      continue;
    }
    const audioUrl = getAudioUrl(item);
    const part = extractPart(title);
    const episode = {
      id,
      title,
      pubDate,
      description,
      audioUrl,
    };
    if (typeof part === 'number') {
      episode.part = part;
    }
    newEpisodes.push(episode);
  }

  if (newEpisodes.length === 0) {
    console.log('No new episodes discovered.');
    return;
  }

  newEpisodes.sort((a, b) => new Date(a.pubDate).getTime() - new Date(b.pubDate).getTime());

  const merged = [...existingEpisodes, ...newEpisodes];
  await writeJsonFile('public/episodes.json', merged);
  console.log(`Appended ${newEpisodes.length} episode(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
