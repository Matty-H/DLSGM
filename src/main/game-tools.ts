import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { extractZip } from './zip-extract';
import type { EngineInfo, GameEngine, InstalledPatch, SaveLocation } from '../shared/ipc-types';
import { tm } from './i18n';

/**
 * Outils par jeu : détection du moteur, emplacements de sauvegarde, et
 * patchs réversibles (BepInEx + XUnity.AutoTranslator, patchs utilisateur
 * type décensure/traduction).
 *
 * Les patchs sont appliqués au "dossier d'installation" du jeu (celui de son
 * exécutable, là où se trouvent par ex. `<Jeu>_Data` pour Unity), et tracés
 * dans `<dossier du jeu>/.dlsgm/` : manifeste + sauvegarde de chaque fichier
 * écrasé. La désinstallation se fait en pile (dernier patch d'abord), ce qui
 * garantit une restauration exacte même si deux patchs touchent les mêmes
 * fichiers.
 */

// Versions épinglées (et non "latest") : un téléchargement ne change pas
// silencieusement de contenu, et chaque archive est vérifiée contre son
// SHA-256 (relevé sur les releases GitHub officielles, champ `digest`).
const BEPINEX_VERSION = '5.4.23.5';
const XUNITY_VERSION = '5.6.2';
const DOWNLOADS: Record<string, { url: string; sha256: string }> = {
  'bepinex-x64': {
    url: `https://github.com/BepInEx/BepInEx/releases/download/v${BEPINEX_VERSION}/BepInEx_win_x64_${BEPINEX_VERSION}.zip`,
    sha256: '82f9878551030f54657792c0740d9d51a09500eeae1fba21106b0c441e6732c4'
  },
  'bepinex-x86': {
    url: `https://github.com/BepInEx/BepInEx/releases/download/v${BEPINEX_VERSION}/BepInEx_win_x86_${BEPINEX_VERSION}.zip`,
    sha256: '37651c79e40d6f909572a4f461ac25350bb3ef8fe7fbd29f1aa8791a33b84c82'
  },
  'xunity-bepinex': {
    url: `https://github.com/bbepis/XUnity.AutoTranslator/releases/download/v${XUNITY_VERSION}/XUnity.AutoTranslator-BepInEx-${XUNITY_VERSION}.zip`,
    sha256: '836a4066b9369b0d23dc1b0ef6336ad7fe7ae16880931259ec4d157aff7a81c0'
  }
};

const META_DIR = '.dlsgm';

// --- Utilitaires fichiers -------------------------------------------------

function exists(p: string): boolean {
  return fs.existsSync(p);
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listDir(p: string): string[] {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

/** Tous les fichiers sous `dir`, en chemins relatifs à `dir`. */
function walkFiles(dir: string, prefix = ''): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(dir, rel));
    else if (entry.isFile()) result.push(rel);
  }
  return result;
}

