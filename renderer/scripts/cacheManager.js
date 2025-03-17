const fs = require('fs');
import { cacheFilePath } from './osHandler.js';

// Chargement du cache depuis le fichier
export function loadCache(cache = {}) {
  try {
    if (fs.existsSync(cacheFilePath)) {
      const cacheData = fs.readFileSync(cacheFilePath, 'utf8');
      cache = JSON.parse(cacheData);
      console.log('Cache chargé:', Object.keys(cache).length, 'entrées');
    } else {
      console.log('Aucun cache trouvé, création du cache...');
      fs.writeFileSync(cacheFilePath, JSON.stringify({}, null, 2));
    }
    return cache;
  } catch (error) {
    console.error('Erreur lors du chargement du cache:', error);
    fs.writeFileSync(cacheFilePath, JSON.stringify({}, null, 2));
    return {};
  }
}

// Sauvegarde du cache dans le fichier
export function saveCache(cache) {
  try {
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
    console.log('Cache sauvegardé avec succès');
    return true;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du cache:', error);
    return false;
  }
}

// Met à jour une entrée spécifique du cache
export function updateCacheEntry(cache, gameId, data) {
  cache[gameId] = {...(cache[gameId] || {}), ...data};
  return saveCache(cache);
}
