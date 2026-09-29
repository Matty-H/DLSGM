import Select from '../Select/Select';

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
].map(opt => ({ value: opt.value, label: `Trier : ${opt.label}` }));

export default function SortSelect({ value, onChange, className = '' }: SortSelectProps) {
  return (
    <Select
      value={value}
      options={SORT_OPTIONS}
      onChange={onChange}
      aria-label="Trier par"
      className={`w-auto min-w-[200px] font-semibold ${className}`}
    />
  );
}
