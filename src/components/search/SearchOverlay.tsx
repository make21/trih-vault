"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent
} from "react";
import FocusTrap from "focus-trap-react";

import { logFilterChip, logSearchError, logSearchResultClick, logSearchSubmit } from "@/lib/search/events";
import { useSearchIndex } from "@/lib/search/useSearchIndex";
import type { SearchEntityRef, SearchFilters, SearchResult, FacetSuggestion } from "@/lib/search/types";

import { useSearchOverlay } from "./SearchProvider";
import styles from "./SearchOverlay.module.css";

interface FacetOption {
  id: string;
  label: string;
  count: number;
}

type FilterType = "person" | "place" | "topic";
interface ActiveFilterState {
  type: FilterType;
  slug: string;
  label: string;
}

const MAX_FACET_OPTIONS = 6;

const getHrefForResult = (result: SearchResult): string => {
  if (result.type === "episode") {
    return `/episode/${result.slug}`;
  }
  if (result.type === "series") {
    return `/series/${result.slug}`;
  }
  return `/${result.slug}`;
};

const buildFacetOptions = (results: SearchResult[], field: keyof Pick<SearchResult, "people" | "places" | "topics">): FacetOption[] => {
  const counts = new Map<string, FacetOption>();
  results.forEach((result) => {
    const refs = (result[field] as SearchEntityRef[] | undefined) ?? [];
    refs.forEach((ref) => {
      const key = ref.id ?? ref.label;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { id: ref.id, label: ref.label, count: 1 });
      }
    });
  });
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, MAX_FACET_OPTIONS);
};

const clampFacetList = (options: FacetSuggestion[]): FacetOption[] => {
  const deduped: FacetOption[] = [];
  const seen = new Set<string>();
  options.forEach((option) => {
    if (!option?.id || seen.has(option.id)) {
      return;
    }
    seen.add(option.id);
    deduped.push({ id: option.id, label: option.label, count: option.count });
  });
  return deduped.slice(0, MAX_FACET_OPTIONS);
};

const buildCuratedDefaults = (facets: { people: FacetSuggestion[]; places: FacetSuggestion[]; topics: FacetSuggestion[] }) => {
  const curatedPeople = clampFacetList(facets.people);

  const placesWithoutUk = facets.places.filter((option) => option.id !== "united-kingdom");
  const germany = facets.places.find((option) => option.id === "germany");
  if (germany && !placesWithoutUk.some((option) => option.id === germany.id)) {
    placesWithoutUk.push(germany);
  }
  const curatedPlaces = clampFacetList(placesWithoutUk);

  const topicsWithoutColdWar = facets.topics.filter((option) => option.id !== "cold-war");
  const frenchRevolution = facets.topics.find((option) => option.id === "french-revolution");
  if (frenchRevolution && !topicsWithoutColdWar.some((option) => option.id === frenchRevolution.id)) {
    topicsWithoutColdWar.push(frenchRevolution);
  }
  const curatedTopics = clampFacetList(topicsWithoutColdWar);

  return {
    people: curatedPeople,
    places: curatedPlaces,
    topics: curatedTopics
  };
};

