import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import MiniSearch from "minisearch";

import { PEOPLE_DEFINITIONS, findPerson, findPersonById } from "@/config/people";
import { PLACE_DEFINITIONS, findPlace, findPlaceById } from "@/config/places";
import { TOPIC_DEFINITIONS } from "@/config/topics";
import { loadPublicEpisodes, loadPublicSeries, resetPublicArtefactCache } from "@/lib/data/publicArtefacts";
import { MINI_SEARCH_OPTIONS } from "@/lib/search/options";
import type { SearchDocument } from "@/lib/search/types";
import stableStringify from "@/lib/stableStringify";
import type { PublicEpisode, PublicSeries } from "@/types";

type EntityDocumentSubtype = "person" | "place" | "topic";

export const DEFAULT_SEARCH_INDEX_PATH = join(process.cwd(), "public/search-index.json");
export const DEFAULT_SEARCH_META_PATH = join(process.cwd(), "public/search-index.meta.json");
export const SEARCH_INDEX_GZIP_BUDGET = 1_000_000; // 1 MB budget
export const SEARCH_INDEX_VERSION = "v1";

export interface BuildSearchIndexOptions {
  outputPath?: string;
  metadataPath?: string;
  enableLogging?: boolean;
  enforceBudget?: boolean;
}

const normalizeText = (value: string | null | undefined): string => {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : "";
};

const formatYear = (value: number | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return value < 0 ? `${Math.abs(value)} BC` : `${value}`;
};

const formatYearRange = (from: number | null | undefined, to: number | null | undefined): string | null => {
  const start = formatYear(from);
  const end = formatYear(to);
  if (!start && !end) {
    return null;
  }
  if (start && !end) {
    return start;
  }
  if (!start && end) {
    return end;
  }
  if (start === end) {
    return start;
  }
  return `${start} – ${end}`;
};

