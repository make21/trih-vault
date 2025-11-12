type GapMarkerProps = {
  years: number;
  expanded: boolean;
  onToggle: () => void;
};

const formatYears = (value: number): string =>
  Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);

export function GapMarker(props: GapMarkerProps) {
  const { years, expanded, onToggle } = props;
  const yearsLabel = formatYears(years);
  const action = expanded ? "collapse" : "expand";

  return (
    <div className="timeline__gap-marker">
      <button
        type="button"
        className="timeline__gap-button"
        onClick={onToggle}
        aria-pressed={expanded}
        aria-label={`${expanded ? "Expanded" : "Collapsed"} gap of ${yearsLabel} years. Activate to ${action}.`}
        title={`${yearsLabel} years`}
      >
        <span aria-hidden className="timeline__gap-dots">
          <span />
          <span />
          <span />
        </span>
      </button>
      <span className="timeline__gap-label" aria-hidden>
        Gap of {yearsLabel} years
      </span>
    </div>
  );
}

export default GapMarker;
