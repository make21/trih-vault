import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { loadEpisodes } from '@/lib/getEpisodes';
import type { Episode } from '@/lib/types';

export const revalidate = 43200;

type EpisodePageParams = {
  params: {
    slug?: string;
  };
};

const getEpisodeNumber = (slug?: string): number | null => {
  if (!slug) {
    return null;
  }

  const episodePart = slug.split('-')[0];
  const parsed = Number.parseInt(episodePart, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const findEpisode = (episodes: Episode[], episodeNumber: number) =>
  episodes.find((episode) => episode.episode === episodeNumber) ?? null;

const getEpisodeTitle = (episode: Episode) =>
  episode.title_feed || episode.title_sheet || `Episode ${episode.episode}`;

export async function generateMetadata({ params }: EpisodePageParams): Promise<Metadata> {
  const { episodes, isValid } = await loadEpisodes();
  if (!isValid) {
    return {
      title: 'Episode not found',
    };
  }

  const { slug } = params;
  if (!slug) {
    return {
      title: 'Episode not found',
    };
  }

  const episodeNumber = getEpisodeNumber(slug);
  if (episodeNumber === null) {
    return {
      title: 'Episode not found',
    };
  }

  const episode = findEpisode(episodes, episodeNumber);
  if (!episode) {
    return {
      title: 'Episode not found',
    };
  }

  const displayTitle = getEpisodeTitle(episode);
  const title = `Episode ${episode.episode}: ${displayTitle}`;
  const description =
    episode.description ||
    `Explore episode ${episode.episode} of The Rest Is History timeline.`;
  const canonical = `/episode/${episode.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function EpisodePage({ params }: EpisodePageParams) {
  const { episodes, isValid } = await loadEpisodes();

  if (!isValid) {
    notFound();
  }

  const { slug } = params;
  if (!slug) {
    notFound();
  }

  const episodeNumber = getEpisodeNumber(slug);
  if (episodeNumber === null) {
    notFound();
  }

  const episode = findEpisode(episodes, episodeNumber);
  if (!episode) {
    notFound();
  }

  if (episode.slug !== slug) {
    redirect(`/episode/${episode.slug}`);
  }

  const sortedByEpisodeNumber = episodes
    .slice()
    .sort((a, b) => a.episode - b.episode);
  const index = sortedByEpisodeNumber.findIndex(
    (item) => item.episode === episode.episode
  );
  const previousEpisode = index > 0 ? sortedByEpisodeNumber[index - 1] : null;
  const nextEpisode =
    index >= 0 && index < sortedByEpisodeNumber.length - 1
      ? sortedByEpisodeNumber[index + 1]
      : null;

  const formattedDate = new Date(episode.pubDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-blue-100 hover:text-white transition-colors"
          >
            ← Back to all episodes
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <article className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 lg:p-10">
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-sm uppercase tracking-wide text-blue-600 dark:text-blue-300 font-semibold">
                Episode {episode.episode}
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
                {getEpisodeTitle(episode)}
              </h1>
              <p className="mt-3 text-slate-600 dark:text-slate-400">{formattedDate}</p>
            </div>

            {(episode.eras.length > 0 || episode.regions.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {episode.eras.map((era) => (
                  <span
                    key={`era-${era}`}
                    className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 text-xs font-semibold"
                  >
                    {era}
                  </span>
                ))}
                {episode.regions.map((region) => (
                  <span
                    key={`region-${region}`}
                    className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-200 text-xs font-semibold"
                  >
                    {region}
                  </span>
                ))}
              </div>
            )}

            {episode.audio && (
              <div className="mt-4">
                <audio controls className="w-full" preload="metadata">
                  <source src={episode.audio} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {episode.description && (
              <div className="mt-6 space-y-4 text-slate-700 dark:text-slate-300 leading-relaxed">
                {episode.description.split(/\n+/).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            )}
          </div>
        </article>

        <nav className="mt-8 flex flex-col sm:flex-row sm:justify-between gap-4">
          {previousEpisode ? (
            <Link
              href={`/episode/${previousEpisode.slug}`}
              className="flex-1 inline-flex items-center justify-center sm:justify-start px-4 py-3 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              ← Episode {previousEpisode.episode}
            </Link>
          ) : (
            <span className="flex-1" />
          )}
          {nextEpisode ? (
            <Link
              href={`/episode/${nextEpisode.slug}`}
              className="flex-1 inline-flex items-center justify-center sm:justify-end px-4 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Episode {nextEpisode.episode} →
            </Link>
          ) : (
            <span className="flex-1" />
          )}
        </nav>
      </main>
    </div>
  );
}
