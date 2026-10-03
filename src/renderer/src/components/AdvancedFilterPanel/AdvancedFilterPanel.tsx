import RatingStars from '../RatingStars/RatingStars';
import GenreMultiSelect from '../GenreMultiSelect/GenreMultiSelect';
import { t } from '../../lib/i18n.js';

export interface AdvancedFilterPanelProps {
  show: boolean;
  selectedRating: number;
  onRatingChange: (value: number) => void;
  genres: string[];
  selectedGenres: string[];
  onToggleGenre: (genre: string) => void;
  onResetGenres: () => void;
  genreLabel: (genre: string) => string;
}

export default function AdvancedFilterPanel({
  show,
  selectedRating,
  onRatingChange,
  genres,
  selectedGenres,
  onToggleGenre,
  onResetGenres,
  genreLabel
}: AdvancedFilterPanelProps) {
  if (!show) return null;

  return (
    <div className="panel animate-steam-in mx-6 mb-3 flex flex-shrink-0 items-start gap-10 px-5 py-4">
      <div className="flex flex-col gap-2">
        <span className="section-title">{t('Note minimale')}</span>
        <div className="flex h-[38px] items-center">
          <RatingStars value={selectedRating} onChange={val => onRatingChange(val === selectedRating ? 0 : val)} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="section-title">{t('Genres')}</span>
        <GenreMultiSelect genres={genres} selectedGenres={selectedGenres} onToggleGenre={onToggleGenre} onReset={onResetGenres} labelFor={genreLabel} />
      </div>
    </div>
  );
}
