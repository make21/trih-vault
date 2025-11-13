"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TimelineDisplayRow, TimelineSeriesRowData, TimelineEpisodeRowData, UndatedEpisode } from "./buildTimeline";
import { computeTimelineLayout } from "./layout";
import { GapMarker } from "@/components/GapMarker";

type TimelineProps = {
  rows: TimelineDisplayRow[];
  undatedEpisodes: UndatedEpisode[];
  latestEpisode: {
    title: string;
    slug: string;
    publishedAt: string;
  } | null;
  showLatestBanner?: boolean;
};

const PIXELS_PER_YEAR = 1.5;
const MIN_GAP_PX = 16;
const MAX_GAP_PX = 240;
const COLLAPSED_GAP_PX = 64;
const SAME_YEAR_GAP_PX = 28;

const ERA_OPTIONS = [
  { id: "all", label: "All Eras" },
  { id: "prehistory", label: "Prehistory", range: { from: -5000, to: -3000 } },
  { id: "ancient", label: "Ancient World", range: { from: -3000, to: 500 } },
  { id: "late-antiquity", label: "Late Antiquity & Early Middle Ages", range: { from: 500, to: 1000 } },
  { id: "high-middle-ages", label: "High Middle Ages", range: { from: 1000, to: 1500 } },
  { id: "early-modern", label: "Early Modern", range: { from: 1500, to: 1800 } },
  { id: "long-19th", label: "Long 19th Century", range: { from: 1789, to: 1914 } },
  { id: "twentieth", label: "20th Century", range: { from: 1914, to: 2000 } },
  { id: "twenty-first", label: "21st Century", range: { from: 2000, to: 3000 } },
  { id: "undated", label: "Undated / Special" }
] as const;

const getPeriodId = (yearValue: number | null): string | null => {
  if (yearValue === null || Number.isNaN(yearValue)) {
    return null;
  }
  if (yearValue <= -3000) return "prehistory";
  if (yearValue <= 500) return "ancient";
  if (yearValue <= 1000) return "late-antiquity";
  if (yearValue <= 1500) return "high-middle-ages";
  if (yearValue <= 1800) return "early-modern";
  if (yearValue <= 1914) return "long-19th";
  if (yearValue <= 2000) return "twentieth";
  return "twenty-first";
};

const isValidEra = (value: string | null): value is (typeof ERA_OPTIONS)[number]["id"] => {
  if (!value) return false;
  return ERA_OPTIONS.some((era) => era.id === value);
};

const filterRowsByEra = (rows: TimelineDisplayRow[], eraId: string): TimelineDisplayRow[] => {
  if (eraId === "all" || eraId === "undated") return rows;
  const era = ERA_OPTIONS.find((option) => option.id === eraId);
  if (!era || !("range" in era)) return rows;
  const { from, to } = era.range;
  return rows.filter((row) => {
    const start = row.yearFrom ?? row.yearTo;
    const end = row.yearTo ?? row.yearFrom;
    if (start == null && end == null) {
      return false;
    }
    const rowFrom = (start ?? end)!;
    const rowTo = (end ?? start ?? rowFrom)!;
    return rowTo >= from && rowFrom <= to;
  });
};