/** Lit le début d'un fichier (sans charger un .assets de plusieurs Go). */
function readHead(p: string, bytes: number): Buffer | null {
  try {
    const fd = fs.openSync(p, 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      const read = fs.readSync(fd, buffer, 0, bytes, 0);
      return buffer.subarray(0, read);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

/** Architecture d'un exécutable Windows, lue dans l'en-tête PE. */
export function readPeArch(exePath: string): 'x64' | 'x86' | null {
  const head = readHead(exePath, 4096);
  if (!head || head.length < 0x40 || head.toString('ascii', 0, 2) !== 'MZ') return null;
  const peOffset = head.readUInt32LE(0x3c);
  if (peOffset + 6 > head.length || head.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') return null;
  const machine = head.readUInt16LE(peOffset + 4);
  if (machine === 0x8664) return 'x64';
  if (machine === 0x14c) return 'x86';
  return null;
}

// --- Détection du moteur --------------------------------------------------

const ENGINE_LABELS: Record<GameEngine, string> = {
  'unity': 'Unity',
  'rpgmaker-mz': 'RPG Maker MZ',
  'rpgmaker-mv': 'RPG Maker MV',
  'rpgmaker-vxace': 'RPG Maker VX Ace',
  'rpgmaker-vx': 'RPG Maker VX',
  'rpgmaker-xp': 'RPG Maker XP',
  'wolf': 'WOLF RPG Editor',
  'renpy': "Ren'Py",
  'kirikiri': 'KiriKiri',
  'tyrano': 'TyranoScript',
  'godot': 'Godot',
  'unreal': 'Unreal Engine',
  'gamemaker': 'GameMaker',
  'cocos2d': 'Cocos2d-x',
  'html5': 'HTML5 (NW.js / Electron)',
  'unknown': 'Inconnu'
};

function findUnityDataDir(root: string, exePath: string | null): string | null {
  if (exePath) {
    const expected = path.join(root, `${path.basename(exePath, path.extname(exePath))}_Data`);
    if (isDir(expected)) return expected;
  }
  const candidate = listDir(root).find(name =>
    name.endsWith('_Data') && ['globalgamemanagers', 'data.unity3d', 'mainData'].some(f => exists(path.join(root, name, f)))
  );
  return candidate ? path.join(root, candidate) : null;
}

function readUnityVersion(dataDir: string): string | null {
  for (const file of ['globalgamemanagers', 'data.unity3d', 'mainData']) {
    const head = readHead(path.join(dataDir, file), 4096);
    const match = head?.toString('latin1').match(/\b(6\d{3}|20\d{2}|[3-5])\.\d+\.\d+[abfp]\d+/); // 6000.x = Unity 6
    if (match) return match[0];
  }
  return null;
}

/** `<Jeu>_Data/app.info` : ligne 1 = société, ligne 2 = produit (noms utilisés pour LocalLow). */
function readUnityAppInfo(dataDir: string): { company: string; product: string } | null {
  try {
    const [company, product] = fs.readFileSync(path.join(dataDir, 'app.info'), 'utf8').split(/\r?\n/);
    return company && product ? { company: company.trim(), product: product.trim() } : null;
  } catch {
    return null;
  }
}

/**
 * Racine web d'un RPG Maker MV/MZ : à la racine du jeu ou dans un sous-dossier
 * direct (certains jeux lancent via un exe "lanceur" le vrai NW.js rangé
 * dans `data/`). `saveDir` = dossier des sauvegardes associé.
 */
export function findRpgMakerWebRoot(root: string): { kind: 'rpgmaker-mz' | 'rpgmaker-mv'; webDir: string; saveDir: string } | null {
  const subdirs = listDir(root)
    .filter(name => !name.startsWith('.'))
    .map(name => path.join(root, name))
    .filter(isDir);
  for (const dir of [root, ...subdirs]) {
    for (const webDir of [path.join(dir, 'www'), dir]) {
      const saveDir = path.join(webDir, 'save');
      if (exists(path.join(webDir, 'js', 'rmmz_core.js'))) return { kind: 'rpgmaker-mz', webDir, saveDir };
      if (exists(path.join(webDir, 'js', 'rpg_core.js'))) return { kind: 'rpgmaker-mv', webDir, saveDir };
    }
  }
  return null;
}

export function detectEngine(root: string, exePath: string | null): EngineInfo {
  const has = (...parts: string[]) => exists(path.join(root, ...parts));
  const entries = listDir(root);
  const arch = exePath && exePath.toLowerCase().endsWith('.exe') ? readPeArch(exePath) : null;
  const make = (engine: GameEngine, extra: Partial<EngineInfo> = {}): EngineInfo => ({
    engine,
    label: engine === 'unknown' ? tm('Inconnu') : ENGINE_LABELS[engine],
    arch,
    ...extra
  });

  const unityData = findUnityDataDir(root, exePath);
  if (unityData || has('UnityPlayer.dll')) {
    const il2cpp = has('GameAssembly.dll') || (unityData !== null && exists(path.join(unityData, 'il2cpp_data')));
    const appInfo = unityData ? readUnityAppInfo(unityData) : null;
    return make('unity', {
      unityBackend: il2cpp ? 'il2cpp' : 'mono',
      unityVersion: unityData ? readUnityVersion(unityData) : null,
      unityCompany: appInfo?.company ?? null,
      unityProduct: appInfo?.product ?? null
    });
  }

  const rpgMakerWeb = findRpgMakerWebRoot(root);
  if (rpgMakerWeb) return make(rpgMakerWeb.kind);

  const systemEntries = listDir(path.join(root, 'System'));
  const rgss = (pattern: RegExp) => entries.some(e => pattern.test(e)) || systemEntries.some(e => pattern.test(e));
  if (rgss(/\.rgss3a$/i) || rgss(/^RGSS3\d*\w?\.dll$/i)) return make('rpgmaker-vxace');
  if (rgss(/\.rgss2a$/i) || rgss(/^RGSS2\d*\w?\.dll$/i)) return make('rpgmaker-vx');
  if (rgss(/\.rgssad$/i) || rgss(/^RGSS1\d*\w?\.dll$/i)) return make('rpgmaker-xp');

  if (has('Data.wolf') || has('Data', 'BasicData') || listDir(path.join(root, 'Data')).some(e => e.toLowerCase().endsWith('.wolf'))) {
    return make('wolf');
  }
  if (has('renpy') && has('game')) return make('renpy');
  if (entries.some(e => e.toLowerCase().endsWith('.xp3'))) return make('kirikiri');
  if (has('tyrano') || has('resources', 'app', 'tyrano')) return make('tyrano');
  if (entries.some(e => e.toLowerCase().endsWith('.pck'))) return make('godot');
  if (has('Engine') && entries.some(e => e !== 'Engine' && has(e, 'Binaries'))) return make('unreal');
  if (has('data.win')) return make('gamemaker');
  if (has('libcocos2d.dll')) return make('cocos2d');
  if (has('nw.dll') || has('resources', 'app.asar') || has('package.nw')) return make('html5');

  return make('unknown');
}

// --- Emplacements de sauvegarde ------------------------------------------

/**
 * Emplacement de sauvegarde avec, quand le dossier contient aussi autre chose
 * que des sauvegardes (racine d'un jeu RPG Maker VX/XP), le filtre des seuls
 * fichiers de sauvegarde de son premier niveau — utilisé par la copie des
 * sauvegardes (save-backups.ts), qui ne doit pas copier tout le jeu.
 */
export interface SaveSource extends SaveLocation {
  fileFilter?: RegExp;
}

/**
 * Emplacements de sauvegarde probables selon le moteur. Chemins "attendus"
 * inclus même s'ils n'existent pas encore (jeu jamais lancé), avec `exists`
 * pour que l'interface les distingue.
 */
export function findSaveLocations(root: string, exePath: string | null, info: EngineInfo): SaveSource[] {
  const home = app.getPath('home');
  const roaming = app.getPath('appData');
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const localLow = path.join(home, 'AppData', 'LocalLow');
  const exeBase = exePath ? path.basename(exePath, path.extname(exePath)) : null;
  const candidates: { label: string; path: string; fileFilter?: RegExp }[] = [];

  switch (info.engine) {
    case 'unity':
      if (info.unityCompany && info.unityProduct) {
        candidates.push({ label: 'Unity (LocalLow)', path: path.join(localLow, info.unityCompany, info.unityProduct) });
      }
      break;
    case 'rpgmaker-mv':
    case 'rpgmaker-mz': {
      const web = findRpgMakerWebRoot(root);
      if (web) candidates.push({ label: 'Saves', path: web.saveDir });
      break;
    }
    case 'rpgmaker-vxace':
    case 'rpgmaker-vx':
    case 'rpgmaker-xp':
      // Fichiers SaveNN.rvdata2/.rvdata/.rxdata à la racine du jeu.
      candidates.push({ label: 'Game folder (SaveNN)', path: root, fileFilter: /^Save\d+\.(rvdata2?|rxdata)$/i });
      break;
    case 'wolf':
      candidates.push({ label: 'Saves', path: path.join(root, 'Save') });
      break;
    case 'renpy': {
      candidates.push({ label: 'Saves (game)', path: path.join(root, 'game', 'saves') });
      try {
        const options = fs.readFileSync(path.join(root, 'game', 'options.rpy'), 'utf8');
        const match = options.match(/config\.save_directory\s*=\s*["']([^"']+)["']/);
        if (match) candidates.push({ label: "Ren'Py (Roaming)", path: path.join(roaming, 'RenPy', match[1]) });
      } catch {
        // options.rpy absent (jeu distribué en .rpyc uniquement) : seul game/saves est connu.
      }
      break;
    }
    case 'kirikiri':
      candidates.push({ label: 'Saves', path: path.join(root, 'savedata') });
      break;
    case 'godot':
      if (exeBase) {
        candidates.push({ label: 'Godot (Roaming)', path: path.join(roaming, 'Godot', 'app_userdata', exeBase) });
        candidates.push({ label: 'Godot (Roaming, dedicated folder)', path: path.join(roaming, exeBase) });
      }
      break;
    case 'unreal': {
      const project = listDir(root).find(e => e !== 'Engine' && isDir(path.join(root, e, 'Binaries')));
      if (project) {
        candidates.push({ label: 'Unreal (LocalAppData)', path: path.join(localAppData, project, 'Saved', 'SaveGames') });
        candidates.push({ label: 'Unreal (game)', path: path.join(root, project, 'Saved', 'SaveGames') });
      }
      break;
    }
    case 'gamemaker':
      if (exeBase) candidates.push({ label: 'GameMaker (LocalAppData)', path: path.join(localAppData, exeBase) });
      break;
    case 'cocos2d':
      // FileUtils::getWritablePath() sous Windows : %LOCALAPPDATA%\<nom de l'exe>
      if (exeBase) candidates.push({ label: 'Cocos2d-x (LocalAppData)', path: path.join(localAppData, exeBase) });
      break;
    default:
      break;
  }

  return candidates.map(c => ({ ...c, exists: isDir(c.path) }));
}

// --- Patchs réversibles ---------------------------------------------------

interface PatchManifest {
  patches: InstalledPatch[];
}

function manifestPath(gameDir: string): string {
  return path.join(gameDir, META_DIR, 'patches.json');
}

// Identifiant de patch : `Date.now()` à l'écriture ; sert de nom de dossier de sauvegarde.
const PATCH_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Chemin du manifeste (relatif au dossier du jeu) qui désigne bien un
 * fichier du jeu : ni hors du dossier (`..`, chemin absolu), ni le dossier
 * lui-même, ni dans `.dlsgm` (manifeste, sauvegardes).
 */
function isPatchFile(gameDir: string, rel: unknown): rel is string {
  if (typeof rel !== 'string' || rel === '') return false;
  const relative = path.relative(gameDir, path.resolve(gameDir, rel));
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return false;
  return relative.split(path.sep)[0] !== META_DIR;
}

/**
 * Le manifeste vit dans le dossier du jeu, qui peut venir d'ailleurs (autre
 * PC via le partage LAN, archive importée) : rien n'y est cru sur parole.
 * Désinstaller supprime et écrit les chemins qu'il liste, et vide le dossier
 * de sauvegarde nommé d'après l'identifiant : un patch dont l'un d'eux
 * sortirait du dossier du jeu est ignoré.
 */
function isSafePatch(gameDir: string, value: unknown): value is InstalledPatch {
  if (!value || typeof value !== 'object') return false;
  const patch = value as Partial<InstalledPatch>;
  return typeof patch.id === 'string' && PATCH_ID.test(patch.id)
    && typeof patch.name === 'string'
    && (patch.kind === 'auto-translator' || patch.kind === 'custom' || patch.kind === 'debug')
    && Array.isArray(patch.added) && patch.added.every(rel => isPatchFile(gameDir, rel))
    && Array.isArray(patch.overwritten) && patch.overwritten.every(rel => isPatchFile(gameDir, rel));
}

export function readPatches(gameDir: string): InstalledPatch[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath(gameDir), 'utf8')) as PatchManifest;
    if (!Array.isArray(parsed.patches)) return [];
    const patches = parsed.patches.filter(patch => isSafePatch(gameDir, patch));
    if (patches.length < parsed.patches.length) console.warn(`Patchs invalides ignorés dans ${manifestPath(gameDir)}`);
    return patches;
  } catch {
    return [];
  }
}

function writePatches(gameDir: string, patches: InstalledPatch[]): void {
  fs.mkdirSync(path.join(gameDir, META_DIR), { recursive: true });
  const target = manifestPath(gameDir);
  fs.writeFileSync(`${target}.tmp`, JSON.stringify({ patches } satisfies PatchManifest, null, 2));
  fs.renameSync(`${target}.tmp`, target);
}

/**
 * Descend dans les dossiers "enveloppes" d'une archive (ex: `MonPatch/`
 * contenant le vrai `<Jeu>_Data/`) tant que le contenu ne s'aligne pas avec
 * le dossier du jeu.
 */
function resolvePatchRoot(sourceDir: string, installRoot: string): string {
  let current = sourceDir;
  for (let depth = 0; depth < 4; depth++) {
    const entries = listDir(current);
    if (entries.some(e => exists(path.join(installRoot, e)))) return current;
    if (entries.length === 1 && isDir(path.join(current, entries[0]))) {
      current = path.join(current, entries[0]);
    } else {
      return current;
    }
  }
  return current;
}

/**
 * Copie `sourceDir` dans `installRoot` en sauvegardant chaque fichier écrasé,
 * puis enregistre le patch dans le manifeste. Chemins du manifeste relatifs
 * au dossier du jeu.
 */
function applyPatchFromDirectory(
  gameDir: string,
  installRoot: string,
  sourceDir: string,
  meta: Pick<InstalledPatch, 'name' | 'kind'>
): InstalledPatch {
  const patchId = `${Date.now()}`;
  const backupDir = path.join(gameDir, META_DIR, 'backup', patchId);
  const files = walkFiles(sourceDir).filter(rel => !rel.split(path.sep).includes(META_DIR));
  if (files.length === 0) throw new Error(tm('Le patch ne contient aucun fichier.'));

  const added: string[] = [];
  const overwritten: string[] = [];
  const patch: InstalledPatch = { id: patchId, ...meta, installedAt: new Date().toISOString(), added, overwritten };

  try {
    for (const rel of files) {
      const destination = path.join(installRoot, rel);
      const relToGame = path.relative(gameDir, destination);
      if (exists(destination)) {
        const backupPath = path.join(backupDir, relToGame);
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        fs.copyFileSync(destination, backupPath);
        overwritten.push(relToGame);
      } else {
        added.push(relToGame);
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(sourceDir, rel), destination);
    }
  } catch (error) {
    // Échec en cours de copie : on défait ce qui a déjà été écrit.
    revertPatch(gameDir, patch);
    throw error;
  }

  writePatches(gameDir, [...readPatches(gameDir), patch]);
  return patch;
}

function removeEmptyParents(startDir: string, stopDir: string): void {
  let current = startDir;
  while (current !== stopDir && current.startsWith(stopDir) && listDir(current).length === 0) {
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

function revertPatch(gameDir: string, patch: InstalledPatch): void {
  // Garde-fou en plus du filtre de readPatches : rien n'est supprimé ni écrit hors du jeu.
  if (!isSafePatch(gameDir, patch)) throw new Error(tm('Patch invalide : désinstallation refusée.'));
  const backupDir = path.join(gameDir, META_DIR, 'backup', patch.id);
  for (const rel of patch.added) {
    const target = path.join(gameDir, rel);
    fs.rmSync(target, { force: true });
    removeEmptyParents(path.dirname(target), gameDir);
  }
  for (const rel of patch.overwritten) {
    const backupPath = path.join(backupDir, rel);
    if (exists(backupPath)) fs.copyFileSync(backupPath, path.join(gameDir, rel));
  }
  fs.rmSync(backupDir, { recursive: true, force: true });
}

/** Chemin comparable (Windows et macOS ne distinguent pas la casse). */
const pathKey = (rel: string) => path.normalize(rel).toLowerCase();

/**
 * Désinstalle un patch précis. L'ordre de pile n'importe que lorsque deux
 * patchs touchent les mêmes fichiers : refusé si un patch installé après
 * celui-ci en ajoute ou en écrase un des siens.
 */
export function uninstallPatch(gameDir: string, patchId: string): InstalledPatch {
  const patches = readPatches(gameDir);
  const index = patches.findIndex(p => p.id === patchId);
  if (index < 0) throw new Error(tm('Patch introuvable.'));
  const patch = patches[index];
  const own = new Set([...patch.added, ...patch.overwritten].map(pathKey));
  const blocking = patches.slice(index + 1).find(later => [...later.added, ...later.overwritten].some(rel => own.has(pathKey(rel))));
  if (blocking) throw new Error(tm("Désinstalle d'abord « {name} », installé après et qui touche les mêmes fichiers.", { name: blocking.name }));
  revertPatch(gameDir, patch);
  writePatches(gameDir, patches.filter(p => p.id !== patchId));
  return patch;
}

// --- Mode debug Ren'Py ------------------------------------------------------

export const RENPY_DEBUG_FILE = path.join('game', 'zz_dlsgm_debug.rpy');

/**
 * Script ajouté par le mode debug : console développeur (Maj+O), menu
 * développeur (Maj+D) et passage du texte non lu. `init 999` : après le
 * jeu, pour l'emporter sur ses propres réglages.
 */
const RENPY_DEBUG_SCRIPT = [
  '# Ajouté par DLSGM (mode debug), retiré en désactivant le mode debug sur la page du jeu.',
  'init 999 python:',
  '    config.developer = True',
  '    config.console = True',
  '    config.allow_skipping = True',
  '',
  '    def _dlsgm_skip_unseen(*args):',
  '        _preferences.skip_unseen = True',
  '',
  '    config.start_callbacks.append(_dlsgm_skip_unseen)',
  '    config.after_load_callbacks.append(_dlsgm_skip_unseen)',
  ''
].join('\n');

export function findDebugPatch(gameDir: string): InstalledPatch | null {
  return readPatches(gameDir).find(patch => patch.kind === 'debug') ?? null;
}

/**
 * Ajoute le script de debug comme un patch (kind `debug`), donc
 * désinstallable. Ren'Py le compile au lancement en `.rpyc` : ce fichier
 * est déclaré parmi les ajouts pour partir avec le patch.
 */
export async function installRenpyDebug(gameDir: string, installRoot: string): Promise<InstalledPatch> {
  if (findDebugPatch(gameDir)) throw new Error(tm('Le mode debug est déjà installé.'));
  if (!isDir(path.join(installRoot, 'game'))) throw new Error(tm("Dossier game/ de Ren'Py introuvable."));
  const patch = await withTempDir(async tempDir => {
    fs.mkdirSync(path.join(tempDir, 'game'));
    fs.writeFileSync(path.join(tempDir, RENPY_DEBUG_FILE), RENPY_DEBUG_SCRIPT);
    return applyPatchFromDirectory(gameDir, installRoot, tempDir, { name: "Mode debug Ren'Py", kind: 'debug' });
  });
  const compiled = path.relative(gameDir, path.join(installRoot, `${RENPY_DEBUG_FILE}c`));
  const withCompiled = { ...patch, added: [...patch.added, compiled] };
  writePatches(gameDir, readPatches(gameDir).map(p => (p.id === patch.id ? withCompiled : p)));
  return withCompiled;
}

/** Désinstalle le dernier patch appliqué (ordre de pile). */
export function uninstallLastPatch(gameDir: string): InstalledPatch | null {
  const patches = readPatches(gameDir);
  const last = patches.pop();
  if (!last) return null;
  revertPatch(gameDir, last);
  writePatches(gameDir, patches);
  return last;
}

async function withTempDir<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'dlsgm-patch-'));
  try {
    return await work(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Applique un patch utilisateur (archive .zip ou dossier). */
export async function applyUserPatch(gameDir: string, installRoot: string, sourcePath: string): Promise<InstalledPatch> {
  const name = path.basename(sourcePath);
  if (isDir(sourcePath)) {
    return applyPatchFromDirectory(gameDir, installRoot, resolvePatchRoot(sourcePath, installRoot), { name, kind: 'custom' });
  }
  if (!sourcePath.toLowerCase().endsWith('.zip')) {
    throw new Error(tm('Seuls les patchs .zip ou les dossiers sont pris en charge.'));
  }
  return withTempDir(async tempDir => {
    await extractZip(sourcePath, tempDir);
    return applyPatchFromDirectory(gameDir, installRoot, resolvePatchRoot(tempDir, installRoot), { name, kind: 'custom' });
  });
}

// --- BepInEx + XUnity.AutoTranslator -------------------------------------

// Attentes avant chaque nouvel essai : GitHub et son CDN de releases
// renvoient parfois un 503 passager.
const DOWNLOAD_RETRY_DELAYS_MS = [2000, 5000];

/** Erreur serveur passagère (5xx, 429) : vaut un nouvel essai. */
const isTransientStatus = (status: number) => status >= 500 || status === 429;

/**
 * `fetch` avec nouveaux essais sur erreur serveur passagère ou coupure réseau
 * (pas sur un délai dépassé : chaque essai a déjà eu tout son temps). Rend la
 * dernière réponse, même en erreur.
 */
export async function fetchWithRetry(
  url: string,
  { fetchFn = fetch, delaysMs = DOWNLOAD_RETRY_DELAYS_MS, timeoutMs = 120000 }: { fetchFn?: typeof fetch; delaysMs?: number[]; timeoutMs?: number } = {}
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= delaysMs.length;
    try {
      const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok || last || !isTransientStatus(response.status)) return response;
    } catch (error) {
      if (last || (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, delaysMs[attempt]));
  }
}

/**
 * Télécharge (une fois, mis en cache dans userData/downloads) et vérifie le
 * SHA-256 d'une archive épinglée.
 */
async function getVerifiedDownload(key: keyof typeof DOWNLOADS): Promise<string> {
  const { url, sha256 } = DOWNLOADS[key];
  const downloadsDir = path.join(app.getPath('userData'), 'downloads');
  const target = path.join(downloadsDir, path.basename(new URL(url).pathname));
  const hashOf = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

  if (exists(target) && hashOf(fs.readFileSync(target)) === sha256) return target;

  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new Error(
      isTransientStatus(response.status)
        ? tm('Serveur de téléchargement indisponible ({status}), réessaie dans quelques minutes : {url}', { status: response.status, url })
        : tm('Téléchargement impossible ({status}) : {url}', { status: response.status, url })
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const actual = hashOf(buffer);
  if (actual !== sha256) {
    throw new Error(tm('Somme de contrôle invalide pour {file} (attendu {expected}, obtenu {actual}).', { file: path.basename(target), expected: sha256, actual }));
  }
  fs.mkdirSync(downloadsDir, { recursive: true });
  fs.writeFileSync(target, buffer);
  return target;
}

/**
 * Installe BepInEx 5 + XUnity.AutoTranslator (traduction automatique en jeu)
 * sur un jeu Unity Mono, comme un seul patch réversible.
 */
export async function installAutoTranslator(
  gameDir: string,
  installRoot: string,
  info: EngineInfo,
  targetLanguage: string
): Promise<InstalledPatch> {
  if (process.platform !== 'win32') throw new Error(tm('Installation automatique disponible sous Windows uniquement.'));
  if (info.engine !== 'unity') throw new Error(tm("BepInEx ne s'applique qu'aux jeux Unity (moteur détecté : {engine}).", { engine: info.label }));
  if (info.unityBackend === 'il2cpp') {
    throw new Error(tm("Jeu Unity IL2CPP : nécessite BepInEx 6 (pré-version), pas encore pris en charge. Seuls les jeux Unity Mono le sont."));
  }
  if (!info.arch) throw new Error(tm("Architecture de l'exécutable inconnue (x64/x86) : impossible de choisir la bonne version de BepInEx."));
  if (exists(path.join(installRoot, 'BepInEx', 'core'))) {
    throw new Error(tm('BepInEx est déjà présent dans ce jeu (installé hors de DLSGM ?).'));
  }
  if (!/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(targetLanguage)) throw new Error(tm('Langue invalide : {language}', { language: targetLanguage }));

  const bepinexZip = await getVerifiedDownload(info.arch === 'x64' ? 'bepinex-x64' : 'bepinex-x86');
  const xunityZip = await getVerifiedDownload('xunity-bepinex');

  return withTempDir(async tempDir => {
    await extractZip(bepinexZip, tempDir);
    await extractZip(xunityZip, tempDir, { overwrite: true });

    // Config pré-remplie : XUnity complète lui-même les clés manquantes au
    // premier lancement. GoogleTranslateV2 en secours, l'API historique
    // utilisée par défaut par "GoogleTranslate" étant moins fiable.
    const configDir = path.join(tempDir, 'BepInEx', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'AutoTranslatorConfig.ini'),
      [
        '[Service]',
        'Endpoint=GoogleTranslate',
        'FallbackEndpoint=GoogleTranslateV2',
        '',
        '[General]',
        `Language=${targetLanguage}`,
        'FromLanguage=ja',
        ''
      ].join('\r\n')
    );

    return applyPatchFromDirectory(gameDir, installRoot, tempDir, {
      name: `BepInEx ${BEPINEX_VERSION} + XUnity.AutoTranslator ${XUNITY_VERSION} (→ ${targetLanguage})`,
      kind: 'auto-translator'
    });
  });
}
