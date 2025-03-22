/**
 * Formate le temps de jeu total
 * @param {number} totalPlayTime - Temps de jeu en secondes
 * @returns {string} - Temps formaté
 */
export function formatPlayTime(totalPlayTime) {
    if (!totalPlayTime || totalPlayTime <= 0) {
      return 'Jamais joué';
    }
    
    if (totalPlayTime < 60) {
      return `${totalPlayTime} secondes`;
    } else if (totalPlayTime < 3600) {
      const minutes = Math.floor(totalPlayTime / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(totalPlayTime / 3600);
      return `${hours} heure${hours > 1 ? 's' : ''}`;
    }
  }
  
  /**
   * Formate la date de dernière utilisation
   * @param {string|null} lastPlayed - Date ISO de dernière utilisation
   * @returns {string} - Date formatée
   */
  export function formatLastPlayed(lastPlayed) {
    if (!lastPlayed) {
      return '';
    }
    
    const lastPlayedDate = new Date(lastPlayed);
    const now = new Date();
    const diffTime = Math.abs(now - lastPlayedDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    
    if (diffDays > 0) {
      return `il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      return `il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
    } else if (diffMinutes > 0) {
      return `il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
    } else {
      return 'à l\'instant';
    }
  }