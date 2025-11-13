"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { MINI_SEARCH_OPTIONS } from "./options";
import type { SearchFacets, SearchFilters, SearchResult, SearchStatus, SearchDocument } from "./types";

interface SearchIndexContextValue {
  status: SearchStatus;
  error: string | null;
  lastQuery: string;
  facets: SearchFacets;
  prime: () => Promise<void>;
  search: (query: string, filters?: SearchFilters) => Promise<SearchResult[]>;
  clearError: () => void;
}

const SearchIndexContext = createContext<SearchIndexContextValue | undefined>(undefined);

const MIN_QUERY_LENGTH = 2;
const NUMERIC_QUERY_REGEX = /^\d{4}$/;

const normalizeFilter = (value?: string | null): string | null =>
  value ? value.trim().toLowerCase() || null : null;

const matchesFilter = (result: SearchDocument, filters: SearchFilters | undefined): boolean => {
  if (!filters) {
    return true;
  }
  const personFilter = normalizeFilter(filters.person);
  const placeFilter = normalizeFilter(filters.place);
  const topicFilter = normalizeFilter(filters.topic);

  if (personFilter) {
    const personMatches = result.people?.some((person) => {
      const label = person.label.trim().toLowerCase();
      const id = person.id.trim().toLowerCase();
      return label === personFilter || id === personFilter;
    });
    if (!personMatches) {
      return false;
    }
  }

  if (placeFilter) {
    const placeMatches = result.places?.some((place) => {
      const label = place.label.trim().toLowerCase();
      const id = place.id.trim().toLowerCase();
      return label === placeFilter || id === placeFilter;
    });
    if (!placeMatches) {
      return false;
    }
  }

  if (topicFilter) {
    const topicMatches = result.topics?.some((topic) => {
      const label = topic.label.trim().toLowerCase();
      const id = topic.id.trim().toLowerCase();
      return label === topicFilter || id === topicFilter;
    });
    if (!topicMatches) {
      return false;
    }
  }

  return true;
};

const fetchIndexJson = async (): Promise<string> => {
  const response = await fetch("/search-index.json");
  if (!response.ok) {
    throw new Error(`Failed to load search-index.json (HTTP ${response.status})`);
  }
  return response.text();
};

const fetchMetadata = async (): Promise<SearchFacets> => {
  const response = await fetch("/search-index.meta.json");
  if (!response.ok) {
    throw new Error(`Failed to load search-index.meta.json (HTTP ${response.status})`);
  }
  const raw = await response.json();
  return {
    people: raw.facets?.people ?? [],
    places: raw.facets?.places ?? [],
    topics: raw.facets?.topics ?? []
  };
};

const hydrateIndex = async (): Promise<import("minisearch").default<SearchDocument>> => {
  const [MiniSearchModule, indexPayload] = await Promise.all([
    import("minisearch"),
    fetchIndexJson()
  ]);
  const MiniSearch = MiniSearchModule.default;
  return MiniSearch.loadJSON(indexPayload, MINI_SEARCH_OPTIONS);
};

export function SearchIndexProvider({ children }: { children: ReactNode }): JSX.Element {
  const indexRef = useRef<import("minisearch").default<SearchDocument> | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [facets, setFacets] = useState<SearchFacets>({ people: [], places: [], topics: [] });

  const prime = useCallback(async () => {
    if (indexRef.current) {
      return;
    }
    if (!loadPromiseRef.current) {
      setStatus((prev) => (prev === "ready" ? prev : "loading"));
      loadPromiseRef.current = Promise.all([hydrateIndex(), fetchMetadata()])
        .then(([index, facetData]) => {
          indexRef.current = index;
          setFacets(facetData);
          setStatus("ready");
          setError(null);
        })
        .catch((err) => {
          indexRef.current = null;
          setStatus("error");
          setError(err instanceof Error ? err.message : "Unable to load search data");
          throw err;
        })
        .finally(() => {
          loadPromiseRef.current = null;
        });
    }
    return loadPromiseRef.current;
  }, []);

  const search = useCallback(
    async (rawQuery: string, filters?: SearchFilters): Promise<SearchResult[]> => {
      const query = rawQuery.trim();
      setLastQuery(query);
      if (query.length < MIN_QUERY_LENGTH) {
        return [];
      }
      await prime();
      const miniSearch = indexRef.current;
      if (!miniSearch) {
        return [];
      }

      const searchOptions =
        NUMERIC_QUERY_REGEX.test(query) && query.length === 4
          ? {
              boost: { title: 10, keywordsText: 4, description: 1 }
            }
          : undefined;

      const hits = miniSearch.search(query, searchOptions);
      const filtered = hits.filter((hit) => matchesFilter(hit as SearchDocument, filters));
      return filtered.map((hit, index) => ({
        ...(hit as SearchResult),
        rank: index + 1
      }));
    },
    [prime]
  );

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    (): SearchIndexContextValue => ({
      status,
      error,
      lastQuery,
      facets,
      prime,
      search,
      clearError
    }),
    [status, error, lastQuery, prime, search, clearError, facets]
  );

  return <SearchIndexContext.Provider value={value}>{children}</SearchIndexContext.Provider>;
}

export const useSearchIndex = (): SearchIndexContextValue => {
  const context = useContext(SearchIndexContext);
  if (!context) {
    throw new Error("useSearchIndex must be used within a SearchIndexProvider");
  }
  return context;
};
