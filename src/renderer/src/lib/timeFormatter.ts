/**
 * Utilitaires pour formater les durées et les dates.
 */

/**
 * Formate le temps de jeu en une chaîne lisible.
 */
export function formatPlayTime(totalPlayTimeSeconds: number): string {
  if (totalPlayTimeSeconds <= 0) {
    return '';
  }

  const totalPlayTimeMinutes = Math.floor(totalPlayTimeSeconds / 60);
  const totalPlayTimeHours = Math.floor(totalPlayTimeMinutes / 60);

  if (totalPlayTimeSeconds < 60) {
    return `${totalPlayTimeSeconds} sec`;
  } else if (totalPlayTimeMinutes < 60) {
    return `${totalPlayTimeMinutes} min`;
  } else {
    return `${totalPlayTimeHours} h`;
  }
}

/**
 * Formate la date de dernière lecture en une chaîne relative.
 */
export function formatLastPlayed(lastPlayedDate: string | Date | null | undefined): string {
  if (!lastPlayedDate) {
    return '';
  }

  const date = typeof lastPlayedDate === 'string' ? new Date(lastPlayedDate) : lastPlayedDate;
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffTime / (1000 * 60));

  if (diffDays > 0) {
    return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  } else if (diffHours > 0) {
    return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
  } else if (diffMinutes > 0) {
    return `Il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
  } else {
    return 'À l\'instant';
  }
}

/**
 * Durée d'une session, plus précise que formatPlayTime (ex: "1 h 05",
 * "12 min", "< 1 min").
 */
export function formatSessionDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}
