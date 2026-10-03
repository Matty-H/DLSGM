import fs from 'fs';
import path from 'path';
import type { Migration } from './index';

/**
 * Libellés des emplacements de sauvegarde avant leur passage en anglais
 * (1.1.0). Une restauration associe chaque dossier d'une copie à son
 * emplacement par ce libellé : les manifestes des copies faites avant sont
 * réécrits avec les libellés actuels.
 */
const LEGACY_SAVE_LABELS: Record<string, string> = {
  Sauvegardes: 'Saves',
  'Sauvegardes (jeu)': 'Saves (game)',
  'Dossier du jeu (SaveNN)': 'Game folder (SaveNN)',
  'Godot (Roaming, dossier dédié)': 'Godot (Roaming, dedicated folder)',
  'Unreal (jeu)': 'Unreal (game)'
};

/** Libellé actuel d'un emplacement (« (sandbox) » conservé). */
export function currentSaveLabel(label: string): string {
  const suffix = ' (sandbox)';
  const sandboxed = label.endsWith(suffix);
  const base = sandboxed ? label.slice(0, -suffix.length) : label;
  const current = LEGACY_SAVE_LABELS[base] ?? base;
  return sandboxed ? current + suffix : current;
}

interface ManifestLabels {
  locations?: unknown;
  folders?: unknown;
}

/** Manifeste avec les libellés actuels, ou null s'il n'y a rien à changer. */
export function migrateManifest(manifest: ManifestLabels): ManifestLabels | null {
  const locations = Array.isArray(manifest.locations)
    ? manifest.locations.map(l => (typeof l === 'string' ? currentSaveLabel(l) : l))
    : manifest.locations;
  const folders = Array.isArray(manifest.folders)
    ? manifest.folders.map(f =>
        f && typeof f === 'object' && typeof (f as { label?: unknown }).label === 'string'
          ? { ...f, label: currentSaveLabel((f as { label: string }).label) }
          : f
      )
    : manifest.folders;
  const next = { ...manifest, locations, folders };
  return JSON.stringify(next) === JSON.stringify(manifest) ? null : next;
}

export const backupLabelsToEnglish: Migration = {
  id: '003-backup-labels-to-english',
  async run({ userData }) {
    const root = path.join(userData, 'save_backups');
    if (!fs.existsSync(root)) return;
    for (const game of fs.readdirSync(root, { withFileTypes: true })) {
      if (!game.isDirectory()) continue;
      for (const backup of fs.readdirSync(path.join(root, game.name), { withFileTypes: true })) {
        if (!backup.isDirectory() || backup.name.endsWith('.tmp')) continue;
        const file = path.join(root, game.name, backup.name, 'backup.json');
        if (!fs.existsSync(file)) continue;
        const next = migrateManifest(JSON.parse(fs.readFileSync(file, 'utf8')) as ManifestLabels);
        if (!next) continue;
        // Écrit à côté puis renomme : un manifeste n'est jamais à moitié écrit.
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
        fs.renameSync(`${file}.tmp`, file);
      }
    }
  }
};
