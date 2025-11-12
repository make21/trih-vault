import { Suspense } from 'react';
import episodesData from '../public/episodes.json';
import seriesData from '../public/series.json';
import BackToTop from '@/components/BackToTop';
import { Timeline } from '@/ui/timeline/Timeline';
import { buildTimeline, type RawEpisodeInput, type RawSeriesInput } from '@/ui/timeline/buildTimeline';

export default function HomePage() {
  const episodes = episodesData as RawEpisodeInput[];
  const { rows, undated } = buildTimeline({
    episodes,
    series: seriesData as RawSeriesInput[]
  });

  const latestEpisode = episodes.reduce<null | RawEpisodeInput>((latest, candidate) => {
    if (!candidate.publishedAt) return latest;
    if (!latest || (latest.publishedAt ?? '') < (candidate.publishedAt ?? '')) {
      return candidate;
    }
    return latest;
  }, null);

  return (
    <div className="page">
      <header className="page__hero">
        <p className="page__eyebrow">The Rest Is History</p>
        <h1>The Explorer Timeline</h1>
        <p className="page__tagline">Discover your next listen — explore every era of history in one scrollable timeline.</p>
      </header>

      <main className="page__content">
        <Suspense fallback={<div className="timeline-loading">Loading timeline…</div>}>
          <Timeline
            rows={rows}
            undatedEpisodes={undated}
            latestEpisode={
              latestEpisode
                ? {
                    title: latestEpisode.cleanTitle,
                    slug: latestEpisode.slug,
                    publishedAt: latestEpisode.publishedAt ?? ''
                  }
                : null
            }
          />
        </Suspense>
      </main>

      <BackToTop />
    </div>
  );
}
