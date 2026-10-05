import type { RpgSaveData, RpgSavePatch } from '../../../shared/ipc-types';
import { msg, t } from './i18n.js';

/** Éditeur de sauvegardes RPG Maker MV/MZ : logique d'affichage (sans DOM). */

export type RpgSaveTab = 'items' | 'weapons' | 'armors' | 'variables' | 'switches';

/** Onglets de l'éditeur (libellés : afficher avec tr()). */
export const RPG_SAVE_TABS: { id: RpgSaveTab; label: string }[] = [
  { id: 'items', label: msg('Objets') },
  { id: 'weapons', label: msg('Armes') },
  { id: 'armors', label: msg('Armures') },
  { id: 'variables', label: msg('Variables') },
  { id: 'switches', label: msg('Interrupteurs') }
];

/** `fileN` : emplacement N ; `file0` est la sauvegarde automatique de MZ. */
export function slotLabel(slot: number): string {
  return slot === 0 ? t('Sauvegarde auto') : t('Emplacement {n}', { n: slot });
}

export interface RpgSaveRow {
  id: number;
  name: string;
  value: number | string | boolean | null;
  original: number | string | boolean | null;
  changed: boolean;
}

/** Lignes de l'onglet, valeurs modifiées appliquées, filtrées par recherche (nom ou n°) et « nommées ». */
export function visibleEntries(data: RpgSaveData, tab: RpgSaveTab, patch: RpgSavePatch, filter: { search: string; namedOnly: boolean }): RpgSaveRow[] {
  const changes = (patch[tab] ?? {}) as Record<string, number | string | boolean>;
  const query = filter.search.trim().toLowerCase();
  return (data[tab] as { id: number; name: string; value: number | string | boolean | null }[])
    .map(entry => {
      const edited = Object.prototype.hasOwnProperty.call(changes, entry.id);
      const value = edited ? changes[entry.id] : entry.value;
      return { id: entry.id, name: entry.name, value, original: entry.value, changed: edited && value !== entry.value };
    })
    .filter(row => {
      // Possédé ou modifié : toujours montré, même sans nom.
      const relevant = row.name.trim() !== '' || row.changed || (tab !== 'switches' && tab !== 'variables' && Number(row.value) > 0);
      if (filter.namedOnly && !relevant) return false;
      if (!query) return true;
      return String(row.id) === query || row.name.toLowerCase().includes(query);
    });
}

/**
 * Valeur saisie pour une variable : nombre si le texte en est un (et que la
 * variable n'était pas déjà du texte), sinon texte tel quel.
 */
export function parseVariableInput(text: string, original: number | string | boolean | null): number | string {
  if (typeof original !== 'string' && /^-?\d+(\.\d+)?$/.test(text.trim())) return Number(text.trim());
  if (typeof original !== 'string' && text.trim() === '') return 0;
  return text;
}

/** Nombre de valeurs modifiées dans le patch. */
export function countChanges(patch: RpgSavePatch): number {
  let count = patch.gold !== undefined ? 1 : 0;
  for (const group of ['items', 'weapons', 'armors', 'variables', 'switches'] as const) count += Object.keys(patch[group] ?? {}).length;
  return count;
}
