import { loadCache, replaceCacheEntry, updateCacheEntry } from './cacheManager.js';
import { loadSettings } from './settings.js';
import type { GameCacheEntry } from './cacheManager.js';

/**
 * Gère la récupération des données des jeux et le téléchargement des images.
 *
 * Toutes les écritures passent par des mises à jour par entrée (fusionnées
 * côté main) : plusieurs fetchs tournent en parallèle pendant un scan, et
 * une réécriture du cache complet par l'un effacerait le travail des autres.
 *
 * Il n'y a volontairement pas de purge : un jeu dont le dossier a disparu
 * (disque débranché, dossier renommé, jeu désinstallé) garde sa fiche, ses
 * images, sa note et son temps de jeu. Il n'est simplement plus affiché, et
 * retrouve tout s'il revient. DLsite pouvant retirer une œuvre, la fiche en
 * cache peut être la seule copie restante de ses métadonnées.
 */

/**
 * Récupère les métadonnées d'un jeu via un fetch Node direct vers DLsite.
 */
export async function fetchGameMetadata(gameId: string): Promise<void> {
  try {
    const settings = await loadSettings();
    const lang = settings.language || 'en_US';

    console.log(`Récupération des métadonnées pour ${gameId}...`);
    const data = await window.electronAPI.fetchGameMetadata(gameId, lang) as GameCacheEntry;
    const existingEntry = (await loadCache())[gameId];

    // Ajouter la date d'ajout si elle n'existe pas déjà
    if (!data.addedDate) {
      data.addedDate = existingEntry?.addedDate || new Date().toISOString();
    }

    await replaceCacheEntry(gameId, data);

    // Le téléchargement d'images est isolé dans son propre try/catch : s'il
    // échoue (réseau, timeout...), imagesComplete doit rester explicitement
    // `false` plutôt que de ne jamais être écrit — sinon l'entrée échappe au
    // filtre de rattrapage de gameScanner.ts et reste bloquée sans image.
    let imagesComplete = false;
    try {
      imagesComplete = await window.electronAPI.downloadGameImages(gameId, data);
    } catch (imgError) {
      console.error(`Erreur lors du téléchargement des images pour ${gameId}:`, imgError);
    }

    // Fusion côté main : préserve ce qui a pu être modifié pendant le
    // téléchargement (note, tags...).
    await updateCacheEntry(gameId, { imagesComplete });
  } catch (error) {
    console.error(`Erreur lors de la récupération des données pour ${gameId}:`, error);
    // En cas d'échec du fetch (réseau, œuvre introuvable...), on marque aussi comme échoué temporairement
    const existingEntry = (await loadCache())[gameId];
    if (existingEntry && !existingEntry.fetchFailed) {
      console.warn(`Fiche existante conservée pour ${gameId} malgré l'erreur.`);
      return;
    }
    await replaceCacheEntry(gameId, {
      work_name: gameId,
      error: (error as Error).message,
      fetchFailed: true,
      lastFetchAttempt: new Date().toISOString()
    } as GameCacheEntry);
  }
}

/**
 * Retente le téléchargement des images manquantes d'un jeu déjà en cache,
 * sans jamais refaire de fetch réseau des métadonnées ni les modifier.
 */
export async function retryMissingImages(gameId: string): Promise<void> {
  const metadata = (await loadCache())[gameId];
  if (!metadata || metadata.fetchFailed || metadata.imagesComplete) return;

  let imagesComplete = false;
  try {
    imagesComplete = await window.electronAPI.downloadGameImages(gameId, metadata);
  } catch (imgError) {
    console.error(`Erreur lors du nouveau téléchargement des images pour ${gameId}:`, imgError);
  }

  // Sans effet si l'entrée a été supprimée entre-temps (jamais d'entrée
  // partielle recréée à partir du seul statut des images).
  await updateCacheEntry(gameId, { imagesComplete });
}

/**
 * Réinitialise et re-télécharge toutes les images.
 */
export async function resetAndRedownloadImages(): Promise<void> {
  console.log('--- DÉBUT DU RESET DES IMAGES ---');

  await window.electronAPI.resetImageCache();

  const cache = await loadCache();
  for (const [gameId, metadata] of Object.entries(cache)) {
    if (!metadata || metadata.fetchFailed) continue;
    let imagesComplete = false;
    try {
      imagesComplete = await window.electronAPI.downloadGameImages(gameId, metadata);
      console.log(`Images re-téléchargées pour ${gameId}`);
    } catch (imgError) {
      console.error(`Erreur lors du re-téléchargement des images pour ${gameId}:`, imgError);
    }
    await updateCacheEntry(gameId, { imagesComplete });
  }

  console.log('--- FIN DU RESET DES IMAGES ---');
}
