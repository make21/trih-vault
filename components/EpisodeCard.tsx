'use client';

import type { Episode } from '@/lib/types';

interface EpisodeCardProps {
  episode: Episode;
}

export default function EpisodeCard({ episode }: EpisodeCardProps) {
  const displayTitle =
    episode.title_feed || episode.title_sheet || `Episode ${episode.episode}`;
  const formattedDate = new Date(episode.pubDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-semibold text-lg">
            {episode.episode}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            {displayTitle}
          </h2>

          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            {formattedDate}
          </p>

          {episode.description && (
            <p className="text-slate-700 dark:text-slate-300 mb-4 line-clamp-3">
              {episode.description}
            </p>
          )}

          <div className="flex flex-wrap gap-2 mb-4">
            {episode.eras.map((era) => (
              <span
                key={era}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200"
              >
                {era}
              </span>
            ))}
            {episode.regions.map((region) => (
              <span
                key={region}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200"
              >
                {region}
              </span>
            ))}
          </div>

          {episode.audio && (
            <audio
              controls
              className="w-full mt-2"
              preload="metadata"
            >
              <source src={episode.audio} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          )}
        </div>
      </div>
    </article>
  );
}
