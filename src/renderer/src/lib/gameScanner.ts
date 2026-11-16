import { fetchGameMetadata, retryMissingImages } from './dataFetcher.js';
import { loadCache } from './cacheManager.js';

/**
 * Scanne le dossier de destination pour détecter les nouveaux jeux.
 *
 * Ce module est volontairement dépourvu de toute manipulation du DOM : il
 * retourne un statut, à charge de l'appelant (le hook useGamesLibrary) de
 * mettre à jour l'interface en conséquence.
 */

// Nombre de jeux traités en parallèle lors d'un scan : reste économe vis-à-vis
// de DLsite tout en évitant qu'un scan initial ne traite tout en série.
const FETCH_CONCURRENCY = 3;

export interface ScanResult {
  status: 'no-folder' | 'empty' | 'ok';
  gameFolders?: string[];
}

/**
 * Exécute `worker` sur chaque élément de `items`, avec au plus `limit`
 * exécutions en parallèle.
 */
async function runWithConcurrencyLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;

  async function processNext(): Promise<void> {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => processNext()));
}

export interface ScanCallbacks {
  /** Dossiers de jeux listés, avant tout fetch : de quoi afficher tout de suite ce qui est déjà en cache. */
  onFolders?: (gameFolders: string[]) => void | Promise<void>;
  /** Une fiche vient de changer dans le cache (métadonnées écrites, images terminées). */
  onEntryChanged?: (gameId: string) => void | Promise<void>;
}

/**
 * Scanne le dossier des jeux, récupère les métadonnées manquantes et retente
 * les images incomplètes. Les rappels permettent d'afficher chaque jeu dès
 * que sa fiche existe, sans attendre la fin du scan (les images d'un seul
 * jeu peuvent prendre plusieurs secondes, et un scan en traite plusieurs).
 */
export async function scanGames(callbacks: ScanCallbacks = {}): Promise<ScanResult> {
  // Liste les dossiers correspondant au format DLSite (null = dossier introuvable).
  // Aucune purge : les fiches des jeux absents sont conservées (voir dataFetcher.ts).
  // Tous les dossiers de bibliothèque (null : aucun n'existe).
  const gameFolders = await window.electronAPI.listGameFolders();
  if (!gameFolders) {
    console.error("Le dossier des jeux n'existe pas");
    return { status: 'no-folder' };
  }

  if (gameFolders.length === 0) {
    return { status: 'empty' };
  }

  await callbacks.onFolders?.(gameFolders);
  const cache = await loadCache();

  // Nouveaux jeux : récupération des métadonnées.
  const gamesToFetch = gameFolders.filter(gameId => !cache[gameId]);
  // Jeux déjà en cache mais dont le téléchargement d'images est incomplet :
  // on retente uniquement les images, sans jamais toucher aux métadonnées.
  // `!== true` (et non `=== false`) pour aussi rattraper les entrées où
  // imagesComplete n'a jamais été écrit du tout (fetch métadonnées réussi,
  // mais l'appel de téléchargement d'images ayant levé une exception avant
  // que le flag ne soit enregistré) — sinon ces jeux restent bloqués sans
  // image pour toujours, invisibles à la fois du statut "échec" et de ce filtre.
  const gamesNeedingImages = gameFolders.filter(gameId => cache[gameId] && cache[gameId].imagesComplete !== true);

  const changed = (gameId: string) => callbacks.onEntryChanged?.(gameId);
  await runWithConcurrencyLimit(gamesToFetch, FETCH_CONCURRENCY, async gameId => {
    // Deux fois : fiche écrite (le jeu apparaît), puis images téléchargées (sa jaquette aussi).
    await fetchGameMetadata(gameId, () => changed(gameId));
    await changed(gameId);
  });
  await runWithConcurrencyLimit(gamesNeedingImages, FETCH_CONCURRENCY, async gameId => {
    await retryMissingImages(gameId);
    await changed(gameId);
  });

  return { status: 'ok', gameFolders };
}
