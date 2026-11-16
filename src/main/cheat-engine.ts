import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { CheatTable, CheatTableContent, CheatTableEntry } from '../shared/ipc-types';

/**
 * Cheat Engine (Windows) : DLSGM ne fait que l'ouvrir avec une table (.CT).
 * Les tables d'un jeu vivent dans `<travaux>/<ID>/cheat-tables/` — hors du
 * dossier du jeu, comme tout le dossier de travaux : jamais envoyées en
 * partage LAN, jamais touchées par les patchs, gardées si le jeu est supprimé.
 */

/** Sous-dossier du dossier de travaux d'un jeu. */
export const CHEAT_TABLES_DIR = 'cheat-tables';

// `Cheat Engine.exe` est le lanceur (choisit 64 bits / SSE4-AVX2 / 32 bits) :
// c'est lui que vise l'association de fichier .CT (`"Cheat Engine.exe" "%1"`).
const CE_EXECUTABLES = ['Cheat Engine.exe', 'cheatengine-x86_64.exe', 'cheatengine-x86_64-SSE4-AVX2.exe', 'cheatengine-i386.exe'];

// Une table fait quelques Ko à quelques Mo (scripts Lua, structures) : au-delà, ce n'en est pas une.
export const MAX_CHEAT_TABLE_BYTES = 64 * 1024 * 1024;

const RESERVED_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

/** Exécutable de Cheat Engine dans ce dossier, ou null. */
export function findCheatEngine(dir: string): string | null {
  if (!dir || !path.isAbsolute(dir)) return null;
  for (const name of CE_EXECUTABLES) {
    const candidate = path.join(dir, name);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Absent : suivant.
    }
  }
  return null;
}

/**
 * Dossiers d'installation habituels (`C:\Program Files\Cheat Engine`,
 * `Cheat Engine 7.5`...), la version la plus récente d'abord : utilisés
 * quand aucun dossier n'est choisi dans les paramètres.
 */
export function installedCheatEngineDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  const bases = [...new Set([env.ProgramW6432, env.ProgramFiles, env['ProgramFiles(x86)']].filter((base): base is string => Boolean(base)))];
  const dirs: string[] = [];
  for (const base of bases) {
    let names: string[];
    try {
      names = fs.readdirSync(base).filter(name => /^cheat ?engine\b/i.test(name));
    } catch {
      continue;
    }
    names.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    dirs.push(...names.map(name => path.join(base, name)));
  }
  return dirs;
}

/** Cheat Engine du dossier choisi ; sans dossier choisi, celui d'une installation habituelle. */
export function resolveCheatEngine(configured: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (configured) return findCheatEngine(configured);
  for (const dir of installedCheatEngineDirs(env)) {
    const found = findCheatEngine(dir);
    if (found) return found;
  }
  return null;
}

/** Nom de fichier de table acceptable : un simple nom en `.CT`, sans chemin ni nom réservé de Windows. */
export function isCheatTableName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length <= 200 &&
    /\.ct$/i.test(name) &&
    !/[\\/:*?"<>|\x00-\x1f]/.test(name) &&
    !name.startsWith('.') &&
    !/[. ]$/.test(name) &&
    !RESERVED_NAMES.test(name) &&
    path.basename(name) === name
  );
}

/** Tables du dossier, les plus récentes d'abord (dossier absent : aucune). */
export async function listCheatTables(dir: string): Promise<CheatTable[]> {
  let dirents: fs.Dirent[];
  try {
    dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const tables: CheatTable[] = [];
  for (const dirent of dirents) {
    if (!dirent.isFile() || !isCheatTableName(dirent.name)) continue;
    const stat = await fs.promises.stat(path.join(dir, dirent.name)).catch(() => null);
    if (stat) tables.push({ name: dirent.name, size: stat.size, modified: stat.mtime.toISOString() });
  }
  return tables.sort((a, b) => b.modified.localeCompare(a.modified));
}

/** `nom.CT`, sinon `nom (2).CT`, `nom (3).CT`... : jamais d'écrasement d'une table existante. */
export function freeTableName(existing: Set<string>, name: string): string {
  const taken = (candidate: string) => existing.has(candidate.toLowerCase());
  if (!taken(name)) return name;
  const ext = path.extname(name);
  const stem = name.slice(0, -ext.length);
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken(candidate)) return candidate;
  }
}