const truncate = (value: string, max = 240): string => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max).trim().replace(/[.,;:]?$/, "")}…`;
};

const keywordSet = (...values: Array<string | undefined | null>): string[] => {
  const set = new Set<string>();
  values
    .flat()
    .filter((text): text is string => Boolean(text && text.trim()))
    .forEach((text) => {
      set.add(text.trim());
    });
  return Array.from(set);
};

const getEpisodeSummary = (episode: PublicEpisode): string => {
  const fromBlocks = episode.descriptionBlocks?.[0];
  if (fromBlocks && fromBlocks.trim().length > 0) {
    return truncate(fromBlocks.trim());
  }
  return truncate(episode.cleanDescriptionText ?? "");
};

const getSeriesSummary = (series: PublicSeries): string =>
  truncate(series.narrativeSummary ?? "Explore this multi-part arc from The Rest Is History.");

const ensureArray = <T>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : []);

const PERSON_BY_ID = PEOPLE_DEFINITIONS.reduce((acc, person) => {
  acc.set(person.id, person);
  return acc;
}, new Map<string, (typeof PEOPLE_DEFINITIONS)[number]>());

const PLACE_BY_ID = PLACE_DEFINITIONS.reduce((acc, place) => {
  acc.set(place.id, place);
  return acc;
}, new Map<string, (typeof PLACE_DEFINITIONS)[number]>());

const TOPIC_BY_SLUG = TOPIC_DEFINITIONS.reduce((acc, topic) => {
  acc.set(topic.slug, topic);
  return acc;
}, new Map<string, (typeof TOPIC_DEFINITIONS)[number]>());

const lower = (value: string) => value.trim().toLowerCase();

const getPersonDefinition = (value: string) => findPerson(value) ?? findPersonById(value) ?? PERSON_BY_ID.get(value);
const getPlaceDefinition = (value: string) => findPlace(value) ?? findPlaceById(value) ?? PLACE_BY_ID.get(value);
const getTopicDefinition = (value: string) =>
  TOPIC_BY_SLUG.get(value) ??
  TOPIC_DEFINITIONS.find((topic) => lower(topic.label) === lower(value) || topic.aliases.some((alias) => lower(alias) === lower(value)));

interface FacetAccumulator {
  people: Map<string, { id: string; label: string; count: number }>;
  places: Map<string, { id: string; label: string; count: number }>;
  topics: Map<string, { id: string; label: string; count: number }>;
}

const incrementFacet = (
  acc: Map<string, { id: string; label: string; count: number }>,
  id: string,
  label: string
): void => {
  const key = id || label;
  const existing = acc.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    acc.set(key, { id, label, count: 1 });
  }
};

const createEpisodeDocument = (
  episode: PublicEpisode,
  seriesMap: Map<string, PublicSeries>,
  facetAccumulator: FacetAccumulator
): SearchDocument => {
  const series = episode.seriesId ? seriesMap.get(episode.seriesId) : undefined;
  const summary = getEpisodeSummary(episode);
  const description = normalizeText(episode.cleanDescriptionText);
  const yearRange = formatYearRange(episode.yearFrom ?? null, episode.yearTo ?? null);
  const people = ensureArray(episode.people).map((person) => ({
    id: person.id,
    label: person.name
  }));
  const places = ensureArray(episode.places).map((place) => ({
    id: place.id,
    label: place.name
  }));
  const topics = ensureArray(episode.keyTopics).map((topic) => ({
    id: topic.id,
    label: topic.label ?? topic.slug ?? topic.id,
    slug: topic.slug
  }));

  const keywordParts: string[] = [];
  keywordParts.push(...(episode.keyPeople ?? []));
  keywordParts.push(...(episode.keyPlaces ?? []));
  keywordParts.push(...topics.map((topic) => topic.label));

  people.forEach((person) => {
    keywordParts.push(person.label);
    const registry = getPersonDefinition(person.id) ?? getPersonDefinition(person.label);
    if (registry) {
      keywordParts.push(registry.preferredName);
      keywordParts.push(...registry.aliases);
    }
    incrementFacet(facetAccumulator.people, person.id, person.label);
  });

  places.forEach((place) => {
    keywordParts.push(place.label);
    const registry = getPlaceDefinition(place.id) ?? getPlaceDefinition(place.label);
    if (registry) {
      keywordParts.push(registry.preferredName);
      keywordParts.push(...registry.aliases);
    }
    incrementFacet(facetAccumulator.places, place.id, place.label);
  });

  topics.forEach((topic) => {
    keywordParts.push(topic.label);
    const registry = getTopicDefinition(topic.slug ?? topic.id ?? topic.label);
    if (registry) {
      keywordParts.push(registry.preferredName ?? registry.label);
      keywordParts.push(...registry.aliases);
    }
    incrementFacet(facetAccumulator.topics, topic.id ?? topic.label, topic.label);
  });

  if (series) {
    keywordParts.push(series.seriesTitle);
  }

  const keywordsText = keywordSet(episode.cleanTitle, summary, description, ...keywordParts).join(" ");

  return {
    id: `episode:${episode.episodeId}`,
    type: "episode",
    slug: episode.slug,
    title: episode.cleanTitle,
    summary,
    description,
    keywordsText,
    yearRange,
    seriesSlug: series?.slug ?? null,
    seriesTitle: series?.seriesTitle ?? null,
    badge: episode.part ? `Part ${episode.part}` : undefined,
    people,
    places,
    topics: topics.map(({ id, label }) => ({ id, label })),
    publishedAt: episode.publishedAt
  };
};

const createSeriesDocument = (series: PublicSeries, episodes: PublicEpisode[]): SearchDocument => {
  const summary = getSeriesSummary(series);
  const yearRange = formatYearRange(series.yearFrom ?? null, series.yearTo ?? null);

  const keywordParts: string[] = [series.seriesTitle, summary];

  const aggregatedPeople = new Map<string, { id: string; label: string }>();
  const aggregatedPlaces = new Map<string, { id: string; label: string }>();

  episodes.forEach((episode) => {
    ensureArray(episode.people).forEach((person) => {
      aggregatedPeople.set(person.id, { id: person.id, label: person.name });
    });
    ensureArray(episode.places).forEach((place) => {
      aggregatedPlaces.set(place.id, { id: place.id, label: place.name });
    });
    keywordParts.push(...(episode.keyTopics ?? []).map((topic) => topic.label));
  });

  const people = Array.from(aggregatedPeople.values());
  const places = Array.from(aggregatedPlaces.values());

  people.forEach((person) => {
    keywordParts.push(person.label);
    const registry = getPersonDefinition(person.id) ?? getPersonDefinition(person.label);
    if (registry) {
      keywordParts.push(registry.preferredName);
      keywordParts.push(...registry.aliases);
    }
  });

  places.forEach((place) => {
    keywordParts.push(place.label);
    const registry = getPlaceDefinition(place.id) ?? getPlaceDefinition(place.label);
    if (registry) {
      keywordParts.push(registry.preferredName);
      keywordParts.push(...registry.aliases);
    }
  });

  const keywordsText = keywordSet(...keywordParts).join(" ");

  return {
    id: `series:${series.seriesId}`,
    type: "series",
    slug: series.slug,
    title: series.seriesTitle,
    summary,
    description: summary,
    keywordsText,
    yearRange,
    badge: `${series.episodeIds.length} episodes`,
    people,
    places,
    topics: [],
    seriesSlug: series.slug,
    seriesTitle: series.seriesTitle
  };
};

const createEntityDocuments = (): SearchDocument[] => {
  const entityDocs: SearchDocument[] = [];

  PEOPLE_DEFINITIONS.forEach((person) => {
    const keywordsText = keywordSet(person.preferredName, ...person.aliases, person.description, person.notes).join(" ");
    entityDocs.push({
      id: `entity:person:${person.id}`,
      type: "entity",
      entityType: "person",
      slug: `people/${person.id}`,
      title: person.preferredName,
      summary: person.notes ?? person.description ?? "Canonical person entry",
      description: person.notes ?? person.description ?? "",
      keywordsText,
      yearRange: null
    });
  });

  PLACE_DEFINITIONS.forEach((place) => {
    const keywordsText = keywordSet(place.preferredName, ...place.aliases, place.description, place.notes).join(" ");
    entityDocs.push({
      id: `entity:place:${place.id}`,
      type: "entity",
      entityType: "place",
      slug: `places/${place.id}`,
      title: place.preferredName,
      summary: place.notes ?? place.description ?? "Canonical place entry",
      description: place.notes ?? place.description ?? "",
      keywordsText,
      yearRange: null
    });
  });

  TOPIC_DEFINITIONS.forEach((topic) => {
    const preferred = topic.preferredName ?? topic.label;
    const keywordsText = keywordSet(preferred, ...topic.aliases, topic.description, topic.notes).join(" ");
    entityDocs.push({
      id: `entity:topic:${topic.slug}`,
      type: "entity",
      entityType: "topic",
      slug: `topics/${topic.slug}`,
      title: preferred,
      summary: topic.notes ?? topic.description ?? "Canonical topic entry",
      description: topic.notes ?? topic.description ?? "",
      keywordsText,
      yearRange: null
    });
  });

  return entityDocs;
};

export const buildSearchIndex = (options: BuildSearchIndexOptions = {}): { metadata: unknown; path: string } => {
  resetPublicArtefactCache();
  const episodes = loadPublicEpisodes();
  const series = loadPublicSeries();
  const seriesMap = new Map(series.map((entry) => [entry.seriesId, entry]));
  const facetAccumulator: FacetAccumulator = {
    people: new Map(),
    places: new Map(),
    topics: new Map()
  };

  const miniSearch = new MiniSearch<SearchDocument>(MINI_SEARCH_OPTIONS);

  const episodeDocs = episodes
    .slice()
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((episode) => createEpisodeDocument(episode, seriesMap, facetAccumulator));
  const seriesDocs = series
    .slice()
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((entry) => {
      const episodeRefs = entry.episodeIds
        .map((episodeId) => episodes.find((ep) => ep.episodeId === episodeId))
        .filter((value): value is PublicEpisode => Boolean(value));
      return createSeriesDocument(entry, episodeRefs);
    });
  const entityDocs = createEntityDocuments();

  const allDocs = [...episodeDocs, ...seriesDocs, ...entityDocs];
  miniSearch.addAll(allDocs);

  const serialized = stableStringify(miniSearch.toJSON());
  const compressedSize = gzipSync(serialized).length;
  if (options.enforceBudget !== false && compressedSize > SEARCH_INDEX_GZIP_BUDGET) {
    throw new Error(`search-index.json exceeds gzip budget (${compressedSize} bytes > ${SEARCH_INDEX_GZIP_BUDGET})`);
  }

  const outputPath = options.outputPath ?? DEFAULT_SEARCH_INDEX_PATH;
  const metadataPath = options.metadataPath ?? DEFAULT_SEARCH_META_PATH;

  writeFileSync(outputPath, `${serialized}\n`);

  const facetEntries = (acc: Map<string, { id: string; label: string; count: number }>) =>
    Array.from(acc.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 12);

  const metadata = {
    version: SEARCH_INDEX_VERSION,
    createdAt: new Date().toISOString(),
    documents: {
      total: allDocs.length,
      episodes: episodeDocs.length,
      series: seriesDocs.length,
      entities: entityDocs.length
    },
    size: {
      bytes: Buffer.byteLength(serialized, "utf-8"),
      gzipBytes: compressedSize
    },
    facets: {
      people: facetEntries(facetAccumulator.people),
      places: facetEntries(facetAccumulator.places),
      topics: facetEntries(facetAccumulator.topics)
    }
  };

  writeFileSync(metadataPath, `${stableStringify(metadata)}\n`);

  if (options.enableLogging ?? true) {
    // eslint-disable-next-line no-console
    console.log(
      `Search index ready: ${metadata.documents.total} docs (${metadata.size.bytes} bytes raw, ${metadata.size.gzipBytes} bytes gzipped)`
    );
  }

  return { metadata, path: outputPath };
};

const isDirectRun = process.argv[1]?.includes("build-search-index");
if (isDirectRun) {
  buildSearchIndex();
}
