import type { Episode } from "./types";
import { cleanTitleStem, parseDate, daysBetween, slugify } from "./utils";
import { romanToInt } from "./roman";

export interface SeriesGroup {
  key: string;
  stem: string;
  episodes: Episode[];
  parts: number[];
}

const PART_REGEX = /(.*?)(?:\s*[-–—:]\s*)?(?:part|pt\.?)\s*(?:#|no\.?\s*)?([ivxlcdm]+|\d+)/i;

interface TitleCandidate {
  key: string;
  stem: string;
  part: number;
}

function extractSeriesCandidate(title: string | null): TitleCandidate | null {
  if (!title) return null;
  const match = title.match(PART_REGEX);
  if (!match) return null;
  const rawStem = cleanTitleStem(match[1] ?? "");
  if (!rawStem) return null;
  const rawPart = match[2];
  if (!rawPart) return null;
  const numeric = /\d+/.test(rawPart) ? Number.parseInt(rawPart, 10) : romanToInt(rawPart);
  if (!numeric || Number.isNaN(numeric) || numeric <= 0) return null;
  const key = slugify(rawStem);
  if (!key) return null;
  return {
    key,
    stem: rawStem,
    part: numeric,
  };
}

function pickCandidate(episode: Episode): TitleCandidate | null {
  const fromSheet = extractSeriesCandidate(episode.title_sheet ?? null);
  if (fromSheet) return fromSheet;
  return extractSeriesCandidate(episode.title_feed ?? null);
}

function sortEntries(entries: Array<{ episode: Episode; part: number; stem: string }>) {
  return [...entries].sort((a, b) => a.episode.episode - b.episode.episode);
}

function isValidSeries(entries: Array<{ episode: Episode; part: number; stem: string }>): boolean {
  if (entries.length < 2) return false;
  const sorted = sortEntries(entries);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.part !== prev.part + 1) {
      return false;
    }
    const episodeGap = curr.episode.episode - prev.episode.episode;
    if (episodeGap > 2) {
      return false;
    }
    const prevDate = parseDate(prev.episode.pubDate);
    const currDate = parseDate(curr.episode.pubDate);
    const diff = daysBetween(prevDate, currDate);
    if (diff !== null && diff > 21) {
      return false;
    }
  }
  return true;
}

export function detectSeriesGroups(episodes: Episode[]): Map<string, SeriesGroup> {
  const grouped = new Map<string, Array<{ episode: Episode; part: number; stem: string }>>();

  for (const episode of episodes) {
    const candidate = pickCandidate(episode);
    if (!candidate) continue;
    const bucket = grouped.get(candidate.key) ?? [];
    bucket.push({ episode, part: candidate.part, stem: candidate.stem });
    grouped.set(candidate.key, bucket);
  }

  const groupsByKey = new Map<string, SeriesGroup>();

  for (const [key, entries] of grouped.entries()) {
    if (!isValidSeries(entries)) {
      continue;
    }
    const sorted = sortEntries(entries);
    const stem = sorted[0]?.stem ?? key;
    const parts = sorted.map((item, index) => (index + 1));
    const episodesList = sorted.map((item) => item.episode);
    groupsByKey.set(key, {
      key,
      stem,
      episodes: episodesList,
      parts,
    });
  }

  return groupsByKey;
}