export interface CheatTableImport {
  imported: string[];
  /** Fichiers refusés (pas une table .CT, trop gros, illisibles), par nom. */
  skipped: string[];
}

/**
 * Copie des tables choisies dans le dossier du jeu (créé au besoin), sous
 * un nom libre. Écrit en `.tmp` puis renommé : pas de table à moitié copiée.
 */
export async function importCheatTables(dir: string, sources: string[]): Promise<CheatTableImport> {
  const result: CheatTableImport = { imported: [], skipped: [] };
  await fs.promises.mkdir(dir, { recursive: true });
  const existing = new Set((await fs.promises.readdir(dir)).map(name => name.toLowerCase()));
  for (const source of sources) {
    const base = path.basename(source);
    try {
      const stat = await fs.promises.stat(source);
      if (!stat.isFile() || !isCheatTableName(base) || stat.size > MAX_CHEAT_TABLE_BYTES) {
        result.skipped.push(base);
        continue;
      }
      const name = freeTableName(existing, base);
      const target = path.join(dir, name);
      const tmp = `${target}.tmp`;
      await fs.promises.copyFile(source, tmp);
      await fs.promises.rename(tmp, target);
      existing.add(name.toLowerCase());
      result.imported.push(name);
    } catch (error) {
      console.error(`Import de la table ${source} impossible :`, error);
      result.skipped.push(base);
    }
  }
  return result;
}

// --- Session : Cheat Engine attaché au jeu, table enregistrée toute seule ---
//
// DLSGM n'ouvre pas la table du jeu elle-même mais une *copie de session*
// (userData) : la même table, plus un bloc Lua qui attache Cheat Engine au
// processus du jeu et réécrit la vraie table — sans ce bloc — à chaque
// changement et à la fermeture. Vérifié avec Cheat Engine 7.5 :
//  - `loadTable` appelé depuis Lua passe par ceshare (autorun de CE), qui lève
//    une erreur quand il n'est pas configuré : d'où la copie ouverte en ligne
//    de commande plutôt qu'une table « lanceur » qui chargerait la vraie ;
//  - Cheat Engine demande « Execute this lua script? » à l'ouverture (réglage
//    de CE, pas contournable d'ici) ;
//  - `MainForm.OnCloseQuery` est ce qui pose « Save now? » : remplacé tant que
//    l'enregistrement automatique tourne, puisque tout est déjà écrit.

export const SESSION_BEGIN = '-- DLSGM:BEGIN';
export const SESSION_END = '-- DLSGM:END';
/** Sous-dossier de `cheat-tables/` : copies d'une table prises avant chaque ouverture. */
export const TABLE_BACKUPS_DIR = '.backups';
const MAX_TABLE_BACKUPS = 5;

export const EMPTY_CHEAT_TABLE = '<?xml version="1.0" encoding="utf-8"?>\n<CheatTable>\n  <CheatEntries/>\n</CheatTable>\n';

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Chaîne longue Lua (`[==[…]==]`) : aucun échappement, donc rien qui puisse la fermer. */
function luaString(value: string): string {
  if (/]==]|[\r\n\0]/.test(value)) throw new Error('Valeur impossible à passer à Cheat Engine.');
  return `[==[${value}]==]`;
}

export interface CheatSessionOptions {
  /** Processus du jeu, ou 0 s'il n'est pas encore lancé. */
  pid: number;
  /** Noms d'exécutables du jeu (`Game.exe`) : attendus quand le PID manque ou a disparu. */
  processNames: string[];
  /** La vraie table, réécrite par Cheat Engine. */
  tablePath: string;
  intervalMs?: number;
}

