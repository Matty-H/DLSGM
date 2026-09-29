import { Star } from 'lucide-react';

export interface RatingStarsProps {
  /** Note actuelle (0 à `max`). */
  value: number;
  /** Rend le composant interactif : appelé avec la valeur cliquée. */
  onChange?: (value: number) => void;
  max?: number;
  size?: number;
  className?: string;
}

/**
 * Rangée d'étoiles réutilisable : affichage seul (`onChange` omis) ou
 * interactif (notation d'un jeu, filtre de note minimale — le comportement
 * exact au clic, y compris la remise à zéro, est décidé par l'appelant).
 */
export default function RatingStars({ value, onChange, max = 5, size = 18, className = '' }: RatingStarsProps) {
  const interactive = typeof onChange === 'function';

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {Array.from({ length: max }, (_, i) => i + 1).map(starValue => {
        const filled = starValue <= value;
        return (
          <span
            key={starValue}
            onClick={interactive ? () => onChange!(starValue) : undefined}
            className={`${interactive ? 'cursor-pointer transition-transform hover:scale-125' : ''} ${
              filled ? 'text-accent' : 'text-surface-3'
            }`}
          >
            <Star size={size} strokeWidth={0} fill="currentColor" />
          </span>
        );
      })}
    </div>
  );
}
