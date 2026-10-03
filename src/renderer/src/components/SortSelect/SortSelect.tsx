import Select from '../Select/Select';
import { msg, t, tr } from '../../lib/i18n.js';

export interface SortSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const SORT_OPTIONS = [
  { value: 'name_asc', label: msg('Alphabétique (A→Z)') },
  { value: 'name_desc', label: msg('Alphabétique (Z→A)') },
  { value: 'release_date_desc', label: msg('Sortie (récent)') },
  { value: 'release_date_asc', label: msg('Sortie (ancien)') },
  { value: 'playtime_desc', label: msg('Temps de jeu') },
  { value: 'size_desc', label: msg('Taille sur le disque') },
  { value: 'last_added', label: msg('Dernier ajout') },
  { value: 'last_played', label: msg('Dernière fois joué') }
];

export default function SortSelect({ value, onChange, className = '' }: SortSelectProps) {
  return (
    <Select
      value={value}
      options={SORT_OPTIONS.map(opt => ({ value: opt.value, label: t('Trier : {label}', { label: tr(opt.label) }) }))}
      onChange={onChange}
      aria-label={t('Trier par')}
      className={`w-auto min-w-[200px] font-semibold ${className}`}
    />
  );
}
