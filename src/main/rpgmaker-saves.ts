import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import LZString from 'lz-string';
import type { RpgSaveData, RpgSaveEntry, RpgSavePatch, RpgSaveSlot } from '../shared/ipc-types';
import { tm } from './i18n';

/**
 * Éditeur de sauvegardes RPG Maker MV/MZ (`<web>/save/fileN.rpgsave` /
 * `.rmmzsave`) : or, objets, armes, armures, variables et interrupteurs.
 *
 * Formats (lus dans rpg_managers.js / rmmz_managers.js) :
 * - MV : `LZString.compressToBase64(JSON)` en texte ;
 * - MZ : `pako.deflate(JSON, { to: "string" })`, chaîne binaire écrite par
 *   `fs.writeFileSync` sans encodage, donc en UTF-8 : chaque octet du flux
 *   zlib devient un caractère, relu en UTF-8 puis ramené en octets (latin1).
 * Le JSON est celui de JsonEx : `@` (classe), `@c` / `@r` (références, MV),
 * et en MV les tableaux sont enveloppés (`{ "@c": n, "@a": [...] }`). Tout
 * est conservé tel quel : seules les valeurs modifiées changent.
 *
 * Aucune écriture sans copie préalable des sauvegardes (faite par l'appelant,
 * voir le handler `write-rpgmaker-save`).
 */

export type RpgSaveFormat = 'mv' | 'mz';

const SLOT_FILE = /^file(\d+)\.(rpgsave|rmmzsave)$/i;

export const RPG_SAVE_LIMITS = {
  gold: 999_999_999,
  count: 9999,
  maxId: 100_000,
  stringLength: 2000
};

export function saveFormat(file: string): RpgSaveFormat | null {
  const match = SLOT_FILE.exec(file);
  if (!match) return null;
  return match[2].toLowerCase() === 'rpgsave' ? 'mv' : 'mz';
}

export function decodeSave(raw: Buffer, format: RpgSaveFormat): unknown {
  const text = raw.toString('utf8');
  if (format === 'mv') {
    const json = LZString.decompressFromBase64(text);
    if (!json) throw new Error(tm('Sauvegarde illisible.'));
    return JSON.parse(json);
  }
  return JSON.parse(zlib.inflateSync(Buffer.from(text, 'latin1')).toString('utf8'));
}

