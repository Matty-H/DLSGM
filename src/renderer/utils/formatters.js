// src/renderer/utils/formatters.js

/**
 * Utilitaires pour le formatage des données d'affichage
 */

/**
 * Formate le temps de jeu en format lisible
 * @param {number} totalPlayTimeSeconds - Temps total en secondes
 * @returns {string} Temps formaté
 */
function formatPlayTime(totalPlayTimeSeconds) {
  if (!totalPlayTimeSeconds || totalPlayTimeSeconds <= 0) {
    return '';
  }

  const totalPlayTimeMinutes = Math.floor(totalPlayTimeSeconds / 60);
  const totalPlayTimeHours = Math.floor(totalPlayTimeMinutes / 60);

  if (totalPlayTimeSeconds < 60) {
    return `${totalPlayTimeSeconds} sec`;
  } else if (totalPlayTimeMinutes < 60) {
    return `${totalPlayTimeMinutes} min`;
  } else {
    return `${totalPlayTimeHours} hour${totalPlayTimeHours > 1 ? 's' : ''}`;
  }
}

/**
 * Formate la date de dernière utilisation en format relatif
 * @param {string|Date} lastPlayedDate - Date de dernière utilisation
 * @returns {string} Date formatée
 */
function formatLastPlayed(lastPlayedDate) {
  if (!lastPlayedDate) {
    return '';
  }

  const lastPlayed = typeof lastPlayedDate === 'string' 
    ? new Date(lastPlayedDate) 
    : lastPlayedDate;

  const now = new Date();
  const diffTime = Math.abs(now - lastPlayed);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffTime / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  } else {
    return 'right now';
  }
}

/**
 * Formate une date ISO en format lisible (YYYY-MM-DD)
 * @param {string} dateString - Date au format ISO
 * @returns {string} Date formatée
 */
function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  return dateString.split('T')[0];
}

module.exports = {
  formatPlayTime,
  formatLastPlayed,
  formatDate
};
