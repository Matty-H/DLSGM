/**
 * Utilitaires pour formater les durées et les dates.
 */

/**
 * Formate le temps de jeu en une chaîne lisible.
 */
export function formatPlayTime(totalPlayTimeSeconds) {
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
export function formatLastPlayed(lastPlayedDate) {
    if (!lastPlayedDate) {
      return '';
    }

    const date = typeof lastPlayedDate === 'string' ? new Date(lastPlayedDate) : lastPlayedDate;
    const now = new Date();
    const diffTime = Math.abs(now - date);
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
