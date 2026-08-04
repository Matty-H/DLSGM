import RatingStars from '../RatingStars/RatingStars';
import GenreMultiSelect from '../GenreMultiSelect/GenreMultiSelect';

export interface AdvancedFilterPanelProps {
  show: boolean;
  selectedRating: number;
  onRatingChange: (value: number) => void;
  genres: string[];
  selectedGenres: string[];
  onToggleGenre: (genre: string) => void;
  onResetGenres: () => void;
}

export default function AdvancedFilterPanel({
  show,
  selectedRating,
  onRatingChange,
  genres,
  selectedGenres,
  onToggleGenre,
  onResetGenres
}: AdvancedFilterPanelProps) {
  return (
    <div
      className={`overflow-hidden border-b border-divider bg-surface px-6 transition-[max-height,padding] duration-300 ${
        show ? 'max-h-[500px] overflow-visible py-4' : 'max-h-0 py-0'
      }`}
    >
      <div className="flex items-start gap-8">
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Note minimale</label>
          <div className="input flex h-[36px] w-auto items-center gap-1">
            <RatingStars value={selectedRating} onChange={val => onRatingChange(val === selectedRating ? 0 : val)} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Genres</label>
          <GenreMultiSelect
            genres={genres}
            selectedGenres={selectedGenres}
            onToggleGenre={onToggleGenre}
            onReset={onResetGenres}
          />
        </div>
      </div>
    </div>
  );
}
