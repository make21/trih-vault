'use client';

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Episode } from '@/lib/types';
import FilterControls from './FilterControls';

interface EpisodeListProps {
  episodes: Episode[];
}

const normalizeString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
};

const getEpisodeYear = (episode: Episode): number | null => {
  const date = new Date(episode.pubDate);
  const year = date.getFullYear();
  return Number.isNaN(year) ? null : year;
};

const formatEpisodeDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

interface EpisodeGroup {
  year: number | null;
  episodes: Episode[];
}

export default function EpisodeList({ episodes }: EpisodeListProps) {
  const [search, setSearch] = useState('');
  const [selectedEras, setSelectedEras] = useState<Set<string>>(new Set());
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const currentYear = new Date().getFullYear();
  const [yearRange, setYearRange] = useState<[number, number]>([
    currentYear,
    currentYear,
  ]);
  const [openYears, setOpenYears] = useState<Set<number>>(new Set());
  const [jumpSelection, setJumpSelection] = useState('');

  const allEras = useMemo(() => {
    const eras = new Set<string>();
    episodes.forEach((ep) => ep.eras.forEach((era) => eras.add(era)));
    return Array.from(eras).sort((a, b) => a.localeCompare(b));
  }, [episodes]);

  const allRegions = useMemo(() => {
    const regions = new Set<string>();
    episodes.forEach((ep) => ep.regions.forEach((region) => regions.add(region)));
    return Array.from(regions).sort((a, b) => a.localeCompare(b));
  }, [episodes]);

  const eraCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    episodes.forEach((ep) => {
      ep.eras.forEach((era) => {
        counts[era] = (counts[era] || 0) + 1;
      });
    });
    return counts;
  }, [episodes]);

  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    episodes.forEach((ep) => {
      ep.regions.forEach((region) => {
        counts[region] = (counts[region] || 0) + 1;
      });
    });
    return counts;
  }, [episodes]);

  const allYears = useMemo(() => {
    const values = episodes
      .map((episode) => getEpisodeYear(episode))
      .filter((year): year is number => year !== null);
    const unique = new Set(values);
    return Array.from(unique).sort((a, b) => b - a);
  }, [episodes]);

  const minYear = useMemo(() => {
    if (allYears.length === 0) {
      return currentYear;
    }
    return allYears.reduce((min, year) => Math.min(min, year), allYears[0]);
  }, [allYears, currentYear]);

  const maxYear = useMemo(() => {
    if (allYears.length === 0) {
      return currentYear;
    }
    return allYears.reduce((max, year) => Math.max(max, year), allYears[0]);
  }, [allYears, currentYear]);

  useEffect(() => {
    setYearRange([minYear, maxYear]);
  }, [minYear, maxYear]);

  useEffect(() => {
    if (openYears.size === 0 && allYears.length > 0) {
      const defaults = allYears.slice(0, Math.min(3, allYears.length));
      setOpenYears(new Set(defaults));
    }
  }, [allYears, openYears.size]);

  const toggleEra = useCallback((era: string) => {
    setSelectedEras((prev) => {
      const next = new Set(prev);
      if (next.has(era)) {
        next.delete(era);
      } else {
        next.add(era);
      }
      return next;
    });
  }, []);

  const toggleRegion = useCallback((region: string) => {
    setSelectedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(region)) {
        next.delete(region);
      } else {
        next.add(region);
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setSelectedEras(new Set());
    setSelectedRegions(new Set());
    setYearRange([minYear, maxYear]);
    setJumpSelection('');
  }, [minYear, maxYear]);

  const filteredEpisodes = useMemo(() => {
    const [minSelected, maxSelected] = yearRange;
    const searchLower = search.toLowerCase();

    return episodes.filter((episode) => {
      if (searchLower) {
        const valuesToSearch = [
          normalizeString(episode.title_feed),
          normalizeString(episode.title_sheet),
          normalizeString(episode.description),
        ];

        const matchesSearch = valuesToSearch.some((value) =>
          value.toLowerCase().includes(searchLower)
        );

        if (!matchesSearch) {
          return false;
        }
      }

      if (selectedEras.size > 0) {
        const matchesEra = episode.eras.some((era) => selectedEras.has(era));
        if (!matchesEra) {
          return false;
        }
      }

      if (selectedRegions.size > 0) {
        const matchesRegion = episode.regions.some((region) =>
          selectedRegions.has(region)
        );
        if (!matchesRegion) {
          return false;
        }
      }

      const year = getEpisodeYear(episode);
      if (year !== null && (year < minSelected || year > maxSelected)) {
        return false;
      }

      return true;
    });
  }, [episodes, search, selectedEras, selectedRegions, yearRange]);

  const groupedEpisodes = useMemo<EpisodeGroup[]>(() => {
    const groups = new Map<number, Episode[]>();
    const unknown: Episode[] = [];

    filteredEpisodes.forEach((episode) => {
      const year = getEpisodeYear(episode);
      if (year === null) {
        unknown.push(episode);
        return;
      }

      const existing = groups.get(year) ?? [];
      existing.push(episode);
      groups.set(year, existing);
    });

    const sortedGroups: EpisodeGroup[] = Array.from(groups.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, eps]) => ({
        year,
        episodes: eps
          .slice()
          .sort(
            (a, b) =>
              new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
          ),
      }));

    if (unknown.length > 0) {
      sortedGroups.push({
        year: null,
        episodes: unknown.slice().sort((a, b) => b.episode - a.episode),
      });
    }

    return sortedGroups;
  }, [filteredEpisodes]);

  const toggleYearGroup = useCallback((year: number) => {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  }, []);

  const handleJumpToYear = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const { value } = event.target;
      setJumpSelection(value);
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        setOpenYears((prev) => {
          if (prev.has(parsed)) {
            return prev;
          }
          const next = new Set(prev);
          next.add(parsed);
          return next;
        });

        const element = document.getElementById(`year-${parsed}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      // Reset selection to placeholder after jump
      requestAnimationFrame(() => setJumpSelection(''));
    },
    []
  );

  const totalEpisodes = episodes.length;
  const resultCount = filteredEpisodes.length;

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <aside className="lg:w-80 flex-shrink-0">
        <FilterControls
          search={search}
          setSearch={setSearch}
          selectedEras={selectedEras}
          selectedRegions={selectedRegions}
          toggleEra={toggleEra}
          toggleRegion={toggleRegion}
          clearFilters={clearFilters}
          allEras={allEras}
          allRegions={allRegions}
          eraCounts={eraCounts}
          regionCounts={regionCounts}
          yearRange={yearRange}
          yearBounds={[minYear, maxYear]}
          setYearRange={setYearRange}
        />
      </aside>

      <section className="flex-1">
        <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            Showing {resultCount} of {totalEpisodes} episodes
          </div>
          <div className="flex items-center gap-2">
            <label
              htmlFor="jump-to-year"
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Jump to Year
            </label>
            <select
              id="jump-to-year"
              value={jumpSelection}
              onChange={handleJumpToYear}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select...</option>
              {allYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        {resultCount === 0 ? (
          <div className="bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-12 text-center text-slate-600 dark:text-slate-400">
            No episodes match your filters. Try broadening your search.
          </div>
        ) : (
          <div className="space-y-6">
            {groupedEpisodes.map((group) => {
              if (group.year === null) {
                return (
                  <section
                    key="unknown"
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden"
                  >
                    <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
                      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                        Unknown year
                      </h2>
                    </div>
                    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                    {group.episodes.map((episode) => {
                      const displayTitle =
                        episode.title_feed || episode.title_sheet || 'Untitled episode';
                        return (
                          <li key={episode.slug}>
                            <Link
                              href={`/episode/${episode.slug}`}
                              className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                            >
                              <span className="text-sm font-semibold text-blue-600 dark:text-blue-300 w-14">
                                #{episode.episode}
                              </span>
                              <span className="flex-1 text-slate-800 dark:text-slate-100 font-medium">
                                {displayTitle}
                              </span>
                              <span className="text-sm text-slate-500 dark:text-slate-400">
                                {formatEpisodeDate(episode.pubDate)}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              }

              const isOpen = openYears.has(group.year);

              return (
                <section
                  key={group.year}
                  id={`year-${group.year}`}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleYearGroup(group.year!)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                  >
                    <div>
                      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                        {group.year}
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {group.episodes.length}{' '}
                        {group.episodes.length === 1 ? 'episode' : 'episodes'}
                      </p>
                    </div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {isOpen ? '−' : '+'}
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                    {group.episodes.map((episode) => {
                      const displayTitle =
                        episode.title_feed || episode.title_sheet || 'Untitled episode';
                        return (
                          <li key={episode.slug}>
                            <Link
                              href={`/episode/${episode.slug}`}
                              className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                            >
                              <span className="text-sm font-semibold text-blue-600 dark:text-blue-300 w-14">
                                #{episode.episode}
                              </span>
                              <span className="flex-1 text-slate-800 dark:text-slate-100 font-medium">
                                {displayTitle}
                              </span>
                              <span className="text-sm text-slate-500 dark:text-slate-400">
                                {formatEpisodeDate(episode.pubDate)}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
