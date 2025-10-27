import { XMLParser } from 'fast-xml-parser';
import type { RSSItem } from './types';
import { stripHtmlAndDecode } from './text';

const RSS_URL = 'https://feeds.megaphone.fm/GLT4787413333';

interface FetchRetryOptions {
  retries?: number;
  timeoutMs?: number;
}

type FetchInit = RequestInit & { next?: { revalidate?: number } };

async function fetchWithRetry(
  url: string,
  init: FetchInit = {},
  { retries = 2, timeoutMs = 10_000 }: FetchRetryOptions = {}
) {
  let attempt = 0;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = new Headers(init.headers || {});
      if (!headers.has('User-Agent')) {
        headers.set(
          'User-Agent',
          'TheRestIsHistoryTimeline/1.0 (+https://github.com/trih-browser/trih-browser)'
        );
      }

      const response = await fetch(url, {
        ...init,
        headers,
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

export async function fetchRSS(): Promise<RSSItem[]> {
  const response = await fetchWithRetry(
    RSS_URL,
    {
      next: { revalidate: 43200 },
    },
    { retries: 2, timeoutMs: 10_000 }
  );
  const xml = await response.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  const result = parser.parse(xml);
  const items = result?.rss?.channel?.item || [];

  let fallbackEpisodeCount = 0;
  const rssItems: RSSItem[] = items
    .map((item: any) => {
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
    .filter((item: RSSItem | null): item is RSSItem => item !== null);

  if (fallbackEpisodeCount > 0) {
    console.info(
      `Applied title-based episode fallback for ${fallbackEpisodeCount} RSS items`
    );
  }

  return rssItems;
}
