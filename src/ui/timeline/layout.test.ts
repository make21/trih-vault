import { describe, expect, it } from "vitest";
import {
  computeTimelineLayout,
  type TimelineRow
} from "./layout";

const makeRow = (overrides: Partial<TimelineRow>): TimelineRow => ({
  id: "row-id",
  title: "Row Title",
  yearFrom: null,
  yearTo: null,
  ...overrides
});

describe("computeTimelineLayout", () => {
  it("sorts rows chronologically and includes gap nodes when thresholds exceeded", () => {
    const rows: TimelineRow[] = [
      makeRow({ id: "rome", title: "Rome", yearFrom: -753 }),
      makeRow({ id: "middle-ages", title: "Middle Ages", yearFrom: 500 }),
      makeRow({ id: "stonehenge", title: "Stonehenge", yearFrom: -3000 })
    ];

    const { nodes, hasCollapsibleGaps } = computeTimelineLayout(rows, {}, {
      pixelsPerYear: 1,
      minGapPx: 20,
      maxGapPx: 100,
      collapsedGapPx: 40
    });

    expect(nodes.map((node) => node.id)).toEqual([
      "stonehenge",
      "stonehenge::rome",
      "rome",
      "rome::middle-ages",
      "middle-ages"
    ]);
    const gapNode = nodes.find((node) => node.kind === "gap");
    expect(gapNode).toMatchObject({
      kind: "gap",
      years: 2247,
      collapsedHeight: 40
    });
    expect(hasCollapsibleGaps).toBe(true);
  });

  it("clamps small or zero gaps to minGapPx without creating gap markers", () => {
    const rows: TimelineRow[] = [
      makeRow({ id: "caesar", title: "Caesar", yearFrom: -44 }),
      makeRow({ id: "cicero", title: "Cicero", yearFrom: -44 }),
      makeRow({ id: "augustus", title: "Augustus", yearFrom: -27 })
    ];

    const { nodes } = computeTimelineLayout(rows, {}, {
      pixelsPerYear: 2,
      minGapPx: 24,
      maxGapPx: 200
    });

    expect(nodes.filter((node) => node.kind === "gap")).toHaveLength(0);
    const caesar = nodes.find((node) => node.id === "caesar" && node.kind === "item");
    const cicero = nodes.find((node) => node.id === "cicero" && node.kind === "item");
    const augustus = nodes.find((node) => node.id === "augustus" && node.kind === "item");

    expect(caesar?.top).toBe(0);
    expect(cicero?.top).toBe(24);
    expect(augustus?.top).toBeGreaterThan(24);
  });

  it("honours expanded gaps by using full raw height", () => {
    const rows: TimelineRow[] = [
      makeRow({ id: "stonehenge", yearFrom: -3000 }),
      makeRow({ id: "renaissance", yearFrom: 1500 })
    ];

    const { nodes } = computeTimelineLayout(rows, {
      "stonehenge::renaissance": true
    }, {
      pixelsPerYear: 0.5,
      minGapPx: 32,
      maxGapPx: 120,
      collapsedGapPx: 48
    });

    const gapNode = nodes.find((node) => node.kind === "gap");
    expect(gapNode).toBeDefined();
    expect(gapNode?.height).toBeCloseTo(2250); // raw gap (4500 years * 0.5)
  });
});
