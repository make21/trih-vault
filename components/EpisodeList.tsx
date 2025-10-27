'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Episode } from '@/lib/types';
import EpisodeCard from './EpisodeCard';
import FilterControls from './FilterControls';

interface EpisodeListProps {
  episodes: Episode[];
}

export default function EpisodeList({ episodes }: EpisodeListProps) {
  const [search, setSearch] = useState('');
  const [selectedEras, setSelectedEras] = useState<Set<string>>(new Set());
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(
    new Set()
  );
  const [sortBy, setSortBy] = useState('newest');

  const allEras = useMemo(() => {
    const eras = new Set<string>();
    episodes.forEach((ep) => ep.eras.forEach((era) => eras.add(era)));
    return Array.from(eras).sort();
  }, [episodes]);

  const allRegions = useMemo(() => {
    const regions = new Set<string>();
    episodes.forEach((ep) => ep.regions.forEach((region) => regions.add(region)));
    return Array.from(regions).sort();
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

  const filteredEpisodes = useMemo(() => {
    let filtered = episodes;

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (ep) =>
          ep.title_feed.toLowerCase().includes(searchLower) ||
          ep.title_sheet?.toLowerCase().includes(searchLower) ||
          ep.description?.toLowerCase().includes(searchLower)
      );
    }

    if (selectedEras.size > 0) {
      filtered = filtered.filter((ep) =>
        ep.eras.some((era) => selectedEras.has(era))
      );
    }

    if (selectedRegions.size > 0) {
      filtered = filtered.filter((ep) =>
        ep.regions.some((region) => selectedRegions.has(region))
      );
    }

    const sorted = [...filtered];
    if (sortBy === 'newest') {
      sorted.sort((a, b) => b.episode - a.episode);
    } else if (sortBy === 'oldest') {
      sorted.sort((a, b) => a.episode - b.episode);
    } else if (sortBy === 'alphabetical') {
      sorted.sort((a, b) =>
        (a.title_sheet || a.title_feed).localeCompare(
          b.title_sheet || b.title_feed
        )
      );
    }

    return sorted;
  }, [episodes, search, selectedEras, selectedRegions, sortBy]);

  const toggleEra = (era: string) => {
    const newSet = new Set(selectedEras);
    if (newSet.has(era)) {
      newSet.delete(era);
    } else {
      newSet.add(era);
    }
    setSelectedEras(newSet);
  };

  const toggleRegion = (region: string) => {
    const newSet = new Set(selectedRegions);
    if (newSet.has(region)) {
      newSet.delete(region);
    } else {
      newSet.add(region);
    }
    setSelectedRegions(newSet);
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedEras(new Set());
    setSelectedRegions(new Set());
  };

  const clearAllEras = useCallback(() => {
    setSelectedEras(new Set());
  }, [setSelectedEras]);

  const clearAllRegions = useCallback(() => {
    setSelectedRegions(new Set());
  }, [setSelectedRegions]);

  return (
    <div>
      <FilterControls
        search={search}
        setSearch={setSearch}
        selectedEras={selectedEras}
        selectedRegions={selectedRegions}
        toggleEra={toggleEra}
        toggleRegion={toggleRegion}
        clearFilters={clearFilters}
        clearAllEras={clearAllEras}
        clearAllRegions={clearAllRegions}
        allEras={allEras}
        allRegions={allRegions}
        eraCounts={eraCounts}
        regionCounts={regionCounts}
        sortBy={sortBy}
        setSortBy={setSortBy}
      />

      <div className="mb-4 text-slate-600 dark:text-slate-400">
        Showing {filteredEpisodes.length} of {episodes.length} episodes
      </div>

      {filteredEpisodes.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-12 text-center">
          <p className="text-xl text-slate-600 dark:text-slate-400 mb-2">
            No episodes found
          </p>
          <p className="text-slate-500 dark:text-slate-500">
            Try adjusting your filters or search terms
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredEpisodes.map((episode) => (
            <EpisodeCard key={episode.episode} episode={episode} />
          ))}
        </div>
      )}
    </div>
  );
}
