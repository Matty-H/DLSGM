export interface RatingStarsProps {
  /** Note actuelle (0 à `max`). */
  value: number;
  /** Rend le composant interactif : appelé avec la valeur cliquée. */
  onChange?: (value: number) => void;
  max?: number;
  className?: string;
}

/**
 * Rangée d'étoiles réutilisable : affichage seul (`onChange` omis) ou
 * interactif (notation d'un jeu, filtre de note minimale — le comportement
 * exact au clic, y compris la remise à zéro, est décidé par l'appelant).
 */
export default function RatingStars({ value, onChange, max = 5, className = '' }: RatingStarsProps) {
  const interactive = typeof onChange === 'function';

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {Array.from({ length: max }, (_, i) => i + 1).map(starValue => (
        <span
          key={starValue}
          onClick={interactive ? () => onChange!(starValue) : undefined}
          className={[
            'text-lg leading-none',
            interactive ? 'cursor-pointer transition-transform hover:scale-125' : '',
            starValue <= value ? 'text-yellow-400' : 'text-neutral-600'
          ].join(' ')}
        >
          ★
        </span>
      ))}
    </div>
  );
}
