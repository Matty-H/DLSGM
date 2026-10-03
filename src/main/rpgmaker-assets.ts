import fs from 'fs';
import path from 'path';
import { tm } from './i18n';

/**
 * Extraction des ressources chiffrées d'un jeu RPG Maker MV / MZ, comme le
 * « RPG-Maker-MV-Decrypter » de Petschko : `.rpgmvp` / `.png_` → `.png`,
 * `.rpgmvo` / `.ogg_` → `.ogg`, `.rpgmvm` / `.m4a_` → `.m4a`.
 *
 * Format : un en-tête de 16 octets (« RPGMV », version), puis le fichier
 * d'origine dont seuls les 16 premiers octets sont chiffrés par XOR avec la
 * clé (16 octets, `encryptionKey` en hexadécimal dans `data/System.json`).
 * Sans clé lisible, elle se déduit d'une image : les 16 premiers octets d'un
 * PNG sont toujours les mêmes.
 *
 * Les fichiers déchiffrés vont dans le dossier de travaux du jeu (jamais
 * dans le dossier du jeu), en gardant l'arborescence (`img/pictures/...`).
 */

const SIGNATURE = Buffer.from('RPGMV', 'ascii');
const HEADER_LENGTH = 16;
const EXTRACT_CONCURRENCY = 8;
// Signature PNG + longueur et type du premier bloc (IHDR) : identiques dans tout PNG.
const PNG_START = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

const EXTENSIONS: Record<string, string> = {
  '.rpgmvp': '.png',
  '.png_': '.png',
  '.rpgmvo': '.ogg',
  '.ogg_': '.ogg',
  '.rpgmvm': '.m4a',
  '.m4a_': '.m4a'
};

export function isEncryptedAsset(name: string): boolean {
  return path.extname(name).toLowerCase() in EXTENSIONS;
}

/** Nom du fichier déchiffré (`Actor1.rpgmvp` → `Actor1.png`). */
export function decryptedName(name: string): string {
  const ext = path.extname(name);
  return name.slice(0, -ext.length) + EXTENSIONS[ext.toLowerCase()];
}

export function decryptAsset(data: Buffer, key: Buffer): Buffer {
  if (data.length < HEADER_LENGTH || !data.subarray(0, SIGNATURE.length).equals(SIGNATURE)) {
    throw new Error(tm("Ce n'est pas une ressource RPG Maker chiffrée (en-tête RPGMV absent)."));
  }
  const out = Buffer.from(data.subarray(HEADER_LENGTH));
  for (let i = 0; i < 16 && i < out.length; i++) out[i] ^= key[i];
  return out;
}

/** Clé tirée d'une image chiffrée (le début d'un PNG est connu). */
export function keyFromEncryptedPng(data: Buffer): Buffer | null {
  if (data.length < HEADER_LENGTH + 16 || !data.subarray(0, SIGNATURE.length).equals(SIGNATURE)) return null;
  const key = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) key[i] = data[HEADER_LENGTH + i] ^ PNG_START[i];
  return key;
}

/** Clé déclarée par le jeu (`data/System.json`, champ `encryptionKey`), ou null. */
export function keyFromSystemJson(webDir: string): Buffer | null {
  try {
    const system = JSON.parse(fs.readFileSync(path.join(webDir, 'data', 'System.json'), 'utf8').replace(/^﻿/, '')) as { encryptionKey?: unknown };
    const hex = typeof system.encryptionKey === 'string' ? system.encryptionKey.trim() : '';
    return /^[0-9a-f]{32}$/i.test(hex) ? Buffer.from(hex, 'hex') : null;
  } catch {
    return null;
  }
}

/** Ressources chiffrées sous `dir` (chemins relatifs), sans le dossier des sauvegardes. */
export function listEncryptedAssets(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'save' && dir === base) continue;
      out.push(...listEncryptedAssets(full, base));
    } else if (entry.isFile() && isEncryptedAsset(entry.name)) {
      out.push(path.relative(base, full));
    }
  }
  return out;
}

export interface AssetExtraction {
  files: number;
  /** D'où vient la clé : déclarée par le jeu, ou déduite d'une image. */
  keySource: 'system' | 'image';
  /** Fichiers illisibles ou mal formés, ignorés. */
  failed: string[];
}

/**
 * Choisit la clé : celle de System.json si elle redonne bien un PNG, sinon
 * celle déduite de la première image (certains jeux mettent une clé
 * factice dans System.json).
 */
export function chooseKey(webDir: string, assets: string[]): { key: Buffer; source: 'system' | 'image' } {
  const declared = keyFromSystemJson(webDir);
  const png = assets.find(a => decryptedName(a).toLowerCase().endsWith('.png'));
  if (png) {
    const data = fs.readFileSync(path.join(webDir, png));
    if (declared && decryptAsset(data.subarray(0, HEADER_LENGTH + 16), declared).equals(PNG_START)) return { key: declared, source: 'system' };
    const recovered = keyFromEncryptedPng(data);
    if (recovered) return { key: recovered, source: 'image' };
  }
  if (declared) return { key: declared, source: 'system' };
  throw new Error(tm('Clé de chiffrement introuvable (ni dans data/System.json, ni déductible d’une image).'));
}

/**
 * Déchiffre toutes les ressources de `webDir` dans `outDir`. Un fichier
 * déjà extrait est réécrit (le jeu a pu être mis à jour).
 */
export async function extractRpgMakerAssets(
  webDir: string,
  outDir: string,
  onProgress?: (done: number, total: number) => void
): Promise<AssetExtraction> {
  const assets = listEncryptedAssets(webDir);
  if (assets.length === 0) throw new Error(tm("Aucune ressource chiffrée dans ce jeu (images et sons sont déjà lisibles)."));
  const { key, source } = chooseKey(webDir, assets);
  const failed: string[] = [];
  let files = 0;
  let done = 0;
  // Dossiers créés une fois chacun, avant les écritures.
  for (const dir of new Set(assets.map(a => path.dirname(path.join(outDir, decryptedName(a)))))) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
  // Plusieurs fichiers à la fois : sous Windows, chaque écriture attend
  // surtout l'antivirus, pas le disque.
  let next = 0;
  const worker = async () => {
    while (next < assets.length) {
      const relative = assets[next++];
      try {
        const data = await fs.promises.readFile(path.join(webDir, relative));
        await fs.promises.writeFile(path.join(outDir, decryptedName(relative)), decryptAsset(data, key));
        files++;
      } catch {
        failed.push(relative);
      }
      done++;
      if (onProgress && (done % 25 === 0 || done === assets.length)) onProgress(done, assets.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(EXTRACT_CONCURRENCY, assets.length) }, worker));
  return { files, keySource: source, failed: failed.sort() };
}
