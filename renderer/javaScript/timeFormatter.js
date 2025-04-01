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
    return `${totalPlayTimeHours} hour${totalPlayTimeHours > 1 ? 's' : ''}`;
  }
}
  
export function formatLastPlayed(lastPlayedDate) {
    if (!lastPlayedDate) {
      return '';
    }

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
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else {
      return 'right now';
    }
  }
