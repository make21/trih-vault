import Link from "next/link";

import type { PublicEpisode } from "@/types";

import { PillLink } from "./PillLink";
import styles from "./EpisodeCard.module.css";

export interface EpisodeCardProps {
  episode: PublicEpisode;
  showPeopleCount?: number;
  showPlacesCount?: number;
  showThemesCount?: number;
  showTopicsCount?: number;
  seriesHref?: string | null;
  seriesLabel?: string | null;
}

const formatYear = (value: number | null): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return value < 0 ? `${Math.abs(value)} BC` : String(value);
};

export function EpisodeCard({
  episode,
  showPeopleCount = 3,
  showPlacesCount = 2,
  showThemesCount = 0,
  showTopicsCount = 2,
  seriesHref,
  seriesLabel
}: EpisodeCardProps): JSX.Element {
  const people = (episode.people && episode.people.length > 0
    ? episode.people
    : (episode.keyPeople ?? []).map((name) => ({ id: null, name }))
  ).slice(0, showPeopleCount);
  const places = (episode.places && episode.places.length > 0
    ? episode.places
    : (episode.keyPlaces ?? []).map((name) => ({ id: null, name }))
  ).slice(0, showPlacesCount);
  const themes = (episode.keyThemes ?? []).slice(0, showThemesCount);
  const topics = (episode.keyTopics ?? []).slice(0, showTopicsCount);
  const yearFrom = formatYear(episode.yearFrom ?? null);
  const yearTo = formatYear(episode.yearTo ?? null);

  const metaParts = [episode.publishedAt.slice(0, 10)];
  if (yearFrom && yearTo && yearFrom !== yearTo) {
    metaParts.push(`${yearFrom} – ${yearTo}`);
  } else if (yearFrom) {
    metaParts.push(yearFrom);
  }

  const removeAdChoices = (value: string) =>
    value.replace(/Learn more about your ad choices\. Visit podcastchoices\.com\/adchoices/gi, "").trim();

  const description = removeAdChoices(episode.cleanDescriptionText);
  const summary =
    description.length > 220 ? `${description.slice(0, 200).trim().replace(/[.,;:]?$/, "")}…` : description;

  return (
    <article className={styles.card}>
      <div className={styles.titleRow}>
        <Link href={`/episode/${episode.slug}`} className={styles.titleLink}>
          <span>{episode.cleanTitle}</span>
          {episode.part ? <span className={styles.partBadge}>Part {episode.part}</span> : null}
        </Link>
        <div className={styles.meta}>{metaParts.join(" • ")}</div>
        {seriesHref && seriesLabel ? (
          <Link href={seriesHref} className={styles.seriesLink}>
            {seriesLabel}
          </Link>
        ) : null}
      </div>

      <p className={styles.description}>{summary}</p>

      <div className={styles.chipRow}>
        {people.map((person) => (
          <PillLink
            key={person.id ?? person.name}
            href={`/people/${encodeURIComponent(person.id ?? person.name)}`}
            variant="people"
          >
            {person.name}
          </PillLink>
        ))}
        {places.map((place) => (
          <PillLink
            key={place.id ?? place.name}
            href={`/places/${encodeURIComponent(place.id ?? place.name)}`}
            variant="places"
          >
            {place.name}
          </PillLink>
        ))}
        {topics.map((topic) => (
          <PillLink
            key={topic.id}
            href={`/search?topic=${encodeURIComponent(topic.slug)}`}
            variant="topics"
            title={topic.isPending ? "Pending topic proposal" : undefined}
          >
            {topic.label}
          </PillLink>
        ))}
        {themes.map((theme) => (
          <PillLink key={theme} href={`/search?theme=${encodeURIComponent(theme)}`} variant="episode">
            {theme.replace(/-/g, " ")}
          </PillLink>
        ))}
      </div>
    </article>
  );
}

export default EpisodeCard;
