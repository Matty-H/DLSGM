import fs from 'fs';
import path from 'path';
import { parseReleaseName, readInstallInfo, writeInstallInfo } from './release-names';
import type { FolderRenameResult, MisnamedFolder } from '../shared/ipc-types';

/**
 * Assistant de renommage : les dossiers du dossier de jeux dont le nom
 * contient un ID DLsite sans être exactement cet ID (`[RJ01234567] Titre
 * v1.2`, `RJ01234567_fixed`, `rj01234567`) sont invisibles pour DLSGM. On
 * les propose au renommage ; rien n'est renommé sans confirmation, et jamais
 * par-dessus un dossier existant. L'ancien nom (avec version et DLC) est
 * gardé dans `.dlsgm/install.json`.
 */

const GAME_ID_REGEX = /^[A-Z]{2}\d{6,9}$/;

export function findMisnamedFolders(destinationFolder: string): MisnamedFolder[] {
  const entries = fs.readdirSync(destinationFolder, { withFileTypes: true });
  const existing = new Set(entries.filter(e => e.isDirectory() && GAME_ID_REGEX.test(e.name)).map(e => e.name));
  const candidates: MisnamedFolder[] = [];
  for (const entry of entries) {
    // Dossiers techniques de DLSGM (.dlsgm-import, .dlsgm-incoming) et cachés : jamais proposés.
    if (!entry.isDirectory() || entry.name.startsWith('.') || GAME_ID_REGEX.test(entry.name)) continue;
    const { gameId, version, dlc } = parseReleaseName(entry.name);
    if (gameId) candidates.push({ folder: entry.name, gameId, version, dlc });
  }
  const counts = new Map<string, number>();
  for (const c of candidates) counts.set(c.gameId, (counts.get(c.gameId) ?? 0) + 1);
  for (const c of candidates) {
    if (existing.has(c.gameId)) c.conflict = 'exists';
    else if (counts.get(c.gameId)! > 1) c.conflict = 'duplicate';
  }
  return candidates.sort((a, b) => a.gameId.localeCompare(b.gameId));
}

/**
 * Renomme les dossiers demandés (noms tels que proposés par
 * `findMisnamedFolders`, revérifiés ici : la liste du renderer peut être
 * périmée). Un dossier ne différant de son ID que par la casse passe par un
 * nom temporaire (Windows ne distingue pas `rj…` de `RJ…`).
 */
export function renameMisnamedFolders(destinationFolder: string, folders: string[]): FolderRenameResult[] {
  const candidates = new Map(findMisnamedFolders(destinationFolder).map(c => [c.folder, c]));
  const results: FolderRenameResult[] = [];
  const done = new Set<string>();
  for (const folder of folders) {
    const candidate = candidates.get(folder);
    if (!candidate) {
      results.push({ folder, error: 'Dossier introuvable ou déjà renommé.' });
      continue;
    }
    if (candidate.conflict || done.has(candidate.gameId)) {
      results.push({ folder, error: `Un dossier ${candidate.gameId} existe déjà (ou plusieurs dossiers portent cet ID) : rien n'a été renommé.` });
      continue;
    }
    const source = path.join(destinationFolder, folder);
    const target = path.join(destinationFolder, candidate.gameId);
    try {
      if (folder.toUpperCase() === candidate.gameId) {
        const temporary = `${target}.dlsgm-rename`;
        fs.renameSync(source, temporary);
        fs.renameSync(temporary, target);
      } else {
        if (fs.existsSync(target)) throw new Error(`${candidate.gameId} existe déjà.`);
        fs.renameSync(source, target);
      }
      done.add(candidate.gameId);
      results.push({ folder, gameId: candidate.gameId });
    } catch (error) {
      results.push({ folder, error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    // Une origine déjà connue (import d'archive) n'est pas remplacée par l'ancien nom du dossier.
    if (!readInstallInfo(target)) {
      try {
        writeInstallInfo(target, { source: folder, version: candidate.version, dlc: candidate.dlc, date: new Date().toISOString() });
      } catch (error) {
        console.error(`Origine de ${candidate.gameId} non enregistrée :`, error);
      }
    }
  }
  return results;
}
