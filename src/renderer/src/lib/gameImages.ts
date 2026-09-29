import type { GameImagesPlan } from '../../../shared/ipc-types';
import type { GameCacheEntry } from './cacheManager.js';

/**
 * Édition des images d'un jeu (couverture + échantillons) depuis la fiche
 * manuelle. Les fichiers eux-mêmes sont réorganisés côté main
 * (`apply-game-images`) ; ce module construit le plan et calcule le patch
 * de cache correspondant.
 */

/**
 * Marqueur, à la place d'une URL DLsite, d'une image fournie par
 * l'utilisateur : main ne tente pas de la télécharger et la préserve lors
 * d'un reset du cache d'images.
 */
export const MANUAL_IMAGE = 'manual';

/** Formats acceptés (mêmes signatures que celles vérifiées côté main). */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** Image existante (`keep` : 0 = couverture, n = sample_n.jpg) ou nouvelle image en octets. */
export type ImageEditSource = { keep: number } | { data: Uint8Array };

export interface ImageEdit {
  /** `null` = pas de couverture (supprimée). */
  cover: ImageEditSource | null;
  samples: ImageEditSource[];
}

/**
 * Applique `edit` aux fichiers du cache d'images et renvoie les champs à
 * fusionner dans l'entrée : URLs d'origine pour les images conservées,
 * MANUAL_IMAGE pour les nouvelles, et un `imagesVersion` neuf pour que les
 * URLs `atom://` changent (sinon Chromium réaffiche l'ancienne image).
 */
export async function applyImageEdit(
  gameId: string,
  entry: Partial<GameCacheEntry>,
  edit: ImageEdit
): Promise<Pick<GameCacheEntry, 'work_image' | 'sample_images'> & { imagesVersion: number }> {
  const originalSamples: string[] = Array.isArray(entry.sample_images) ? entry.sample_images : [];

  const plan: GameImagesPlan = {
    cover: edit.cover === null ? 'remove' : 'keep' in edit.cover ? 'keep' : { data: edit.cover.data },
    samples: edit.samples.map(source => ('keep' in source ? { keep: source.keep } : { data: source.data }))
  };
  await window.electronAPI.applyGameImages(gameId, plan);

  return {
    work_image: edit.cover === null ? null : 'keep' in edit.cover ? entry.work_image ?? null : MANUAL_IMAGE,
    sample_images: edit.samples.map(source => ('keep' in source ? originalSamples[source.keep - 1] : MANUAL_IMAGE)),
    imagesVersion: Date.now()
  };
}
