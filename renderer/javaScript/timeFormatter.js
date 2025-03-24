/**
 * Formate le temps de jeu total
 * @param {number} totalPlayTime - Temps de jeu en secondes
 * @returns {string} - Temps formaté
 */
export function formatPlayTime(totalPlayTime) {
    if (!totalPlayTime || totalPlayTime <= 0) {
      return '';
    }
    
    if (totalPlayTime < 60) {
      return `${totalPlayTime} sec.`;
    } else if (totalPlayTime < 3600) {
      const minutes = Math.floor(totalPlayTime / 60);
      return `${minutes} min`;
    } else {
      const hours = Math.floor(totalPlayTime / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''}`;
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
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} min ago`;
    } else {
      return 'right now';
    }
  }