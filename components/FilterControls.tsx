'use client';

interface FilterControlsProps {
  search: string;
  setSearch: (value: string) => void;
  selectedEras: Set<string>;
  selectedRegions: Set<string>;
  toggleEra: (era: string) => void;
  toggleRegion: (region: string) => void;
  clearFilters: () => void;
  clearAllEras: () => void;
  clearAllRegions: () => void;
  allEras: string[];
  allRegions: string[];
  eraCounts: Record<string, number>;
  regionCounts: Record<string, number>;
  sortBy: string;
  setSortBy: (value: string) => void;
}

export default function FilterControls({
  search,
  setSearch,
  selectedEras,
  selectedRegions,
  toggleEra,
  toggleRegion,
  clearFilters,
  clearAllEras,
  clearAllRegions,
  allEras,
  allRegions,
  eraCounts,
  regionCounts,
  sortBy,
  setSortBy,
}: FilterControlsProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-6 mb-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <label
            htmlFor="search"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
          >
            Search Episodes
          </label>
          <input
            id="search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or description..."
            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label
            htmlFor="sort"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
          >
            Sort By
          </label>
          <select
            id="sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="alphabetical">Alphabetical</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Filter by Era
            </label>
            {selectedEras.size > 0 && (
              <button
                onClick={clearAllEras}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            {allEras.map((era) => (
              <label
                key={era}
                className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 rounded px-2"
              >
                <input
                  type="checkbox"
                  checked={selectedEras.has(era)}
                  onChange={() => toggleEra(era)}
                  className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">
                  {era}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  ({eraCounts[era] || 0})
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Filter by Region
            </label>
            {selectedRegions.size > 0 && (
              <button
                onClick={clearAllRegions}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            {allRegions.map((region) => (
              <label
                key={region}
                className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 rounded px-2"
              >
                <input
                  type="checkbox"
                  checked={selectedRegions.has(region)}
                  onChange={() => toggleRegion(region)}
                  className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">
                  {region}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  ({regionCounts[region] || 0})
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {(search || selectedEras.size > 0 || selectedRegions.size > 0) && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={clearFilters}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors font-medium"
          >
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
}
