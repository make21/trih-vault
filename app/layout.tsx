import type { Metadata } from "next";

import { Footer } from "@/components/layout/Footer";
import { TopBar } from "@/components/layout/TopBar";
import { SearchProvider } from "@/components/search/SearchProvider";
import episodesData from "../public/episodes.json";

import "./globals.css";

export const metadata: Metadata = {
  title: "The Rest Is History Vault",
  description: "Browse The Rest Is History Vault for episodes, series, people, places, and topics in one place."
};

type EpisodeSummary = { slug: string; cleanTitle: string; publishedAt?: string };

const latestEpisode = (() => {
  const episodes = episodesData as EpisodeSummary[];
  return episodes.reduce<{ title: string; slug: string; publishedAt: string } | null>((latest, candidate) => {
    if (!candidate.publishedAt) {
      return latest;
    }
    if (!latest) {
      return { title: candidate.cleanTitle, slug: candidate.slug, publishedAt: candidate.publishedAt };
    }
    const currentDate = new Date(candidate.publishedAt);
    const latestDate = new Date(latest.publishedAt);
    if (currentDate > latestDate) {
      return { title: candidate.cleanTitle, slug: candidate.slug, publishedAt: candidate.publishedAt };
    }
    return latest;
  }, null);
})();

export default function RootLayout(props: Readonly<{ children: React.ReactNode }>) {
  const { children } = props;

  return (
    <html lang="en">
      <body>
        <SearchProvider>
          <div className="site-shell">
            <TopBar latestEpisode={latestEpisode ?? undefined} />
            <div className="site-content">{children}</div>
            <Footer />
          </div>
        </SearchProvider>
      </body>
    </html>
  );
}
