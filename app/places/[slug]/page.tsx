import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EntityLayout, QuickFacts } from "@/components/detail";
import type { QuickFactsItem } from "@/components/detail/QuickFacts";
import EntityEpisodes from "@/components/entity/EntityEpisodes";
import entityStyles from "@/components/entity/EntityPage.module.css";
import { formatDisplayDate, getPlaceEntityData, getPlaceStaticSlugs } from "@/lib/entities";
import { buildEntityStructuredData, stringifyJsonLd } from "@/lib/structuredData";

export function generateStaticParams(): Array<{ slug: string }> {
  return getPlaceStaticSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const data = getPlaceEntityData(params.slug);
  if (!data) {
    return {};
  }

  return {
    title: `${data.label} — The Rest Is History Vault`,
    description: data.metaDescription
  };
}

interface PlacePageProps {
  params: { slug: string };
}

export default function PlacePage({ params }: PlacePageProps): JSX.Element {
  const data = getPlaceEntityData(params.slug);
  if (!data) {
    notFound();
  }
  const structuredData = stringifyJsonLd(buildEntityStructuredData(data));

  const facts: QuickFactsItem[] = [];
  const renderEpisodeFact = (entry: NonNullable<typeof data.firstEpisode>) => (
    <div className={entityStyles.factLink}>
      <Link href={`/episode/${entry.episode.slug}`}>{entry.episode.cleanTitle}</Link>
      <span className={entityStyles.factDate}>{formatDisplayDate(entry.episode.publishedAt)}</span>
    </div>
  );

  if (data.firstEpisode) {
    facts.push({
      term: "First Episode Appearance",
      detail: renderEpisodeFact(data.firstEpisode)
    });
  }

  if (data.latestEpisode && data.latestEpisode !== data.firstEpisode) {
    facts.push({
      term: "Last Episode Appearance",
      detail: renderEpisodeFact(data.latestEpisode)
    });
  }

  if (data.yearRangeLabel) {
    facts.push({ term: "Year Range", detail: data.yearRangeLabel });
  }

  const factColumns = (facts.length >= 4 ? 3 : 2) as 1 | 2 | 3;

  const factsBlock = facts.length > 0 ? <QuickFacts items={facts} columns={factColumns} /> : null;

  const sectionClass = `${entityStyles.section} ${data.episodes.length <= 3 ? entityStyles.sectionCompact : ""}`;

  return (
    <>
      <EntityLayout title={data.label} subtitle={data.description}>
        {factsBlock}
        {data.notes ? <p className={entityStyles.notes}>{data.notes}</p> : null}

        <section className={sectionClass}>
          <h2 className={entityStyles.seoHeading}>The Rest Is History episodes about {data.label}</h2>
          <EntityEpisodes entries={data.episodes} />
        </section>
      </EntityLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
    </>
  );
}
