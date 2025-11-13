import { Suspense } from "react";

import BackToTop from "@/components/BackToTop";
import { SearchTrigger } from "@/components/search/SearchTrigger";
import { Timeline } from "@/ui/timeline/Timeline";
import { buildTimeline, type RawEpisodeInput, type RawSeriesInput } from "@/ui/timeline/buildTimeline";
import episodesData from "../public/episodes.json";
import seriesData from "../public/series.json";

export default function HomePage() {
  const episodes = episodesData as RawEpisodeInput[];
  const { rows, undated } = buildTimeline({
    episodes,
    series: seriesData as RawSeriesInput[]
  });

  const latestEpisode = episodes.reduce<RawEpisodeInput | null>((latest, candidate) => {
    if (!candidate.publishedAt) return latest;
    if (!latest || (latest.publishedAt ?? "") < (candidate.publishedAt ?? "")) {
      return candidate;
    }
    return latest;
  }, null);

  return (
    <div className="page">
      <header className="page__hero page__hero--centered">
        <h1>The Rest Is History Explorer</h1>
        <p className="page__tagline">A better way to find your next listen.</p>
        <div className="hero-search hero-search--inline">
          <SearchTrigger />
        </div>
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
                    publishedAt: latestEpisode.publishedAt ?? ""
                  }
                : null
            }
            showLatestBanner={false}
          />
        </Suspense>
      </main>

      <BackToTop />
    </div>
  );
}
