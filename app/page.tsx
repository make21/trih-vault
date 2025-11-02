import episodesData from '../public/episodes.json';
import seriesData from '../public/series.json';
import BackToTop from '@/components/BackToTop';
import JumpBar from '@/components/JumpBar';
import { Timeline } from '@/ui/timeline/Timeline';
import { buildTimeline, type RawEpisodeInput, type RawSeriesInput } from '@/ui/timeline/buildTimeline';

export default function HomePage() {
  const { rows, undated } = buildTimeline({
    episodes: episodesData as RawEpisodeInput[],
    series: seriesData as RawSeriesInput[]
  });

  return (
    <div className="page">
      <header className="page__content" style={{ gap: 16 }}>
        <h1>The Rest Is History Explorer</h1>
        <p>
          Early plumbing check for the vertical timeline: episodes and series are placed approximately according to their
          historical year ranges. Styling is intentionally minimal for now.
        </p>
        <JumpBar />
      </header>

      <main className="page__content">
        <Timeline rows={rows} undatedEpisodes={undated} />
      </main>

      <BackToTop />
    </div>
  );
}
