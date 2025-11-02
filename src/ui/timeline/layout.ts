export type TimelineRow<Data = unknown> = {
  id: string;
  title: string;
  yearFrom: number | null;
  yearTo?: number | null;
  data?: Data;
};

export type TimelineItemNode<Data = unknown> = {
  kind: "item";
  id: string;
  top: number;
  row: TimelineRow<Data>;
};

export type TimelineGapNode = {
  kind: "gap";
  id: string;
  years: number;
  top: number;
  height: number;
  rawHeight: number;
  collapsedHeight: number;
};

export type TimelineNode<Data = unknown> = TimelineItemNode<Data> | TimelineGapNode;

export type ComputeTimelineLayoutOptions = {
  pixelsPerYear?: number;
  minGapPx?: number;
  maxGapPx?: number;
  collapsedGapPx?: number;
  sameYearGapPx?: number;
};

export type ComputeTimelineLayoutResult<Data = unknown> = {
  nodes: TimelineNode<Data>[];
  totalHeight: number;
  hasCollapsibleGaps: boolean;
};

const DEFAULT_PIXELS_PER_YEAR = 0.25;
const DEFAULT_MIN_GAP = 12;
const DEFAULT_MAX_GAP = 200;
const DEFAULT_BASE_COLLAPSED_GAP = 32;
const DEFAULT_SAME_YEAR_GAP = 24;
const BOTTOM_PADDING = 120;

const byYear = (row: TimelineRow): number =>
  row.yearFrom ?? row.yearTo ?? Number.POSITIVE_INFINITY;

const resolveYear = (row: TimelineRow): number => {
  const candidates = [row.yearFrom, row.yearTo].filter(
    (value): value is number => typeof value === "number"
  );
  if (candidates.length === 0) {
    return Number.NaN;
  }
  return candidates[0];
};

export function computeTimelineLayout<Data = unknown>(
  rows: TimelineRow<Data>[],
  expandedGaps: Record<string, boolean>,
  options: ComputeTimelineLayoutOptions = {}
): ComputeTimelineLayoutResult<Data> {
  const pixelsPerYear = options.pixelsPerYear ?? DEFAULT_PIXELS_PER_YEAR;
  const minGapPx = options.minGapPx ?? DEFAULT_MIN_GAP;
  const maxGapPx = options.maxGapPx ?? DEFAULT_MAX_GAP;
  const collapsedGapPxBase = options.collapsedGapPx ?? DEFAULT_BASE_COLLAPSED_GAP;
  const collapsedGapPx = Math.max(minGapPx, collapsedGapPxBase);
  const sameYearGapPx = options.sameYearGapPx ?? DEFAULT_SAME_YEAR_GAP;

  const filtered = rows
    .filter((row) => row.yearFrom != null || row.yearTo != null)
    .slice()
    .sort((a, b) => byYear(a) - byYear(b));

  const nodes: TimelineNode<Data>[] = [];
  let cursor = 0;
  let hasCollapsibleGap = false;

  for (let index = 0; index < filtered.length; index += 1) {
    const current = filtered[index]!;

    if (index > 0) {
      const previous = filtered[index - 1]!;
      const prevYear = resolveYear(previous);
      const currYear = resolveYear(current);

      if (!Number.isNaN(prevYear) && !Number.isNaN(currYear)) {
        const deltaYears = Math.abs(currYear - prevYear);
        const rawGapPx = deltaYears * pixelsPerYear;

        if (deltaYears === 0) {
          cursor += sameYearGapPx;
        } else if (rawGapPx > maxGapPx) {
          const gapId = `${previous.id}::${current.id}`;
          const expanded = !!expandedGaps[gapId];
          const height = expanded ? rawGapPx : collapsedGapPx;

          nodes.push({
            kind: "gap",
            id: gapId,
            years: deltaYears,
            top: cursor,
            height,
            rawHeight: rawGapPx,
            collapsedHeight: collapsedGapPx
          });

          cursor += height;
          hasCollapsibleGap = true;
        } else {
          const gapHeight = Math.max(minGapPx, rawGapPx);
          cursor += gapHeight;
        }
      } else {
        cursor += minGapPx;
      }
    }

    nodes.push({
      kind: "item",
      id: current.id,
      top: cursor,
      row: current
    });
  }

  const totalHeight = nodes.length > 0 ? cursor + BOTTOM_PADDING : 0;

  return {
    nodes,
    totalHeight,
    hasCollapsibleGaps: hasCollapsibleGap
  };
}