export function encodeSave(data: unknown, format: RpgSaveFormat): Buffer {
  const json = JSON.stringify(data);
  if (format === 'mv') return Buffer.from(LZString.compressToBase64(json), 'utf8');
  return Buffer.from(zlib.deflateSync(Buffer.from(json, 'utf8'), { level: 1 }).toString('latin1'), 'utf8');
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Tableau d'un champ JsonEx (enveloppé `@a` en MV) ; null si absent ou référence `@r`. */
function arrayOf(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (isObject(value) && Array.isArray(value['@a'])) return value['@a'] as unknown[];
  return null;
}

/** Objet `{ id: quantité }` du groupe (hors clés JsonEx `@…`) ; null si absent ou référence. */
function countsOf(value: unknown): Json | null {
  if (!isObject(value) || '@r' in value) return null;
  return value;
}

interface Database {
  items: string[];
  weapons: string[];
  armors: string[];
  variables: string[];
  switches: string[];
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Noms de la base du jeu (`data/*.json`) ; listes vides si illisibles (base chiffrée par un plugin). */
export function readDatabase(webDir: string): Database {
  const names = (file: string): string[] => {
    const data = readJson(path.join(webDir, 'data', file));
    return Array.isArray(data) ? data.map(entry => (isObject(entry) && typeof entry.name === 'string' ? entry.name : '')) : [];
  };
  const system = readJson(path.join(webDir, 'data', 'System.json'));
  const systemList = (key: string): string[] =>
    isObject(system) && Array.isArray(system[key]) ? (system[key] as unknown[]).map(v => (typeof v === 'string' ? v : '')) : [];
  return {
    items: names('Items.json'),
    weapons: names('Weapons.json'),
    armors: names('Armors.json'),
    variables: systemList('variables'),
    switches: systemList('switches')
  };
}

/** Emplacements de sauvegarde (`fileN`), du plus récent au plus ancien ; `file0` = sauvegarde auto (MZ). */
export function listSaveSlots(saveDir: string): RpgSaveSlot[] {
  let names: string[];
  try {
    names = fs.readdirSync(saveDir);
  } catch {
    return [];
  }
  return names
    .filter(name => SLOT_FILE.test(name))
    .map(name => {
      const stat = fs.statSync(path.join(saveDir, name));
      return { file: name, slot: Number(SLOT_FILE.exec(name)![1]), modified: stat.mtime.toISOString(), size: stat.size };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

function slotPath(saveDir: string, file: string): { full: string; format: RpgSaveFormat } {
  const format = typeof file === 'string' ? saveFormat(file) : null;
  if (!format || path.basename(file) !== file) throw new Error(tm('Sauvegarde invalide.'));
  return { full: path.join(saveDir, file), format };
}

function countEntries(names: string[], owned: Json | null): RpgSaveEntry<number>[] {
  const ids = new Set<number>();
  names.forEach((name, id) => name.trim() && id > 0 && ids.add(id));
  for (const key of Object.keys(owned ?? {})) if (/^\d+$/.test(key)) ids.add(Number(key));
  return [...ids].sort((a, b) => a - b).map(id => {
    const value = owned?.[String(id)];
    return { id, name: names[id] ?? '', value: typeof value === 'number' ? value : 0 };
  });
}

/** Ce que l'éditeur affiche d'une sauvegarde : valeurs actuelles et noms de la base. */
export function describeSave(data: unknown, db: Database, file: string): RpgSaveData {
  if (!isObject(data) || !isObject(data.party)) throw new Error(tm("Ce fichier n'est pas une sauvegarde RPG Maker MV/MZ."));
  const party = data.party;
  const variables = arrayOf(isObject(data.variables) ? data.variables._data : null) ?? [];
  const switches = arrayOf(isObject(data.switches) ? data.switches._data : null) ?? [];
  const varCount = Math.max(db.variables.length, variables.length);
  const switchCount = Math.max(db.switches.length, switches.length);
  return {
    file,
    gold: typeof party._gold === 'number' ? party._gold : 0,
    items: countEntries(db.items, countsOf(party._items)),
    weapons: countEntries(db.weapons, countsOf(party._weapons)),
    armors: countEntries(db.armors, countsOf(party._armors)),
    variables: Array.from({ length: Math.max(0, varCount - 1) }, (_, i) => {
      const value = variables[i + 1];
      return { id: i + 1, name: db.variables[i + 1] ?? '', value: typeof value === 'number' || typeof value === 'string' ? value : null };
    }),
    switches: Array.from({ length: Math.max(0, switchCount - 1) }, (_, i) => ({
      id: i + 1,
      name: db.switches[i + 1] ?? '',
      value: switches[i + 1] === true
    }))
  };
}

const validId = (key: string): number | null => {
  const id = Number(key);
  return Number.isInteger(id) && id >= 1 && id <= RPG_SAVE_LIMITS.maxId ? id : null;
};

const clampInt = (value: unknown, max: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : null;

/** Applique les modifications (valeurs du renderer, vérifiées ici) ; refuse un champ introuvable. */
export function applySavePatch(data: unknown, patch: RpgSavePatch): void {
  if (!isObject(data) || !isObject(data.party)) throw new Error(tm("Ce fichier n'est pas une sauvegarde RPG Maker MV/MZ."));
  const party = data.party;
  if (patch.gold !== undefined) {
    const gold = clampInt(patch.gold, RPG_SAVE_LIMITS.gold);
    if (gold === null) throw new Error(tm('Valeur invalide.'));
    party._gold = gold;
  }
  for (const group of ['items', 'weapons', 'armors'] as const) {
    const changes = patch[group];
    if (!changes) continue;
    const owned = countsOf(party[`_${group}`]);
    if (!owned) throw new Error(tm('Champ introuvable dans cette sauvegarde : {field}', { field: group }));
    for (const [key, value] of Object.entries(changes)) {
      const id = validId(key);
      const count = clampInt(value, RPG_SAVE_LIMITS.count);
      if (id === null || count === null) throw new Error(tm('Valeur invalide.'));
      // Comme Game_Party.gainItem : une quantité nulle retire l'entrée.
      if (count === 0) delete owned[String(id)];
      else owned[String(id)] = count;
    }
  }
  const editArray = (holder: unknown, field: string, changes: Record<string, unknown>, accept: (v: unknown) => unknown) => {
    const values = arrayOf(isObject(holder) ? holder._data : null);
    if (!values) throw new Error(tm('Champ introuvable dans cette sauvegarde : {field}', { field }));
    for (const [key, raw] of Object.entries(changes)) {
      const id = validId(key);
      const value = accept(raw);
      if (id === null || value === undefined) throw new Error(tm('Valeur invalide.'));
      while (values.length <= id) values.push(null);
      values[id] = value;
    }
  };
  if (patch.variables) {
    editArray(data.variables, 'variables', patch.variables, v =>
      typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.length <= RPG_SAVE_LIMITS.stringLength ? v : undefined
    );
  }
  if (patch.switches) {
    editArray(data.switches, 'switches', patch.switches, v => (typeof v === 'boolean' ? v : undefined));
  }
}

export function readSave(saveDir: string, webDir: string, file: string): RpgSaveData {
  const { full, format } = slotPath(saveDir, file);
  return describeSave(decodeSave(fs.readFileSync(full), format), readDatabase(webDir), file);
}

/** Réécrit la sauvegarde modifiée (`.tmp` puis renommage). La copie de sécurité est à faire avant. */
export function writeSave(saveDir: string, webDir: string, file: string, patch: RpgSavePatch): RpgSaveData {
  const { full, format } = slotPath(saveDir, file);
  const data = decodeSave(fs.readFileSync(full), format);
  applySavePatch(data, patch);
  const encoded = encodeSave(data, format);
  // Relu avant d'écrire : un fichier que le jeu ne saurait pas relire ne remplace jamais l'original.
  JSON.stringify(decodeSave(encoded, format));
  fs.writeFileSync(`${full}.tmp`, encoded);
  fs.renameSync(`${full}.tmp`, full);
  return describeSave(data, readDatabase(webDir), file);
}
