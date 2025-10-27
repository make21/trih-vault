import type { Episode, RSSItem, CSVRow } from './types';

const stripEpisodePrefix = (title?: string | null): string => {
  if (!title) {
    return '';
  }

  return String(title).replace(/^\s*\d+\s*[).:-]?\s*/, '');
};

const makeSlug = (episodeNumber: number, title?: string | null): string => {
  const cleanedTitle = stripEpisodePrefix(title);
  const t = String(cleanedTitle || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${episodeNumber}-${t || 'episode'}`;
};

export function joinData(rssItems: RSSItem[], csvRows: CSVRow[]): Episode[] {
  const csvByEpisode = new Map<number, CSVRow[]>();

  for (const row of csvRows) {
    const existing = csvByEpisode.get(row.episode) || [];
    existing.push(row);
    csvByEpisode.set(row.episode, existing);
  }

  const episodes: Episode[] = rssItems.map((item) => {
    const csvData = csvByEpisode.get(item.episode) || [];

    const eras = Array.from(
      new Set(csvData.map((r) => r.era).filter((e) => e))
    ).sort();

    const regions = Array.from(
      new Set(csvData.map((r) => r.region).filter((r) => r))
    ).sort();

    const title_sheet = csvData.find((r) => r.title)?.title || null;

    const slug = makeSlug(item.episode, item.title || title_sheet);

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
      slug,
    };
  });

  episodes.sort((a, b) => b.episode - a.episode);

  return episodes;
}
