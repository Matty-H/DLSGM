import RatingStars from '../RatingStars/RatingStars';
import GenreMultiSelect from '../GenreMultiSelect/GenreMultiSelect';
import SortSelect from '../SortSelect/SortSelect';

export interface AdvancedFilterPanelProps {
  show: boolean;
  selectedRating: number;
  onRatingChange: (value: number) => void;
  genres: string[];
  selectedGenres: string[];
  onToggleGenre: (genre: string) => void;
  onResetGenres: () => void;
  selectedSort: string;
  onSortChange: (value: string) => void;
}

export default function AdvancedFilterPanel({
  show,
  selectedRating,
  onRatingChange,
  genres,
  selectedGenres,
  onToggleGenre,
  onResetGenres,
  selectedSort,
  onSortChange
}: AdvancedFilterPanelProps) {
  return (
    <div
      className={`overflow-hidden border-b border-glass-border bg-glass px-8 backdrop-blur-app transition-[max-height,padding] duration-300 ${
        show ? 'max-h-[500px] overflow-visible py-5' : 'max-h-0 py-0'
      }`}
    >
      <div className="flex items-start gap-10">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Note</label>
          <div className="flex h-[42px] items-center gap-1 rounded-xl border border-border bg-surface px-4">
            <RatingStars value={selectedRating} onChange={val => onRatingChange(val === selectedRating ? 0 : val)} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Genres</label>
          <GenreMultiSelect
            genres={genres}
            selectedGenres={selectedGenres}
            onToggleGenre={onToggleGenre}
            onReset={onResetGenres}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Trier par</label>
          <SortSelect value={selectedSort} onChange={onSortChange} />
        </div>
      </div>
    </div>
  );
}
