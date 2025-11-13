"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import FocusTrap from "focus-trap-react";

import { logFilterChip, logSearchError, logSearchResultClick, logSearchSubmit } from "@/lib/search/events";
import { useSearchIndex } from "@/lib/search/useSearchIndex";
import type { SearchEntityRef, SearchFilters, SearchResult } from "@/lib/search/types";

import { useSearchOverlay } from "./SearchProvider";
import styles from "./SearchOverlay.module.css";

interface FacetOption {
  id: string;
  label: string;
  count: number;
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

export function SearchOverlay(): JSX.Element | null {
  const { isOpen, close } = useSearchOverlay();
  const { status, error, clearError, prime, search, facets } = useSearchIndex();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({ person: null, place: null, topic: null });
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

  const handleFilterToggle = useCallback(
    (type: "person" | "place" | "topic", slug: string) => {
      setFilters((prev) => {
        const nextValue = prev[type] === slug ? null : slug;
        logFilterChip({ chipType: type, chipSlug: slug, state: nextValue ? "on" : "off" });
        return {
          ...prev,
          [type]: nextValue
        };
      });
    },
    []
  );

  const handleResultClick = (result: SearchResult) => {
    const href = getHrefForResult(result);
    logSearchResultClick({ query, rank: result.rank ?? 0, type: result.type, slug: result.slug, filters });
    close();
    router.push(href);
  };

  if (!isOpen) {
    return null;
  }

  const defaultFacetButtons = (
    <div className={styles.chipsRow}>
      {facets.people.slice(0, 6).map((option) => (
        <button
          key={`default-person-${option.id}`}
          type="button"
          className={`${styles.chip} ${filters.person === option.id ? styles.chipActive : ""}`}
          onClick={() => handleFilterToggle("person", option.id)}
        >
          👤 {option.label}
        </button>
      ))}
      {facets.places.slice(0, 6).map((option) => (
        <button
          key={`default-place-${option.id}`}
          type="button"
          className={`${styles.chip} ${filters.place === option.id ? styles.chipActive : ""}`}
          onClick={() => handleFilterToggle("place", option.id)}
        >
          📍 {option.label}
        </button>
      ))}
      {facets.topics.slice(0, 6).map((option) => (
        <button
          key={`default-topic-${option.id}`}
          type="button"
          className={`${styles.chip} ${filters.topic === option.id ? styles.chipActive : ""}`}
          onClick={() => handleFilterToggle("topic", option.id)}
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
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search episodes, series, people, places, topics…"
              aria-label="Search episodes, series, people, places, topics"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")}>
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
                  className={`${styles.chip} ${filters.person === option.id ? styles.chipActive : ""}`}
                  onClick={() => handleFilterToggle("person", option.id)}
                >
                  👤 {option.label}
                </button>
              ))}
              {facetOptions.places.map((option) => (
                <button
                  key={`place-${option.id}`}
                  type="button"
                  className={`${styles.chip} ${filters.place === option.id ? styles.chipActive : ""}`}
                  onClick={() => handleFilterToggle("place", option.id)}
                >
                  📍 {option.label}
                </button>
              ))}
              {facetOptions.topics.map((option) => (
                <button
                  key={`topic-${option.id}`}
                  type="button"
                  className={`${styles.chip} ${filters.topic === option.id ? styles.chipActive : ""}`}
                  onClick={() => handleFilterToggle("topic", option.id)}
                >
                  🗂 {option.label}
                </button>
              ))}
            </div>
          ) : (
            defaultFacetButtons
          )}
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
            <div className={styles.emptyState}>Type at least two characters to search the archive.</div>
          ) : null}

          {!error && query.length >= 2 && results.length === 0 && !isSearching ? (
            <div className={styles.emptyState}>No matches yet. Try another keyword or remove filters.</div>
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
