import { loadCache, replaceCacheEntry, updateCacheEntry } from './cacheManager.js';
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
    console.log(`Récupération des métadonnées pour ${gameId}...`);
    const data = await window.electronAPI.fetchGameMetadata(gameId) as GameCacheEntry;
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
 * Fetch DLsite forcé d'un jeu déjà en cache (bouton de l'édition manuelle) :
 * remplace les métadonnées et les images par celles de DLsite.
 *
 * Contrairement au premier fetch, l'entrée n'est pas remplacée mais
 * fusionnée : note, tags, temps de jeu, exécutable choisi et exclusion de
 * sandbox (absents de la réponse DLsite) sont conservés. Si le fetch échoue
 * (œuvre retirée, réseau), l'erreur remonte et rien n'est modifié — la fiche
 * en cache peut être la seule copie restante.
 *
 * Renvoie false si certaines images n'ont pas pu être téléchargées (elles
 * seront retentées au prochain scan).
 */
export async function refetchGameMetadata(gameId: string): Promise<boolean> {
  const data = await window.electronAPI.fetchGameMetadata(gameId);

  // imagesComplete à false d'abord : si l'app s'arrête pendant le
  // téléchargement, le scan suivant reprendra les images.
  const saved = await updateCacheEntry(gameId, { ...data, fetchFailed: false, error: undefined, imagesComplete: false, manuallyEdited: false });
  if (!saved) throw new Error(`Aucune fiche en cache pour ${gameId}.`);

  let imagesComplete = false;
  try {
    imagesComplete = await window.electronAPI.downloadGameImages(gameId, data, { overwrite: true });
  } catch (imgError) {
    console.error(`Erreur lors du téléchargement des images pour ${gameId}:`, imgError);
  }
  // imagesVersion : l'URL atom:// ne change pas, sans elle Chromium
  // réafficherait les anciennes images depuis son cache.
  await updateCacheEntry(gameId, { imagesComplete, imagesVersion: Date.now() });
  return imagesComplete;
}

/**
 * Fiche modifiée à la main : marquée `manuallyEdited` depuis que ce drapeau
 * existe ; avant, le formulaire d'édition enregistrait `author` en simple
 * texte, là où DLsite donne toujours une liste (ou null).
 */
export function isManuallyEdited(entry: GameCacheEntry): boolean {
  return entry.manuallyEdited === true || typeof (entry as Record<string, unknown>).author === 'string';
}

export interface BulkUpdateResult {
  updated: string[];
  failed: { gameId: string; error: string }[];
  /** Fiches modifiées à la main ou en échec de fetch : non touchées. */
  skipped: string[];
  cancelled: boolean;
}

// Fetchs DLsite simultanés pendant une mise à jour groupée (4 requêtes chacun : JP + EN).
const BULK_CONCURRENCY = 2;

/**
 * Met à jour les métadonnées de toutes les fiches depuis DLsite, en
 * japonais (langue de référence) avec les traductions anglaises : rend la
 * base homogène (titres, noms de cercle, genres en japonais), complète le
 * dictionnaire des tags et ajoute les champs apparus depuis leur
 * récupération (`maker_id`, `options`, `work_name_en`...).
 *
 * Par fiche, uniquement si le fetch réussit : fusion des champs DLsite dans
 * l'entrée (note, tags, temps de jeu, collections... conservés), sans
 * toucher aux images (`work_image` / `sample_images` gardent leurs fichiers
 * et leurs éditions manuelles). Un échec laisse la fiche telle quelle (elle
 * peut être la seule copie d'une œuvre retirée). Les fiches modifiées à la
 * main et celles en échec de fetch sont ignorées.
 */
export async function updateAllMetadata(
  options: { onProgress?: (done: number, total: number) => void; isCancelled?: () => boolean } = {}
): Promise<BulkUpdateResult> {
  const cache = await loadCache();
  const result: BulkUpdateResult = { updated: [], failed: [], skipped: [], cancelled: false };

  const ids = Object.keys(cache).filter(gameId => {
    const entry = cache[gameId];
    if (entry.fetchFailed || isManuallyEdited(entry)) {
      result.skipped.push(gameId);
      return false;
    }
    return true;
  });

  let done = 0;
  options.onProgress?.(0, ids.length);
  const queue = [...ids];
  const worker = async () => {
    for (let gameId = queue.shift(); gameId !== undefined; gameId = queue.shift()) {
      if (options.isCancelled?.()) {
        result.cancelled = true;
        return;
      }
      try {
        const { work_image: _cover, sample_images: _samples, ...metadata } = await window.electronAPI.fetchGameMetadata(gameId);
        if (await updateCacheEntry(gameId, metadata)) result.updated.push(gameId);
      } catch (error) {
        result.failed.push({ gameId, error: (error as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') });
      }
      options.onProgress?.(++done, ids.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, ids.length) }, worker));
  return result;
}

/**
 * Retente le téléchargement des images manquantes
 d'un jeu déjà en cache,
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