/** Bloc Lua de session (entre marqueurs, pour être retiré de ce qui est enregistré). */
export function sessionScript({ pid, processNames, tablePath, intervalMs = 3000 }: CheatSessionOptions): string {
  return `${SESSION_BEGIN}
do
local pid = ${Number.isInteger(pid) && pid > 0 ? pid : 0}
local names = { ${processNames.map(luaString).join(', ')} }
local tablePath = ${luaString(tablePath)}
-- Marqueurs recomposés : écrits tels quels ici, ils couperaient ce script au mauvais endroit.
local BEGIN, END = '-- DLSGM' .. ':BEGIN', '-- DLSGM' .. ':END'
local lastSaved = nil -- nil : rien n'est enregistré

local function serialize()
  local stream = createStringStream('')
  local ok = pcall(saveTable, stream)
  local xml = ok and stream.DataString or nil
  stream.destroy()
  if xml == nil or xml == '' then return nil end
  local from = string.find(xml, BEGIN, 1, true)
  local last, search = nil, 1
  while true do
    local _, found = string.find(xml, END, search, true)
    if not found then break end
    last = found
    search = found + 1
  end
  if from and last and last > from then
    -- Avec le saut de ligne qui suit le bloc, sinon il s'en ajouterait un à chaque ouverture.
    xml = string.sub(xml, 1, from - 1) .. string.gsub(string.sub(xml, last + 1), '^\\r?\\n', '', 1)
  end
  xml = string.gsub(xml, '%s*<LuaScript>%s*</LuaScript>', '')
  return xml
end

local function autosave()
  if lastSaved == nil then return end
  local xml = serialize()
  if xml == nil or xml == lastSaved then return end
  local out = createMemoryStream()
  out.writeString(xml)
  local ok = out.saveToFileNoError(tablePath)
  out.destroy()
  if ok then lastSaved = xml end
end

local function attach()
  if pid > 0 and getProcessList()[pid] ~= nil then openProcess(pid) return true end
  for _, name in ipairs(names) do
    local found = getProcessIDFromProcessName(name)
    if found and found ~= 0 then openProcess(found) return true end
  end
  return false
end

local start = createTimer(nil)
start.Interval = 200
start.OnTimer = function(first)
  first.destroy()
  if not attach() then
    -- Jeu pas encore lancé (table ouverte avec le jeu) : attendu deux minutes.
    local tries = 0
    local wait = createTimer(nil)
    wait.Interval = 1000
    wait.OnTimer = function(w)
      tries = tries + 1
      if getOpenedProcessID() ~= 0 or attach() or tries >= 120 then w.destroy() end
    end
  end
  lastSaved = serialize()
  if lastSaved == nil then return end
  local timer = createTimer(nil)
  timer.Interval = ${Math.max(1000, Math.round(intervalMs))}
  timer.OnTimer = autosave
  -- Une autre table chargée ensuite n'est pas celle du jeu : elle ne doit pas l'écraser.
  local previousOnTableLoad = onTableLoad
  function onTableLoad(before)
    if previousOnTableLoad then pcall(previousOnTableLoad, before) end
    if not before and lastSaved ~= nil then
      lastSaved = nil
      timer.destroy()
    end
  end
  local previousCloseQuery = MainForm.OnCloseQuery
  MainForm.OnCloseQuery = function(sender)
    if lastSaved == nil then
      if previousCloseQuery then return previousCloseQuery(sender) end
      return true
    end
    pcall(autosave)
    return true
  end
end
end
${SESSION_END}
`;
}

/** Table sans le bloc de session (ni l'élément `<LuaScript>` s'il ne reste rien dedans). */
export function stripSessionScript(xml: string): string {
  const from = xml.indexOf(SESSION_BEGIN);
  const to = xml.lastIndexOf(SESSION_END);
  const stripped = from !== -1 && to > from ? xml.slice(0, from) + xml.slice(to + SESSION_END.length).replace(/^\r?\n/, '') : xml;
  return stripped.replace(/\s*<LuaScript>\s*<\/LuaScript>/, '').replace(/\s*<LuaScript\s*\/>/, '');
}

/** Une table entière : un fichier coupé en pleine écriture n'a pas sa balise de fin. */
export function isCompleteTable(xml: string): boolean {
  return /<CheatTable[\s>]/.test(xml) && /<\/CheatTable>\s*$/.test(xml);
}

/**
 * La table avec le bloc de session en tête de son script Lua (avant celui de
 * l'auteur : une erreur dans le sien n'empêche pas le nôtre).
 */
export function buildSessionTable(xml: string, lua: string): string {
  const clean = stripSessionScript(xml);
  const script = escapeXml(lua);
  const open = clean.indexOf('<LuaScript>');
  if (open !== -1) {
    const at = open + '<LuaScript>'.length;
    return clean.slice(0, at) + script + clean.slice(at);
  }
  const close = clean.lastIndexOf('</CheatTable>');
  if (close === -1) throw new Error('Table Cheat Engine invalide.');
  return `${clean.slice(0, close)}  <LuaScript>${script}</LuaScript>\n${clean.slice(close)}`;
}

