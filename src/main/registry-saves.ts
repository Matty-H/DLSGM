import { execFile, execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import { tm } from './i18n';

/**
 * Sauvegardes dans le registre (Windows) : les PlayerPrefs de Unity, sous
 * `HKCU\Software\<société>\<produit>` (société et produit lus dans
 * `<Jeu>_Data/app.info`). Certains jeux y gardent toute leur progression
 * (mesuré : 2 jeux Unity sur 12 d'une vraie bibliothèque, sans aucun
 * fichier de sauvegarde à côté).
 *
 * Copie = `reg export` de la clé dans un `.reg` (UTF-16, déterministe : deux
 * exports d'une clé inchangée sont identiques, d'où l'empreinte). Restauration
 * = suppression de la clé puis `reg import`, après vérification que le
 * fichier ne touche **que** cette clé : un `.reg` peut écrire n'importe où
 * dans le registre de l'utilisateur.
 */

const HIVE = 'HKCU';
const HIVE_LONG = 'HKEY_CURRENT_USER';
// Caractères refusés dans un segment de clé : séparateur, crochets du format .reg, contrôles.
const INVALID_SEGMENT = /[\\[\]\u0000-\u001f]/;

export const REGISTRY_FILE = 'registry.reg';

/** Clé des PlayerPrefs d'un jeu Unity, ou null si société / produit sont inutilisables. */
export function unityRegistryKey(company: string | null | undefined, product: string | null | undefined): string | null {
  const parts = [company?.trim(), product?.trim()];
  if (parts.some(part => !part || part === '.' || part === '..' || INVALID_SEGMENT.test(part))) return null;
  return `${HIVE}\\Software\\${parts[0]}\\${parts[1]}`;
}

/** Une clé sous HKCU\Software, au moins deux niveaux (jamais `Software` elle-même ni une société entière). */
export function isAllowedKey(key: string): boolean {
  const parts = key.split('\\');
  return parts.length >= 4 && parts[0] === HIVE && parts[1].toLowerCase() === 'software' && parts.slice(2).every(part => part !== '' && !INVALID_SEGMENT.test(part));
}

/** Contenu d'un `.reg` exporté (UTF-16 avec BOM, ou UTF-8). */
export function readRegFile(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  return buffer.toString('utf8').replace(/^﻿/, '');
}

/**
 * Vrai si chaque section du `.reg` est `key` ou une de ses sous-clés, sans
 * suppression de clé (`[-…]`) : c'est ce qu'importer peut modifier.
 */
export function regFileOnlyTouches(content: string, key: string): boolean {
  const long = `${HIVE_LONG}${key.slice(HIVE.length)}`.toLowerCase();
  const lines = content.split(/\r?\n/);
  if (!/^Windows Registry Editor Version 5\.00$/.test(lines[0]?.trim() ?? '')) return false;
  let sections = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('[')) continue;
    const match = /^\[(.+)\]$/.exec(line);
    if (!match || match[1].startsWith('-')) return false;
    const section = match[1].toLowerCase();
    if (section !== long && !section.startsWith(`${long}\\`)) return false;
    sections++;
  }
  return sections > 0;
}

export function fingerprintRegFile(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Exécute reg.exe ; rejette avec sa sortie d'erreur. */
export type RegRunner = (args: string[]) => Promise<void>;

export const runReg: RegRunner = args =>
  new Promise((resolve, reject) => {
    execFile('reg.exe', args, { windowsHide: true, timeout: 30_000 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).trim()));
      else resolve();
    });
  });

/** La clé existe (synchrone : appelé pendant la détection des emplacements, ≈30 ms). */
export function registryKeyExists(key: string): boolean {
  if (process.platform !== 'win32' || !isAllowedKey(key)) return false;
  try {
    execFileSync('reg.exe', ['query', key], { windowsHide: true, stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/** Exporte la clé dans `file` ; false si elle n'existe pas. */
export async function exportRegistryKey(key: string, file: string, run: RegRunner = runReg): Promise<boolean> {
  if (!isAllowedKey(key)) throw new Error(tm('Clé de registre refusée : {key}', { key }));
  try {
    await run(['export', key, file, '/y']);
  } catch (error) {
    if (!fs.existsSync(file)) return false;
    throw error;
  }
  return fs.existsSync(file);
}

/**
 * Remplace la clé par le contenu de `file` (exporté par `exportRegistryKey`).
 * Refusé si le fichier touche autre chose que cette clé.
 */
export async function importRegistryKey(key: string, file: string, run: RegRunner = runReg): Promise<void> {
  if (!isAllowedKey(key)) throw new Error(tm('Clé de registre refusée : {key}', { key }));
  if (!regFileOnlyTouches(readRegFile(await fs.promises.readFile(file)), key)) {
    throw new Error(tm('Copie du registre refusée : elle modifierait autre chose que {key}.', { key }));
  }
  // Valeurs ajoutées depuis la copie : supprimées avec la clé, sinon l'import les laisserait.
  await run(['delete', key, '/f']).catch(() => undefined);
  await run(['import', file]);
}
