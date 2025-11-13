import { type Options as MiniSearchOptions } from "minisearch";

import type { SearchDocument } from "./types";

export const MINI_SEARCH_OPTIONS: MiniSearchOptions<SearchDocument> = {
  idField: "id",
  fields: ["title", "summary", "keywordsText", "description"],
  storeFields: [
    "type",
    "entityType",
    "slug",
    "title",
    "summary",
    "yearRange",
    "badge",
    "seriesSlug",
    "seriesTitle",
    "people",
    "places",
    "topics",
    "publishedAt"
  ],
  searchOptions: {
    boost: { title: 10, summary: 4, keywordsText: 3, description: 1 },
    fuzzy: 0.15,
    prefix: true
  },
  processTerm: (term) =>
    term
      ?.toLowerCase()
      ?.normalize("NFD")
      ?.replace(/\p{Diacritic}/gu, "") ?? null
};