function listTableBackups(dir: string, name: string): string[] {
  const prefix = `${name}.`;
  try {
    return fs
      .readdirSync(path.join(dir, TABLE_BACKUPS_DIR))
      .filter(file => file.startsWith(prefix) && file.endsWith('.bak'))
      .sort();
  } catch {
    return [];
  }
}

/** Copie de la table avant ouverture (rien si elle est identique à la dernière) ; les 5 dernières sont gardées. */
export function backupCheatTable(dir: string, name: string, content: string, now = new Date()): void {
  const backupsDir = path.join(dir, TABLE_BACKUPS_DIR);
  const backups = listTableBackups(dir, name);
  const latest = backups[backups.length - 1];
  if (latest && fs.readFileSync(path.join(backupsDir, latest), 'utf8') === content) return;
  fs.mkdirSync(backupsDir, { recursive: true });
  const file = `${name}.${now.toISOString().replace(/[:.]/g, '-')}.bak`;
  fs.writeFileSync(path.join(backupsDir, `${file}.tmp`), content, 'utf8');
  fs.renameSync(path.join(backupsDir, `${file}.tmp`), path.join(backupsDir, file));
  for (const old of [...backups, file].slice(0, -MAX_TABLE_BACKUPS)) fs.rmSync(path.join(backupsDir, old), { force: true });
}

/**
 * Prépare l'ouverture d'une table du jeu : copie de secours, puis copie de
 * session dans `sessionDir`. Une table coupée (Cheat Engine tué en pleine
 * écriture) est d'abord remplacée par sa dernière copie de secours — l'abîmée
 * est gardée en `.broken`. Renvoie le chemin à donner à Cheat Engine.
 */
export function prepareCheatSession(dir: string, name: string, sessionDir: string, options: Omit<CheatSessionOptions, 'tablePath'>): string {
  const tablePath = path.join(dir, name);
  let xml = fs.readFileSync(tablePath, 'utf8').replace(/^\uFEFF/, '');
  if (!isCompleteTable(xml)) {
    const backups = listTableBackups(dir, name);
    const latest = backups[backups.length - 1];
    if (!latest) throw new Error('Table Cheat Engine illisible.');
    fs.copyFileSync(tablePath, `${tablePath}.broken`);
    xml = fs.readFileSync(path.join(dir, TABLE_BACKUPS_DIR, latest), 'utf8');
    fs.writeFileSync(`${tablePath}.tmp`, xml, 'utf8');
    fs.renameSync(`${tablePath}.tmp`, tablePath);
  }
  backupCheatTable(dir, name, xml);
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, name);
  fs.writeFileSync(sessionPath, buildSessionTable(xml, sessionScript({ ...options, tablePath })), 'utf8');
  return sessionPath;
}

/**
 * Table ouverte par le bouton de l'overlay : celle « au lancement » si elle
 * existe, sinon la plus récente, sinon une table vide `<ID>.CT` créée ici.
 */
export async function defaultCheatTable(dir: string, gameId: string, preferred: string | undefined): Promise<string> {
  if (preferred && cheatTablePath(dir, preferred)) return preferred;
  const tables = await listCheatTables(dir);
  if (tables.length > 0) return tables[0].name;
  const name = `${gameId}.CT`;
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, name), EMPTY_CHEAT_TABLE, { encoding: 'utf8', flag: 'wx' });
  return name;
}

export interface GameProcess {
  pid: number;
  hasWindow: boolean;
  memory: number;
}

/** Processus auquel attacher Cheat Engine : celui qui a une fenêtre, sinon le plus gros en mémoire. */
export function pickGameProcess(processes: GameProcess[]): number {
  const sorted = [...processes].sort((a, b) => Number(b.hasWindow) - Number(a.hasWindow) || b.memory - a.memory);
  return sorted[0]?.pid ?? 0;
}

/** `pid|handle de fenêtre|mémoire` par ligne → processus. */
export function parseGameProcesses(stdout: string): GameProcess[] {
  const processes: GameProcess[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^(\d+)\|(-?\d+)\|(\d+)$/.exec(line.trim());
    if (match) processes.push({ pid: Number(match[1]), hasWindow: match[2] !== '0', memory: Number(match[3]) });
  }
  return processes;
}