export function Timeline(props: TimelineProps) {
  const { rows, undatedEpisodes, latestEpisode, showLatestBanner = true } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deriveEraFromQuery = useCallback(() => {
    const param = searchParams?.get("era");
    return isValidEra(param) ? param : "all";
  }, [searchParams]);

  const [selectedEra, setSelectedEra] = useState<string>(deriveEraFromQuery);
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());
  const [expandedGaps, setExpandedGaps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next = deriveEraFromQuery();
    setSelectedEra(next);
  }, [deriveEraFromQuery]);

  const filteredRows = useMemo(() => filterRowsByEra(rows, selectedEra), [rows, selectedEra]);

  const layout = useMemo(
    () =>
      computeTimelineLayout(filteredRows, expandedGaps, {
        pixelsPerYear: PIXELS_PER_YEAR,
        minGapPx: MIN_GAP_PX,
        maxGapPx: MAX_GAP_PX,
        collapsedGapPx: COLLAPSED_GAP_PX,
        sameYearGapPx: SAME_YEAR_GAP_PX
      }),
    [filteredRows, expandedGaps]
  );

  const baseHasTimelineContent = layout.nodes.some((node) => node.kind === "item");
  const showUndatedPrimary = selectedEra === "undated";
  const hasTimelineContent = showUndatedPrimary ? undatedEpisodes.length > 0 : baseHasTimelineContent;
  const latestPublishedLabel = useMemo(() => {
    if (!latestEpisode?.publishedAt) return null;
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(latestEpisode.publishedAt)
      );
    } catch {
      return latestEpisode.publishedAt;
    }
  }, [latestEpisode?.publishedAt]);
  const hasUndated = undatedEpisodes.length > 0;
  const [pendingScroll, setPendingScroll] = useState<number | null>(null);

  useEffect(() => {
    if (pendingScroll !== null) {
      window.scrollTo({ top: pendingScroll });
      setPendingScroll(null);
    }
  }, [pendingScroll, filteredRows]);

  const toggleSeries = (id: string) => {
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  const handleEraChange = (nextEra: string) => {
    if (nextEra === selectedEra) return;
    const scrollPosition = typeof window !== "undefined" ? window.scrollY : null;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (nextEra === "all") {
      params.delete("era");
    } else {
      params.set("era", nextEra);
    }
    setSelectedEra(nextEra);
    if (scrollPosition !== null) {
      setPendingScroll(scrollPosition);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const toggleGap = (id: string) => {
    setExpandedGaps((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const renderUndatedSection = (variant: "inline" | "primary") => (
    <section
      id="bucket-undated"
      className={`undated-section${variant === "primary" ? " undated-section--primary" : ""}`}
    >
      <h2>{variant === "primary" ? "Undated / Special Episodes" : "Undated Episodes"}</h2>
      <p>
        Timeless conversations, mythic deep-dives, and other episodes without a clear year span. They&apos;re still worth
        a listen—just tougher to pin on the timeline.
      </p>
      <ul className="undated-list">
        {undatedEpisodes.map((episode) => (
          <li key={episode.id} className="undated-item">
            <Link href={`/episode/${episode.slug}`} className="undated-item__link">
              <div className="undated-item__title">{episode.title}</div>
              <div className="undated-item__meta">{episode.publishedLabel}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  const emptyMessage =
    selectedEra === "all" ? "No timeline content with year data yet." : "No entries in this era (yet).";
  let timelineContent: JSX.Element | null = <p className="timeline__empty">{emptyMessage}</p>;

  if (showUndatedPrimary) {
    timelineContent = renderUndatedSection("primary");
  } else if (hasTimelineContent) {
    const renderedBuckets = new Set<string>();
    let cursor = 0;

    const timelineNodes = layout.nodes.map((node, index) => {
      const delta = node.top - cursor;
      if (node.kind === "gap") {
        const expanded = !!expandedGaps[node.id];
        const gapHeight = node.height;
        const content = (
          <div
            key={`gap-${node.id}`}
            className="timeline__gap"
            style={{
              marginTop: delta,
              height: gapHeight
            }}
          >
            <GapMarker years={node.years} expanded={expanded} onToggle={() => toggleGap(node.id)} />
          </div>
        );
        cursor = node.top + node.height;
        return content;
      }

      const row = node.row;
      const data = row.data;
      const marginTop = index === 0 ? node.top : delta;
      cursor = node.top;

      const key = `item-${row.id}`;
      const yearValue = data && "yearValue" in data ? data.yearValue : row.yearFrom ?? row.yearTo ?? null;
      const periodId = getPeriodId(typeof yearValue === "number" ? yearValue : null);

      const anchors: React.ReactNode[] = [];
      if (periodId && !renderedBuckets.has(periodId)) {
        renderedBuckets.add(periodId);
        anchors.push(<div key={`anchor-${periodId}`} id={`bucket-${periodId}`} />);
      }

      if (data?.kind === "series") {
        const isExpanded = expandedSeries.has(row.id);
        const seriesData = data as TimelineSeriesRowData;
        const partsLabel = `${seriesData.episodeCount} part${seriesData.episodeCount === 1 ? "" : "s"}`;

        const seriesHref = row.href ?? `/series/${row.id}`;

        return (
          <Fragment key={key}>
            {anchors}
            <div className="timeline__entry timeline__entry--series" style={{ marginTop }}>
              <span className="timeline__marker timeline__marker--series" aria-hidden />
              <div className="timeline__card timeline__card--series">
                <span className="timeline__pill">Series</span>
                <div className="timeline__series-header">
                  <Link href={seriesHref} className="timeline__series-link">
                    <div className="timeline__year">{seriesData.yearLabel}</div>
                    <span className="timeline__title-group">
                      <span className="timeline__title">{row.title}</span>
                      <span className="timeline__meta timeline__meta--series">{partsLabel}</span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="timeline__series-toggle"
                    onClick={() => toggleSeries(row.id)}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? "Collapse series episodes" : "Expand series episodes"}
                  >
                    <span className="timeline__series-toggle-icon" aria-hidden>
                      {isExpanded ? "−" : "+"}
                    </span>
                  </button>
                </div>

                {isExpanded ? (
                  <ul className="timeline__series-list">
                    {seriesData.episodes.map((episode) => {
                      const episodeHref = episode.slug ? `/episode/${episode.slug}` : `/episode/${episode.id}`;
                      return (
                        <li key={episode.id}>
                          <Link href={episodeHref} className="timeline__series-episode">
                            <div className="timeline__series-episode-title">
                              {episode.title}
                              {episode.partLabel ? (
                                <span className="timeline__series-part">{episode.partLabel}</span>
                              ) : null}
                            </div>
                            {episode.yearLabel ? (
                              <div className="timeline__series-episode-year">{episode.yearLabel}</div>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </div>
          </Fragment>
        );
      }

      const episodeData = data as TimelineEpisodeRowData | undefined;
      const episodeHref = row.href ?? `/episode/${row.id}`;

      return (
        <Fragment key={key}>
          {anchors}
          <div className="timeline__entry" style={{ marginTop }}>
            <span className="timeline__marker" aria-hidden />
            <Link href={episodeHref} className="timeline__card timeline__card--episode">
              <div className="timeline__year">{episodeData?.yearLabel ?? "Undated"}</div>
              <div className="timeline__title">{row.title}</div>
            </Link>
          </div>
        </Fragment>
      );
    });

    timelineContent = <div className="timeline">{timelineNodes}</div>;
  }

  const selectedEraLabel = ERA_OPTIONS.find((era) => era.id === selectedEra)?.label ?? "All Eras";

  return (
    <div className="timeline-shell">
      <div className="era-filter">
        <div className="era-filter__label">Browse by era</div>
        <div className="era-chips" role="toolbar" aria-label="Filter timeline by era">
          {ERA_OPTIONS.map((era) => (
            <button
              key={era.id}
              type="button"
              className={`era-chip${selectedEra === era.id ? " era-chip--active" : ""}`}
              onClick={() => handleEraChange(era.id)}
              aria-pressed={selectedEra === era.id}
            >
              {era.label}
            </button>
          ))}
        </div>
      </div>

      <section aria-live="polite" aria-label={`Timeline — ${selectedEraLabel}`}>
        {timelineContent}
      </section>

      {selectedEra === "all" && hasUndated ? renderUndatedSection("inline") : null}
    </div>
  );
}
