import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface GenreMultiSelectProps {
  genres: string[];
  selectedGenres: string[];
  onToggleGenre: (genre: string) => void;
  onReset: () => void;
}

export default function GenreMultiSelect({ genres, selectedGenres, onToggleGenre, onReset }: GenreMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const label = selectedGenres.length === 0 ? 'Tous les genres' : `${selectedGenres.length} genre${selectedGenres.length > 1 ? 's' : ''}`;

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen(prev => !prev)} className="btn min-w-[220px] justify-between">
        {label}
        <ChevronDown size={15} strokeWidth={2.25} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="animate-steam-in absolute top-full z-[1000] mt-2 max-h-[400px] w-[280px] overflow-y-auto rounded-md bg-surface-2 py-1 shadow-lg">
          <button
            type="button"
            onClick={onReset}
            className="w-full px-4 py-2.5 text-left text-sm font-semibold text-accent hover:bg-focus hover:text-on-focus"
          >
            Réinitialiser la sélection
          </button>
          <div className="mx-3 my-1 h-px bg-divider" />
          {genres.map(genre => {
            const checked = selectedGenres.includes(genre);
            return (
              <button
                key={genre}
                type="button"
                onClick={() => onToggleGenre(genre)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-focus hover:text-on-focus"
              >
                <span
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm ${
                    checked ? 'bg-accent text-white' : 'bg-bg-deep'
                  }`}
                >
                  {checked && <Check size={12} strokeWidth={3} />}
                </span>
                <span>{genre}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
