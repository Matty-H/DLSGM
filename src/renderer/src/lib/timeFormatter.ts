import { t } from './i18n.js';

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
    return t('{n} sec', { n: totalPlayTimeSeconds });
  } else if (totalPlayTimeMinutes < 60) {
    return t('{m} min', { m: totalPlayTimeMinutes });
  } else {
    return t('{h} h', { h: totalPlayTimeHours });
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
    return diffDays > 1 ? t('Il y a {n} jours', { n: diffDays }) : t('Il y a {n} jour', { n: diffDays });
  } else if (diffHours > 0) {
    return diffHours > 1 ? t('Il y a {n} heures', { n: diffHours }) : t('Il y a {n} heure', { n: diffHours });
  } else if (diffMinutes > 0) {
    return diffMinutes > 1 ? t('Il y a {n} minutes', { n: diffMinutes }) : t('Il y a {n} minute', { n: diffMinutes });
  } else {
    return t("À l'instant");
  }
}

/**
 * Durée d'une session, plus précise que formatPlayTime (ex: "1 h 05",
 * "12 min", "< 1 min").
 */
export function formatSessionDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return t('< 1 min');
  if (minutes < 60) return t('{m} min', { m: minutes });
  return t('{h} h {m}', { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, '0') });
}
