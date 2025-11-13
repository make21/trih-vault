import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { PublicEpisode, PublicSeries } from "@/types";

type SitemapEntry = {
  loc: string;
  lastmod?: string;
};

const PUBLIC_DIR = join(process.cwd(), "public");
const SITEMAP_PATH = join(PUBLIC_DIR, "sitemap.xml");
const ROBOTS_PATH = join(PUBLIC_DIR, "robots.txt");

const loadJson = <T>(relativePath: string): T => {
  const absolute = join(process.cwd(), relativePath);
  const raw = readFileSync(absolute, "utf8");
  return JSON.parse(raw) as T;
};

const entries = new Map<string, SitemapEntry>();
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.trihvault.com";
const normalisePath = (path: string): string => (path.startsWith("/") ? path : `/${path}`);
const buildUrl = (path: string): string => new URL(normalisePath(path), SITE_URL).toString();

const addEntry = (path: string, lastmod?: string | null) => {
  const loc = buildUrl(path);
  if (entries.has(loc)) {
    return;
  }
  const normalizedLastmod = lastmod ? new Date(lastmod).toISOString().split("T")[0] : undefined;
  entries.set(loc, { loc, lastmod: normalizedLastmod });
};

const staticPaths = ["/", "/about", "/privacy", "/terms"];
staticPaths.forEach((path) => addEntry(path));

const episodes = loadJson<PublicEpisode[]>(join("public", "episodes.json"));
episodes.forEach((episode) => {
  if (!episode.slug) {
    return;
  }
  addEntry(`/episode/${episode.slug}`, episode.publishedAt ?? null);
});

const series = loadJson<PublicSeries[]>(join("public", "series.json"));
series.forEach((seriesRecord) => {
  if (!seriesRecord.slug) {
    return;
  }
  addEntry(`/series/${seriesRecord.slug}`, (seriesRecord as unknown as { rssLastSeenAt?: string }).rssLastSeenAt ?? null);
});

const people = loadJson<Array<{ id: string }>>(join("data", "rules", "people.json"));
people.forEach((person) => {
  if (!person.id) return;
  addEntry(`/people/${encodeURIComponent(person.id)}`);
});

const places = loadJson<Array<{ id: string }>>(join("data", "rules", "places.json"));
places.forEach((place) => {
  if (!place.id) return;
  addEntry(`/places/${encodeURIComponent(place.id)}`);
});

const topics = loadJson<Array<{ slug: string }>>(join("data", "rules", "topics.json"));
topics.forEach((topic) => {
  if (!topic.slug) return;
  addEntry(`/topics/${encodeURIComponent(topic.slug)}`);
});

const sortedEntries = Array.from(entries.values()).sort((a, b) => a.loc.localeCompare(b.loc));

const xmlLines = sortedEntries.map((entry) => {
  const lines = [`  <url>`, `    <loc>${entry.loc}</loc>`];
  if (entry.lastmod) {
    lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
  }
  lines.push(`  </url>`);
  return lines.join("\n");
});

const sitemapContent = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...xmlLines,
  "</urlset>"
].join("\n");

writeFileSync(SITEMAP_PATH, `${sitemapContent}\n`, "utf8");

const robotsContent = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /review",
  "Disallow: /api",
  `Sitemap: ${buildUrl("/sitemap.xml")}`
].join("\n");

writeFileSync(ROBOTS_PATH, `${robotsContent}\n`, "utf8");

console.log("Generated sitemap and robots.txt");
