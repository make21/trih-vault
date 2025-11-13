import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EpisodeCard, FindAndListen, LayoutDetail, PillLink, QuickFacts, RelatedRow } from "@/components/detail";
import { getAllSeries, getSeriesAggregate, getSeriesBySlug } from "@/lib/data";
import { getPersonHref, getPlaceHref } from "@/lib/entityLinks";
import { getTopPeopleForSeries, getTopPlacesForSeries } from "@/lib/indexes";
import { findRelatedSeries } from "@/lib/similar";
import { buildSeriesStructuredData } from "@/lib/structuredData";

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
  return getAllSeries().map((series) => ({ slug: series.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const series = getSeriesBySlug(params.slug);
  if (!series) {
    return {};
  }

  const description =
    series.narrativeSummary ??
    `Explore “${series.seriesTitle}” on The Rest Is History with ${series.episodeIds.length} in-depth episodes.`;

  return {
    title: `${series.seriesTitle} — The Rest Is History Vault`,
    description
  };
}

interface SeriesPageProps {
  params: { slug: string };
}

export default function SeriesPage({ params }: SeriesPageProps): JSX.Element {
  const series = getSeriesBySlug(params.slug);
  if (!series) {
    notFound();
  }

  const aggregate = getSeriesAggregate(series.seriesId);
  if (!aggregate) {
    notFound();
  }

  const { episodes } = aggregate;
  const quickFacts = [
    { term: "Episode count", detail: `${episodes.length}` },
    { term: "Year span", detail: formatYearRange(series.yearFrom, series.yearTo) ?? "Unknown" },
    { term: "Published date", detail: episodes[0]?.publishedAt?.slice(0, 10) ?? "Unknown" }
  ].filter((item) => item.detail);

  const topPeople = getTopPeopleForSeries(series.seriesId, 8);
  const topPlaces = getTopPlacesForSeries(series.seriesId, 8);

  const relatedSeries = findRelatedSeries(series.seriesId, 6).map(({ series: entry }) => ({
    href: `/series/${entry.slug}`,
    title: entry.seriesTitle
  }));

  const structuredData = JSON.stringify(
    buildSeriesStructuredData(series, {
      episodes,
      people: topPeople.map((person) => person.name),
      places: topPlaces.map((place) => place.name)
    })
  );

  return (
    <>
      <LayoutDetail title={series.seriesTitle} subtitle={series.narrativeSummary ?? undefined}>
        <QuickFacts items={quickFacts} columns={2} />

        {(topPeople.length > 0 || topPlaces.length > 0) && (
          <section className={styles.section}>
            <h2>At a glance</h2>
            <div className={styles.pillList}>
              {topPeople.map((person) => (
                <PillLink key={person.name} href={getPersonHref(person.name)} variant="people">
                  {person.name}
                </PillLink>
              ))}
              {topPlaces.map((place) => (
                <PillLink key={place.name} href={getPlaceHref(place.name)} variant="places">
                  {place.name}
                </PillLink>
              ))}
            </div>
          </section>
        )}

        <section className={styles.section}>
          <h2>Episodes in this series</h2>
          <div className={styles.episodeGrid}>
            {episodes.map((episode) => (
              <EpisodeCard
                key={episode.episodeId}
                episode={episode}
                showPeopleCount={2}
                showPlacesCount={1}
                showThemesCount={0}
              />
            ))}
          </div>
        </section>

        <FindAndListen title="Listen to this arc" />

        <RelatedRow title="Related series" items={relatedSeries} />
      </LayoutDetail>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
    </>
  );
}
