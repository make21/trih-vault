import type { EntityPageData } from "@/lib/entities";
import type { PublicEpisode, PublicSeries } from "@/types";

import { getPersonHref, getPlaceHref, getTopicHref } from "@/lib/entityLinks";

import { buildCanonicalUrl } from "./urls";

export function stringifyJsonLd(data: unknown): string {
  const json = JSON.stringify(data);
  if (!json) {
    return "";
  }
  return json
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

type EntitySchemaType = "Person" | "Place" | "DefinedTerm";

const ENTITY_SCHEMA_TYPE: Record<EntityPageData["filterParam"], EntitySchemaType> = {
  person: "Person",
  place: "Place",
  topic: "DefinedTerm"
};

const ENTITY_ROUTE_SEGMENT: Record<EntityPageData["filterParam"], string> = {
  person: "people",
  place: "places",
  topic: "topics"
};

const formatYear = (value: number): string => (value < 0 ? `${Math.abs(value)} BC` : `${value}`);

const scrubWhitespace = (value: string | undefined): string | undefined =>
  value ? value.replace(/\u202F/g, " ") : value;

const buildEpisodeSubject = (entry: EntityPageData["episodes"][number]) => {
  const episodeUrl = buildCanonicalUrl(`/episode/${entry.episode.slug}`);
  const subject: Record<string, unknown> = {
    "@type": "PodcastEpisode",
    "@id": episodeUrl,
    url: episodeUrl,
    name: entry.episode.cleanTitle,
    datePublished: entry.episode.publishedAt
  };

  if (entry.series) {
    const seriesUrl = buildCanonicalUrl(`/series/${entry.series.slug}`);
    subject.partOfSeries = {
      "@type": "CreativeWorkSeries",
      "@id": seriesUrl,
      url: seriesUrl,
      name: entry.series.seriesTitle
    };
  }

  const years: number[] = [];
  if (typeof entry.episode.yearFrom === "number") {
    years.push(entry.episode.yearFrom);
  }
  if (typeof entry.episode.yearTo === "number") {
    years.push(entry.episode.yearTo);
  }

  if (years.length > 0) {
    const min = Math.min(...years);
    const max = Math.max(...years);
    subject.temporalCoverage = min === max ? formatYear(min) : `${formatYear(min)}/${formatYear(max)}`;
  }

  return subject;
};

const getEpisodePeople = (episode: PublicEpisode) => {
  if (episode.people && episode.people.length > 0) {
    return episode.people;
  }
  return (episode.keyPeople ?? []).map((name) => ({
    id: null,
    name
  }));
};

const getEpisodePlaces = (episode: PublicEpisode) => {
  if (episode.places && episode.places.length > 0) {
    return episode.places;
  }
  return (episode.keyPlaces ?? []).map((name) => ({
    id: null,
    name,
    type: null,
    notes: null
  }));
};

const buildAboutEntry = (
  type: "Person" | "Place" | "DefinedTerm" | "Thing",
  name: string,
  path?: string
) => {
  const entry: Record<string, string> = {
    "@type": type,
    name
  };
  if (path) {
    entry.url = buildCanonicalUrl(path);
  }
  return entry;
};

export const buildEntityStructuredData = (data: EntityPageData) => {
  const segment = ENTITY_ROUTE_SEGMENT[data.filterParam];
  const entityUrl = buildCanonicalUrl(`/${segment}/${encodeURIComponent(data.slug)}`);
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ENTITY_SCHEMA_TYPE[data.filterParam],
    "@id": entityUrl,
    url: entityUrl,
    name: data.label,
    description: data.description ?? data.notes ?? `Episodes exploring ${data.label}`,
    isAccessibleForFree: true,
    inLanguage: "en"
  };

  if (data.notes) {
    schema.disambiguatingDescription = data.notes;
  }

  if (data.typeLabel) {
    schema.additionalType = data.typeLabel;
  }

  if (data.yearRangeLabel) {
    schema.temporalCoverage = scrubWhitespace(data.yearRangeLabel);
  }

  const episodeSubjects = data.episodes.slice(0, 20).map(buildEpisodeSubject);
  if (episodeSubjects.length > 0) {
    schema.subjectOf = episodeSubjects;
  }

  return schema;
};

