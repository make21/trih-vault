export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function cleanTitleStem(stem: string): string {
  return stem
    .replace(/[\s\-:–—]+$/g, "")
    .replace(/^[-:–—\s]+/g, "")
    .trim();
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  const diff = Math.abs(a.getTime() - b.getTime());
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

export function uniqueSorted<T>(values: T[]): T[] {
  return Array.from(new Set(values)).sort();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function average(values: number[]): number | null {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

export function sortEpisodesByNumber<T extends { episode: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.episode - b.episode);
}

export function toKebabCase(value: string): string {
  return slugify(value);
}

export function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

export function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((segment) => {
      if (!segment) return segment;
      const lower = segment.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ")
    .trim();
}
