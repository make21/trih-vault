'use client';

interface FilterControlsProps {
  search: string;
  setSearch: (value: string) => void;
  selectedEras: Set<string>;
  selectedRegions: Set<string>;
  toggleEra: (era: string) => void;
  toggleRegion: (region: string) => void;
  clearFilters: () => void;
  allEras: string[];
  allRegions: string[];
  eraCounts: Record<string, number>;
  regionCounts: Record<string, number>;
  yearRange: [number, number];
  yearBounds: [number, number];
  setYearRange: (range: [number, number]) => void;
}

export default function FilterControls({
  search,
  setSearch,
  selectedEras,
  selectedRegions,
  toggleEra,
  toggleRegion,
  clearFilters,
  allEras,
  allRegions,
  eraCounts,
  regionCounts,
  yearRange,
  yearBounds,
  setYearRange,
}: FilterControlsProps) {
  const [minYear, maxYear] = yearBounds;
  const [currentMin, currentMax] = yearRange;
  const showClearButton =
    Boolean(search) ||
    selectedEras.size > 0 ||
    selectedRegions.size > 0 ||
    currentMin !== minYear ||
    currentMax !== maxYear;
  const sliderDisabled = minYear === maxYear;

  const handleMinChange = (value: number) => {
    const bounded = Math.min(Math.max(value, minYear), currentMax);
    setYearRange([bounded, currentMax]);
  };

  const handleMaxChange = (value: number) => {
    const bounded = Math.max(Math.min(value, maxYear), currentMin);
    setYearRange([currentMin, bounded]);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 space-y-6">
      <div>
        <label
          htmlFor="search"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
        >
          Search (title & description)
        </label>
        <input
          id="search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search episodes..."
          className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Era
        </span>
        <div className="flex flex-wrap gap-2">
          {allEras.map((era) => {
            const checked = selectedEras.has(era);
            return (
              <button
                key={era}
                onClick={() => toggleEra(era)}
                className={`px-3 py-1 rounded-full border text-sm transition-colors ${
                  checked
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
                type="button"
              >
                <span>{era}</span>
                <span className="ml-2 text-xs opacity-80">({eraCounts[era] || 0})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Region
        </span>
        <div className="flex flex-wrap gap-2">
          {allRegions.map((region) => {
            const checked = selectedRegions.has(region);
            return (
              <button
                key={region}
                onClick={() => toggleRegion(region)}
                className={`px-3 py-1 rounded-full border text-sm transition-colors ${
                  checked
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
                type="button"
              >
                <span>{region}</span>
                <span className="ml-2 text-xs opacity-80">({regionCounts[region] || 0})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Year range
        </span>
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {sliderDisabled
            ? `${minYear}`
            : `${currentMin} – ${currentMax}`}
        </div>
        <div className="mt-4 space-y-3">
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={currentMin}
            onChange={(event) => handleMinChange(Number(event.target.value))}
            disabled={sliderDisabled}
            className="w-full"
          />
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={currentMax}
            onChange={(event) => handleMaxChange(Number(event.target.value))}
            disabled={sliderDisabled}
            className="w-full"
          />
        </div>
      </div>

      {showClearButton && (
        <div className="pt-2">
          <button
            onClick={clearFilters}
            className="w-full px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            type="button"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
