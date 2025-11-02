"use client";

import { Fragment, useMemo, useState } from "react";
import type { TimelineDisplayRow, TimelineSeriesRowData, TimelineEpisodeRowData, UndatedEpisode } from "./buildTimeline";
import { computeTimelineLayout } from "./layout";
import { GapMarker } from "@/components/GapMarker";

type TimelineProps = {
  rows: TimelineDisplayRow[];
  undatedEpisodes: UndatedEpisode[];
};

const PIXELS_PER_YEAR = 1.5;
const MIN_GAP_PX = 16;
const MAX_GAP_PX = 240;
const COLLAPSED_GAP_PX = 64;
const SAME_YEAR_GAP_PX = 28;

const getPeriodId = (yearValue: number | null): string | null => {
  if (yearValue === null || Number.isNaN(yearValue)) {
    return null;
  }
  if (yearValue <= -1000) return "prehistory";
  if (yearValue <= 476) return "antiquity";
  if (yearValue <= 800) return "late-antiquity";
  if (yearValue <= 1500) return "middle-ages";
  if (yearValue <= 1800) return "early-modern";
  if (yearValue <= 1900) return "c19";
  if (yearValue <= 2000) return "c20";
  return "c21";
};

export function Timeline(props: TimelineProps) {
  const { rows, undatedEpisodes } = props;
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());
  const [expandedGaps, setExpandedGaps] = useState<Record<string, boolean>>({});

  const layout = useMemo(
    () =>
      computeTimelineLayout(rows, expandedGaps, {
        pixelsPerYear: PIXELS_PER_YEAR,
        minGapPx: MIN_GAP_PX,
        maxGapPx: MAX_GAP_PX,
        collapsedGapPx: COLLAPSED_GAP_PX,
        sameYearGapPx: SAME_YEAR_GAP_PX
      }),
    [rows, expandedGaps]
  );

  const hasTimelineContent = layout.nodes.some((node) => node.kind === "item");
  const hasUndated = undatedEpisodes.length > 0;

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

  const toggleGap = (id: string) => {
    setExpandedGaps((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  let timelineContent: JSX.Element | null = <p>No timeline content with year data yet.</p>;

  if (hasTimelineContent) {
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

        return (
          <Fragment key={key}>
            {anchors}
            <div className="timeline__entry timeline__entry--series" style={{ marginTop }}>
              <span className="timeline__marker timeline__marker--series" aria-hidden />
              <div className="timeline__card timeline__card--series">
                <div className="timeline__year">{seriesData.yearLabel}</div>
                <button
                  type="button"
                  className="timeline__series-toggle"
                  onClick={() => toggleSeries(row.id)}
                  aria-expanded={isExpanded}
                >
                  <span className="timeline__title-group">
                    <span className="timeline__title">{row.title}</span>
                    <span className="timeline__meta timeline__meta--series">{partsLabel}</span>
                  </span>
                  <span className="timeline__series-toggle-icon">{isExpanded ? "−" : "+"}</span>
                </button>

                {isExpanded ? (
                  <ul className="timeline__series-list">
                    {seriesData.episodes.map((episode) => (
                      <li key={episode.id} className="timeline__series-episode">
                        <div className="timeline__series-episode-title">
                          {episode.title}
                          {episode.partLabel ? (
                            <span className="timeline__series-part">{episode.partLabel}</span>
                          ) : null}
                        </div>
                        {episode.yearLabel ? (
                          <div className="timeline__series-episode-year">{episode.yearLabel}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </Fragment>
        );
      }

      const episodeData = data as TimelineEpisodeRowData | undefined;

      return (
        <Fragment key={key}>
          {anchors}
          <div className="timeline__entry" style={{ marginTop }}>
            <span className="timeline__marker" aria-hidden />
            <div className="timeline__card">
              <div className="timeline__year">{episodeData?.yearLabel ?? "Undated"}</div>
              <div className="timeline__title">{row.title}</div>
            </div>
          </div>
        </Fragment>
      );
    });

    timelineContent = <div className="timeline">{timelineNodes}</div>;
  }

  return (
    <>
      <section>
        <h2>Timeline (alpha)</h2>
        {timelineContent}
      </section>

      {hasUndated ? (
        <section id="bucket-undated" className="undated-section">
          <h2>Undated Episodes</h2>
          <p>Items without a usable year range. We will revisit once we have a better strategy.</p>
          <ul className="undated-list">
            {undatedEpisodes.map((episode) => (
              <li key={episode.id} className="undated-item">
                <div className="undated-item__title">{episode.title}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