export function SearchOverlay(): JSX.Element | null {
  const { isOpen, close } = useSearchOverlay();
  const { status, error, clearError, prime, search, facets } = useSearchIndex();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({ person: null, place: null, topic: null });
  const [activeFilter, setActiveFilter] = useState<ActiveFilterState | null>(null);
  const [isSearching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setFilters({ person: null, place: null, topic: null });
      setActiveFilter(null);
      lastFocusedElementRef.current?.focus();
      return;
    }

    lastFocusedElementRef.current = document.activeElement as HTMLElement;
    prime().catch(() => {
      // errors are handled inside useSearchIndex / GA logging when search attempts run
    });
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, prime]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSearching(true);
    let cancelled = false;
    const handle = setTimeout(() => {
      search(query, filters)
        .then((hits) => {
          if (!cancelled) {
            setResults(hits);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            logSearchError({ query, filters, message: err instanceof Error ? err.message : String(err) });
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearching(false);
          }
        });
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [isOpen, query, filters, search]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const focusable = container.querySelectorAll<HTMLElement>(
        "button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])"
      );
      if (focusable.length === 0) {
        return;
      }
      const focusArray = Array.from(focusable);
      const first = focusArray[0];
      const last = focusArray[focusArray.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, close]);

  const facetOptions = useMemo(
    () => ({
      people: buildFacetOptions(results, "people"),
      places: buildFacetOptions(results, "places"),
      topics: buildFacetOptions(results, "topics")
    }),
    [results]
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      logSearchSubmit({ query, resultCount: results.length, filters });
    },
    [query, results.length, filters]
  );

  const resetFilters = useCallback(() => {
    setFilters({ person: null, place: null, topic: null });
  }, []);

  const clearActiveFilter = useCallback(() => {
    if (activeFilter) {
      logFilterChip({ chipType: activeFilter.type, chipSlug: activeFilter.slug, state: "off" });
    }
    setActiveFilter(null);
    resetFilters();
  }, [activeFilter, resetFilters]);

  const handleFilterToggle = useCallback(
    (type: FilterType, option: FacetOption, opts?: { prefillQuery?: boolean }) => {
      const isSame = activeFilter?.type === type && activeFilter.slug === option.id;
      if (isSame) {
        clearActiveFilter();
        return;
      }

      if (activeFilter) {
        clearActiveFilter();
      } else {
        resetFilters();
      }

      const nextFilters: SearchFilters = { person: null, place: null, topic: null };
      nextFilters[type] = option.id;
      setFilters(nextFilters);
      logFilterChip({ chipType: type, chipSlug: option.id, state: "on" });
      setActiveFilter({
        type,
        slug: option.id,
        label: option.label
      });

      if (opts?.prefillQuery) {
        setQuery(option.label);
      }
    },
    [activeFilter, clearActiveFilter, resetFilters]
  );

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  const handleClearQuery = () => {
    setQuery("");
  };

  const handleResultClick = (result: SearchResult) => {
    const href = getHrefForResult(result);
    logSearchResultClick({ query, rank: result.rank ?? 0, type: result.type, slug: result.slug, filters });
    close();
    router.push(href);
  };

  const curatedDefaults = useMemo(() => buildCuratedDefaults(facets), [facets]);

  if (!isOpen) {
    return null;
  }

  const defaultFacetButtons = (
    <div className={styles.chipsRow}>
      {curatedDefaults.people.map((option) => (
        <button
          key={`default-person-${option.id}`}
          type="button"
          className={`${styles.chip} ${
            activeFilter?.type === "person" && activeFilter.slug === option.id ? styles.chipActive : ""
          }`}
          onClick={() => handleFilterToggle("person", option, { prefillQuery: true })}
        >
          👤 {option.label}
        </button>
      ))}
      {curatedDefaults.places.map((option) => (
        <button
          key={`default-place-${option.id}`}
          type="button"
          className={`${styles.chip} ${
            activeFilter?.type === "place" && activeFilter.slug === option.id ? styles.chipActive : ""
          }`}
          onClick={() => handleFilterToggle("place", option, { prefillQuery: true })}
        >
          📍 {option.label}
        </button>
      ))}
      {curatedDefaults.topics.map((option) => (
        <button
          key={`default-topic-${option.id}`}
          type="button"
          className={`${styles.chip} ${
            activeFilter?.type === "topic" && activeFilter.slug === option.id ? styles.chipActive : ""
          }`}
          onClick={() => handleFilterToggle("topic", option, { prefillQuery: true })}
        >
          🗂 {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.panel} ref={containerRef}>
        <button type="button" className={styles.closeButton} onClick={close} aria-label="Close search overlay">
          ×
        </button>
        <form className={styles.header} onSubmit={handleSubmit}>
          <div className={styles.searchInput}>
            <span role="img" aria-hidden="true">
              🔍
            </span>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={handleInputChange}
              placeholder="Search episodes, series, people, places, topics…"
              aria-label="Search episodes, series, people, places, topics"
            />
            {query ? (
              <button type="button" onClick={handleClearQuery}>
                Clear
              </button>
            ) : null}
          </div>
          {(facetOptions.people.length > 0 ||
            facetOptions.places.length > 0 ||
            facetOptions.topics.length > 0) ? (
            <div className={styles.chipsRow}>
              {facetOptions.people.map((option) => (
                <button
                  key={`person-${option.id}`}
                  type="button"
                  className={`${styles.chip} ${
                    activeFilter?.type === "person" && activeFilter.slug === option.id ? styles.chipActive : ""
                  }`}
                  onClick={() => handleFilterToggle("person", option, { prefillQuery: true })}
                >
                  👤 {option.label}
                </button>
              ))}
              {facetOptions.places.map((option) => (
                <button
                  key={`place-${option.id}`}
                  type="button"
                  className={`${styles.chip} ${
                    activeFilter?.type === "place" && activeFilter.slug === option.id ? styles.chipActive : ""
                  }`}
                  onClick={() => handleFilterToggle("place", option, { prefillQuery: true })}
                >
                  📍 {option.label}
                </button>
              ))}
              {facetOptions.topics.map((option) => (
                <button
                  key={`topic-${option.id}`}
                  type="button"
                  className={`${styles.chip} ${
                    activeFilter?.type === "topic" && activeFilter.slug === option.id ? styles.chipActive : ""
                  }`}
                  onClick={() => handleFilterToggle("topic", option, { prefillQuery: true })}
                >
                  🗂 {option.label}
                </button>
              ))}
            </div>
          ) : (
            defaultFacetButtons
          )}
          <div className={styles.headerActions}>
            <button type="button" className={styles.closePill} onClick={close} aria-label="Close search overlay">
              × Close
            </button>
          </div>
        </form>

        <div className={styles.content}>
          {status === "loading" && results.length === 0 && !error ? (
            <div className={styles.emptyState}>Preparing search index…</div>
          ) : null}

          {error ? (
            <div className={styles.emptyState}>
              <p>{error}</p>
              <button type="button" onClick={clearError}>
                Try again
              </button>
            </div>
          ) : null}

          {!error && query.length < 2 ? (
            <div className={styles.emptyState}>Type at least two characters or tap a chip to search the archive.</div>
          ) : null}

          {activeFilter ? (
            <div className={styles.activeFilter}>
              <span>Filtered by {activeFilter.label}</span>
              <button type="button" onClick={clearActiveFilter}>
                Clear filter
              </button>
            </div>
          ) : null}

          {!error && query.length >= 2 && results.length === 0 && !isSearching ? (
            <div className={styles.emptyState}>
              No matches yet. Try another keyword{activeFilter ? " or clear the filter" : ""}.
            </div>
          ) : null}

          {results.length > 0 ? (
            <ul className={styles.resultsList} role="listbox">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    className={styles.resultRow}
                    onClick={() => handleResultClick(result)}
                    aria-label={`${result.title} — ${result.type}`}
                  >
                    <div className={styles.resultMeta}>
                      <span className={styles.badge}>{result.type}</span>
                      {result.entityType ? <span className={styles.pill}>{result.entityType}</span> : null}
                      {result.yearRange ? <span>{result.yearRange}</span> : null}
                      {result.seriesTitle ? <span>{result.seriesTitle}</span> : null}
                      {result.badge ? <span className={styles.pill}>{result.badge}</span> : null}
                    </div>
                    <div className={styles.resultTitle}>{result.title}</div>
                    <p>{result.summary}</p>
                    <div className={styles.resultMeta}>
                      {(result.people ?? []).slice(0, 2).map((person) => (
                        <span key={`person-pill-${person.id}`} className={styles.pill}>
                          {person.label}
                        </span>
                      ))}
                      {(result.places ?? []).slice(0, 2).map((place) => (
                        <span key={`place-pill-${place.id}`} className={styles.pill}>
                          {place.label}
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {isSearching ? <div className={styles.emptyState}>Searching…</div> : null}
        </div>
      </div>
    </div>
  );
}

export default SearchOverlay;