/** PID du processus du jeu (exécutable dans `gameDir`) à donner à Cheat Engine, ou 0. */
export async function findGamePid(gameDir: string): Promise<number> {
  return pickGameProcess(await listGameProcessInfo(gameDir));
}

/** Processus dont l'exécutable est dans `gameDir`, avec fenêtre et mémoire (PowerShell). */
export function listGameProcessInfo(gameDir: string): Promise<GameProcess[]> {
  const dir = gameDir.endsWith(path.sep) ? gameDir : gameDir + path.sep;
  const b64 = Buffer.from(dir, 'utf8').toString('base64');
  const script =
    `$d = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'));` +
    `Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($d, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { "$($_.Id)|$([int64]$_.MainWindowHandle)|$($_.WorkingSet64)" }`;
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, encoding: 'utf8' }, (error, stdout) => {
      resolve(error ? [] : parseGameProcesses(stdout));
    });
  });
}

// --- Lecture d'une table : ses entrées, pour la page du jeu ---

/** Entrées gardées pour l'affichage : au-delà, la liste est coupée (`total` dit combien il y en a). */
export const MAX_SHOWN_ENTRIES = 500;
const MAX_ENTRY_DEPTH = 12;

/**
 * Entrées d'une table (XML de Cheat Engine), en arbre. Lecture seule et sans
 * rien exécuter : descriptions, types, adresses et offsets tels qu'écrits.
 * Le bloc de session de DLSGM ne compte pas comme script Lua de la table.
 */
export function parseCheatTable(xml: string): CheatTableContent | null {
  if (!isCompleteTable(xml)) return null;
  const $ = cheerio.load(stripSessionScript(xml), { xmlMode: true });
  const root = $('CheatTable').first();
  if (root.length === 0) return null;
  let total = 0;
  let kept = 0;
  const text = (entry: Element, tag: string) => $(entry).children(tag).first().text().trim();
  const read = (parent: Element, depth: number): CheatTableEntry[] => {
    const entries: CheatTableEntry[] = [];
    for (const entry of $(parent).children('CheatEntries').children('CheatEntry').toArray()) {
      total++;
      const keep = kept < MAX_SHOWN_ENTRIES && depth < MAX_ENTRY_DEPTH;
      if (keep) kept++;
      const type = text(entry, 'VariableType');
      const script = $(entry).children('AssemblerScript').length > 0;
      const offsets = $(entry).children('Offsets').children('Offset').toArray().map(offset => $(offset).text().trim());
      const address = text(entry, 'Address');
      const node: CheatTableEntry = {
        description: text(entry, 'Description').replace(/^"([\s\S]*)"$/, '$1').slice(0, 300),
        type: script ? '' : type.slice(0, 40),
        // Offsets écrits du dernier niveau au premier, comme dans Cheat Engine : [[base+o2]+o1].
        address: script ? '' : [address, ...offsets.reverse()].filter(Boolean).join(' → ').slice(0, 300),
        value: ($(entry).children('LastState').attr('Value') ?? '').slice(0, 100),
        kind: script ? 'script' : address ? 'value' : 'group',
        children: []
      };
      // Les sous-entrées sont toujours comptées, même quand l'entrée n'est plus gardée.
      const children = read(entry, depth + 1);
      if (keep) {
        node.children = children;
        entries.push(node);
      }
    }
    return entries;
  };
  const entries = read(root.get(0)!, 0);
  return { entries, total, truncated: total > kept, hasLua: root.children('LuaScript').text().trim().length > 0 };
}

/** Entrées d'une table du dossier, ou null (nom refusé, fichier absent, trop gros ou illisible). */
export async function readCheatTable(dir: string, name: unknown): Promise<CheatTableContent | null> {
  const file = cheatTablePath(dir, name);
  if (!file) return null;
  try {
    const stat = await fs.promises.stat(file);
    if (stat.size > MAX_CHEAT_TABLE_BYTES) return null;
    return parseCheatTable((await fs.promises.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

/** Chemin d'une table du dossier, ou null si le nom n'en est pas une ou si elle n'existe pas. */
export function cheatTablePath(dir: string, name: unknown): string | null {
  if (!isCheatTableName(name)) return null;
  const full = path.join(dir, name);
  if (path.dirname(full) !== path.resolve(dir)) return null;
  try {
    return fs.statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}
