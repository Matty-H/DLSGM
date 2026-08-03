export interface SortSelectProps {
  value: string;
  onChange: (value: string) => void;
}

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Ordre alphabétique (A-Z)' },
  { value: 'name_desc', label: 'Ordre alphabétique (Z-A)' },
  { value: 'last_played', label: 'Dernière fois joué' },
  { value: 'last_added', label: 'Dernier ajout' },
  { value: 'release_date_desc', label: 'Date de sortie (Récent)' },
  { value: 'release_date_asc', label: 'Date de sortie (Ancien)' }
];

export default function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-[42px] min-w-[220px] rounded-xl border border-border bg-surface px-4 text-sm text-white outline-none transition-colors duration-300 hover:border-primary hover:bg-surface-hover"
    >
      {SORT_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
