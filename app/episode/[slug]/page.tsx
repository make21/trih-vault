import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EpisodeCard, FindAndListen, LayoutDetail, PillLink, QuickFacts, RelatedRow } from "@/components/detail";
import {
  getAllEpisodes,
  getEpisodeBySlug,
  getEpisodesForSeries,
  getSeriesById
} from "@/lib/data";
import { findRelatedEpisodes } from "@/lib/similar";

import styles from "./page.module.css";

const formatYear = (value: number | null): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return value < 0 ? `${Math.abs(value)} BC` : value.toString();
};

const formatYearRange = (from: number | null, to: number | null): string | null => {
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
    return start ?? null;
  }
  return `${start} – ${end}`;
};

export function generateStaticParams(): Array<{ slug: string }> {
  return getAllEpisodes().map((episode) => ({ slug: episode.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const episode = getEpisodeBySlug(params.slug);
  if (!episode) {
    return {};
  }

  const series = episode.seriesId ? getSeriesById(episode.seriesId) : undefined;
  const description = episode.cleanDescriptionText.slice(0, 160);

  return {
    title: `${episode.cleanTitle} — The Rest Is History`,
    description: series ? `${series.seriesTitle}: ${description}` : description
  };
}

interface EpisodePageProps {
  params: { slug: string };
}

export default function EpisodePage({ params }: EpisodePageProps): JSX.Element {
  const episode = getEpisodeBySlug(params.slug);
  if (!episode) {
    notFound();
  }

  const series = episode.seriesId ? getSeriesById(episode.seriesId) : undefined;
  const siblings = episode.seriesId ? getEpisodesForSeries(episode.seriesId).filter((item) => item.episodeId !== episode.episodeId) : [];
  const relatedEpisodes = findRelatedEpisodes(episode.episodeId, 6)
    .filter(({ episode: candidate }) => candidate.episodeId !== episode.episodeId)
    .map(({ episode: candidate }) => ({
      href: `/episode/${candidate.slug}`,
      title: candidate.cleanTitle
    }));

  const removeAdChoices = (value: string) =>
    value.replace(/Learn more about your ad choices\. Visit podcastchoices\.com\/adchoices/gi, "").trim();

  const cleanedDescription = removeAdChoices(episode.cleanDescriptionText);

  const publishedLabel = episode.publishedAt ? episode.publishedAt.slice(0, 10) : "Unknown";
  const topics = episode.keyTopics ?? [];
  const topicsToShow = topics.slice(0, 4);

  const quickFacts = [
    { term: "Series", detail: series ? <PillLink href={`/series/${series.slug}`} variant="series">{series.seriesTitle}</PillLink> : "Standalone" },
    { term: "Published date", detail: publishedLabel },
    { term: "Year span", detail: formatYearRange(episode.yearFrom, episode.yearTo) ?? "Unknown" }
  ];

  if (series && episode.part) {
    quickFacts.splice(1, 0, { term: "Part", detail: `Part ${episode.part}` });
  }

  if (topicsToShow.length > 0) {
    quickFacts.splice(1, 0, {
      term: "Topics",
      detail: (
        <div className={styles.factPills}>
          {topicsToShow.map((topic) => (
            <PillLink
              key={topic.id}
              href={`/search?topic=${encodeURIComponent(topic.slug)}`}
              variant="topics"
              title={topic.isPending ? "Pending topic proposal" : undefined}
            >
              {topic.label}
            </PillLink>
          ))}
        </div>
      )
    });
  }

  const breadcrumbs = [
    { label: "Timeline", href: "/" },
    ...(series ? [{ label: series.seriesTitle, href: `/series/${series.slug}` }] : []),
    { label: episode.cleanTitle, href: `/episode/${episode.slug}` }
  ];

  const people = (episode.keyPeople ?? []).slice(0, 8);
  const places = (episode.keyPlaces ?? []).slice(0, 6);

  return (
    <LayoutDetail title={episode.cleanTitle} subtitle={cleanedDescription} breadcrumbs={breadcrumbs}>
      <QuickFacts items={quickFacts} columns={2} />

      {(people.length > 0 || places.length > 0) && (
        <section className={styles.section}>
          <h2>At a glance</h2>
          <div className={styles.pillList}>
            {people.map((person) => (
              <PillLink key={person} href={`/people/${encodeURIComponent(person)}`} variant="people">
                {person}
              </PillLink>
            ))}
            {places.map((place) => (
              <PillLink key={place} href={`/places/${encodeURIComponent(place)}`} variant="places">
                {place}
              </PillLink>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2>Listen now</h2>
        <audio controls className={styles.audio} src={episode.audioUrl}>
          Your browser does not support the audio element.
        </audio>
        <FindAndListen />
      </section>

      {siblings.length > 0 ? (
        <section className={styles.section}>
          <h2>More from this series</h2>
          <div className={styles.episodeGrid}>
            {siblings.map((sibling) => (
              <EpisodeCard
                key={sibling.episodeId}
                episode={sibling}
                showPeopleCount={2}
                showPlacesCount={1}
              />
            ))}
          </div>
        </section>
      ) : null}

      <RelatedRow title="You might also like" items={relatedEpisodes} />
    </LayoutDetail>
  );
}