export const buildEpisodeStructuredData = (episode: PublicEpisode, options?: { series?: PublicSeries | null }) => {
  const episodeUrl = buildCanonicalUrl(`/episode/${episode.slug}`);
  const series = options?.series ?? null;
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    "@id": episodeUrl,
    url: episodeUrl,
    name: episode.cleanTitle,
    description: episode.cleanDescriptionText,
    datePublished: episode.publishedAt ?? undefined,
    isAccessibleForFree: true,
    inLanguage: "en",
    audio: episode.audioUrl
  };

  if (series) {
    const seriesUrl = buildCanonicalUrl(`/series/${series.slug}`);
    schema.partOfSeries = {
      "@type": "CreativeWorkSeries",
      "@id": seriesUrl,
      url: seriesUrl,
      name: series.seriesTitle
    };
  }

  if (episode.part) {
    schema.episodeNumber = episode.part;
  }

  const years: number[] = [];
  if (typeof episode.yearFrom === "number") {
    years.push(episode.yearFrom);
  }
  if (typeof episode.yearTo === "number") {
    years.push(episode.yearTo);
  }
  if (years.length > 0) {
    const min = Math.min(...years);
    const max = Math.max(...years);
    schema.temporalCoverage = min === max ? formatYear(min) : `${formatYear(min)}/${formatYear(max)}`;
  }

  const aboutEntries: Record<string, string>[] = [];

  (episode.keyTopics ?? []).forEach((topic) => {
    aboutEntries.push(
      buildAboutEntry("DefinedTerm", topic.label, topic.slug ? getTopicHref(topic.slug) : undefined)
    );
  });

  getEpisodePeople(episode).forEach((person) => {
    aboutEntries.push(buildAboutEntry("Person", person.name, getPersonHref(person.name, person.id)));
  });

  getEpisodePlaces(episode).forEach((place) => {
    aboutEntries.push(buildAboutEntry("Place", place.name, getPlaceHref(place.name, place.id)));
  });

  if (aboutEntries.length > 0) {
    schema.about = aboutEntries;
  }

  return schema;
};

export const buildSeriesStructuredData = (
  series: PublicSeries,
  options: { episodes: PublicEpisode[]; people?: string[]; places?: string[] }
) => {
  const seriesUrl = buildCanonicalUrl(`/series/${series.slug}`);
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CreativeWorkSeries",
    "@id": seriesUrl,
    url: seriesUrl,
    name: series.seriesTitle,
    description:
      series.narrativeSummary ??
      `Explore “${series.seriesTitle}” on The Rest Is History with ${series.episodeIds.length} episodes.`,
    isAccessibleForFree: true,
    inLanguage: "en",
    numberOfEpisodes: series.episodeIds.length
  };

  if (series.yearFrom !== null || series.yearTo !== null) {
    const years = [series.yearFrom, series.yearTo].filter((value): value is number => typeof value === "number");
    if (years.length > 0) {
      const min = Math.min(...years);
      const max = Math.max(...years);
      schema.temporalCoverage = min === max ? formatYear(min) : `${formatYear(min)}/${formatYear(max)}`;
    }
  }

  const episodes = options.episodes.slice(0, 20).map((episode) => ({
    "@type": "PodcastEpisode",
    "@id": buildCanonicalUrl(`/episode/${episode.slug}`),
    url: buildCanonicalUrl(`/episode/${episode.slug}`),
    name: episode.cleanTitle,
    datePublished: episode.publishedAt ?? undefined
  }));

  if (episodes.length > 0) {
    schema.episode = episodes;
  }

  const aboutEntries: Record<string, string>[] = [];
  (options.people ?? []).forEach((name) => {
    aboutEntries.push(buildAboutEntry("Person", name, getPersonHref(name)));
  });
  (options.places ?? []).forEach((name) => {
    aboutEntries.push(buildAboutEntry("Place", name, getPlaceHref(name)));
  });

  if (aboutEntries.length > 0) {
    schema.about = aboutEntries;
  }

  return schema;
};

export default buildEntityStructuredData;
