import fs from 'fs';
import path from 'path';
import type { InstallInfo } from '../shared/ipc-types';

/**
 * Indices tirés des noms de dossiers et d'archives tels qu'on les trouve en
 * pratique (`[RJ01234567] Titre v1.2`, `site.com_RJ01234567_Ver1.03.rar`,
 * `RJ01234567_DLC同梱`...) : ID DLsite, version, DLC inclus, et mots de
 * passe probables d'une archive chiffrée.
 *
 * Version et DLC sont rangés dans `<jeu>/.dlsgm/install.json` : ils
 * décrivent les fichiers installés, pas la fiche DLsite.
 */

const GAME_ID_IN_TEXT = /(?:^|[^A-Za-z0-9])([A-Za-z]{2}\d{6,9})(?![0-9])/;
const GAME_ID_IN_TEXT_ALL = new RegExp(GAME_ID_IN_TEXT.source, 'g');
// v1.2, ver1.02, Ver.1.0.3, version 2, v1_02 — jamais au milieu d'un mot.
const VERSION = /(?:^|[^A-Za-z0-9])v(?:er(?:sion)?)?[\s.]?(\d+(?:[._]\d+)*[a-z]?)(?![A-Za-z0-9])/i;
const DLC = /(?:^|[^A-Za-z])dlc(?![A-Za-z])|追加コンテンツ|同梱|込み|全部入り/i;

export function gameIdFromName(name: string): string | null {
  const match = GAME_ID_IN_TEXT.exec(name);
  return match ? match[1].toUpperCase() : null;
}

/** Tous les IDs distincts d'un texte, dans l'ordre d'apparition. */
export function gameIdsIn(text: string): string[] {
  return [...new Set([...text.matchAll(GAME_ID_IN_TEXT_ALL)].map(m => m[1].toUpperCase()))];
}

export interface ReleaseName {
  gameId: string | null;
  version: string | null;
  dlc: boolean;
}

/** Nom d'archive ou de dossier → ID, version (`1.02`, sans le « v ») et DLC inclus. */
export function parseReleaseName(name: string): ReleaseName {
  // Extensions d'archive retirées : `.part1` ne doit pas passer pour une version.
  const base = name.replace(/(\.part\d+)?\.(zip|rar|7z|exe)$/i, '');
  const version = VERSION.exec(base);
  return {
    gameId: gameIdFromName(base),
    version: version ? version[1].replace(/_/g, '.') : null,
    dlc: DLC.test(base)
  };
}

/** Plusieurs noms (archive, archive interne, dossiers) : la première version trouvée, DLC si l'un le dit. */
export function mergeReleaseNames(names: string[]): Omit<ReleaseName, 'gameId'> {
  const parsed = names.map(parseReleaseName);
  return { version: parsed.find(p => p.version)?.version ?? null, dlc: parsed.some(p => p.dlc) };
}

// --- Mots de passe probables ---------------------------------------------

// Mot-clé puis « : » ou « = » (obligatoire : « passage » n'annonce rien) ; formes longues d'abord.
const PASSWORD_LINE = /(?:解凍パスワード|パスワード|解凍キー|解凍パス|password|passwd|pass|pwd|pw|密码|密碼)\s*[:：=＝]\s*["'「]?([^\s"'」]{1,128})/i;
// Fichiers lus pour y chercher un mot de passe (petits fichiers texte seulement).
const HINT_FILE = /\.(txt|url|nfo|md|html?)$/i;
const MAX_HINT_FILE_BYTES = 64 * 1024;

/**
 * Mots de passe probables d'après le nom de l'archive : le site qui la
 * diffuse (`[site.com]_RJ..._v1.rar`, `site.com_RJ....rar`) sert souvent
 * de mot de passe.
 */
export function passwordsFromArchiveName(name: string): string[] {
  const base = name.replace(/(\.part\d+)?\.(zip|rar|7z|exe)$/i, '');
  const idIndex = base.search(GAME_ID_IN_TEXT);
  const prefix = (idIndex > 0 ? base.slice(0, idIndex + 1) : '').replace(/^[\s[(【]+|[\s\])】_\-.]+$/g, '');
  if (!prefix) return [];
  const candidates = [prefix];
  const domain = /([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/.exec(prefix)?.[1];
  if (domain && domain !== prefix) candidates.push(domain);
  if (domain?.startsWith('www.')) candidates.push(domain.slice(4));
  return candidates;
}

/** Mots de passe annoncés dans un texte (« password: xxx », « 解凍パスワード：xxx »). */
export function passwordsFromText(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = PASSWORD_LINE.exec(line);
    if (match) out.push(match[1]);
  }
  return out;
}

/** Contenu d'un fichier texte : UTF-8 (BOM compris), sinon Shift-JIS. */
function readText(file: string): string {
  const raw = fs.readFileSync(file);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    return new TextDecoder('shift_jis').decode(raw);
  }
}

/**
 * Mots de passe probables dans les petits fichiers texte d'un dossier (à sa
 * racine) : `password.txt`, `readme.txt`... Un fichier nommé « pass… » qui
 * ne contient qu'une ligne est pris tel quel.
 */
export function passwordsFromFolder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !HINT_FILE.test(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (fs.statSync(file).size > MAX_HINT_FILE_BYTES) continue;
    const text = readText(file);
    out.push(...passwordsFromText(text));
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (/pass|パス/i.test(entry.name) && lines.length === 1 && lines[0].length <= 128 && !/\s/.test(lines[0])) out.push(lines[0]);
  }
  return out;
}

// --- .dlsgm/install.json --------------------------------------------------

const INSTALL_FILE = path.join('.dlsgm', 'install.json');

export function readInstallInfo(gameDir: string): InstallInfo | null {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(gameDir, INSTALL_FILE), 'utf8')) as Partial<InstallInfo>;
    if (typeof data.source !== 'string') return null;
    return {
      source: data.source,
      version: typeof data.version === 'string' ? data.version : null,
      dlc: data.dlc === true,
      date: typeof data.date === 'string' ? data.date : ''
    };
  } catch {
    return null;
  }
}

/** Enregistre d'où viennent les fichiers du jeu (archive ou ancien nom du dossier), avec version et DLC. */
export function writeInstallInfo(gameDir: string, info: InstallInfo): void {
  const file = path.join(gameDir, INSTALL_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(info, null, 2));
}
