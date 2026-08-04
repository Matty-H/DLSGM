export interface SortSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Alphabétique (A→Z)' },
  { value: 'name_desc', label: 'Alphabétique (Z→A)' },
  { value: 'release_date_desc', label: 'Sortie (récent)' },
  { value: 'release_date_asc', label: 'Sortie (ancien)' },
  { value: 'playtime_desc', label: 'Temps de jeu' },
  { value: 'last_added', label: 'Dernier ajout' },
  { value: 'last_played', label: 'Dernière fois joué' }
];

export default function SortSelect({ value, onChange, className = '' }: SortSelectProps) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`input w-auto cursor-pointer ${className}`}
    >
      {SORT_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
