/**
 * Contrat de types partagé pour la surface IPC entre main (ipc-handlers.ts),
 * preload (preload.ts) et renderer (window.electronAPI). Fichier type-only :
 * `import type` s'efface entièrement à la compilation, donc importable sans
 * conflit aussi bien depuis le monde CommonJS de main (tsc) que depuis le
 * monde ESM/bundler du renderer (Vite/esbuild).
 */

export interface AppSettings {
  destinationFolder: string;
  refreshRate: number;
  language: string;
  /** Floute les jaquettes R18 dans la bibliothèque jusqu'au clic (par jeu, pour la session). */
  blurAdultContent: boolean;
  /** Groupes de tags de genre liés comme équivalents (ex: doublons JP/EN) — voir lib/genreAliases.ts. */
  genreAliasGroups: string[][];
  /**
   * Lance les jeux dans Sandboxie-Plus (Windows), une sandbox par jeu —
   * voir src/main/sandboxie.ts. Si Sandboxie est introuvable, le lancement
   * échoue plutôt que de se faire hors sandbox.
   */
  sandboxLaunch: boolean;
}

/**
 * Champs optionnels (Optional[...] = None côté dataclass Python `Work`) :
 * une valeur absente ressort en `null`, jamais en chaîne "N/A" — vérifié en
 * conditions réelles contre l'API DLsite et le script Python original.
 */
export interface GameMetadata {
  work_name: string;
  title_name_masked: string | null;
  age_category: 'ALL_AGES' | 'R15' | 'R18';
  circle: string | null;
  brand: string | null;
  publisher: string | null;
  label: string | null;
  work_image: string | null;
  description: string | null;
  genre: string[] | null;
  sample_images: string[] | null;
  category: string | null;
  announce_date: string | null;
  release_date: string | null;
  regist_date: string | null;
  modified_date: string | null;
  file_format: string[] | null;
  file_size: string | null;
  language: string[] | null;
  platform: string;
  series: string | null;
  page_count: number | null;
  author: string[] | null;
  writer: string[] | null;
  scenario: string[] | null;
  illustration: string[] | null;
  voice_actor: string[] | null;
  music: string[] | null;
  event: string[] | null;
  addedDate?: string;
  imagesComplete?: boolean;
  fetchFailed?: boolean;
  lastFetchAttempt?: string;
  error?: string;
  /**
   * Exécutable choisi par l'utilisateur, relatif au dossier du jeu. Absent :
   * détection automatique au lancement.
   */
  executablePath?: string;
  /** Jeu exclu de la sandbox (lancé normalement même si `sandboxLaunch` est actif). */
  sandboxDisabled?: boolean;
}

export type GameCache = Record<string, GameMetadata>;

export interface LaunchGameResult {
  success: boolean;
  duration?: number;
  error?: string;
  /**
   * Jeu lancé via le shell (ex: exécutable exigeant les droits admin) : son
   * processus n'est pas suivi, donc aucun temps de jeu n'est comptabilisé.
   */
  untracked?: boolean;
}

export type GameEngine =
  | 'unity'
  | 'rpgmaker-mz'
  | 'rpgmaker-mv'
  | 'rpgmaker-vxace'
  | 'rpgmaker-vx'
  | 'rpgmaker-xp'
  | 'wolf'
  | 'renpy'
  | 'kirikiri'
  | 'tyrano'
  | 'godot'
  | 'unreal'
  | 'gamemaker'
  | 'cocos2d'
  | 'html5'
  | 'unknown';

export interface EngineInfo {
  engine: GameEngine;
  label: string;
  /** Architecture de l'exécutable (en-tête PE), null si inconnue ou non-Windows. */
  arch: 'x64' | 'x86' | null;
  unityBackend?: 'mono' | 'il2cpp';
  unityVersion?: string | null;
  /** Société / produit Unity (`<Jeu>_Data/app.info`) : déterminent le dossier LocalLow. */
  unityCompany?: string | null;
  unityProduct?: string | null;
}

export interface SaveLocation {
  label: string;
  path: string;
  /** Faux si le dossier attendu n'existe pas (encore) — ex: jeu jamais lancé. */
  exists: boolean;
}

export interface InstalledPatch {
  id: string;
  name: string;
  kind: 'auto-translator' | 'custom';
  installedAt: string;
  /** Fichiers ajoutés, relatifs au dossier du jeu (supprimés à la désinstallation). */
  added: string[];
  /** Fichiers écrasés, relatifs au dossier du jeu (restaurés depuis .dlsgm/backup). */
  overwritten: string[];
}

export interface SandboxieStatus {
  /** Sandboxie (Plus ou Classic) trouvé sur la machine — toujours faux hors Windows. */
  available: boolean;
  installDir: string | null;
}

export interface GameSandboxInfo {
  /** Option `sandboxLaunch` des paramètres. */
  globallyEnabled: boolean;
  available: boolean;
  /** Nom de la sandbox Sandboxie du jeu (ex: DLSGMRJ123456). */
  boxName: string;
}

export interface GameToolsInfo {
  engine: EngineInfo;
  /** Dossier d'installation (celui de l'exécutable), relatif au dossier du jeu ('' = racine). */
  installRoot: string;
  saveLocations: SaveLocation[];
  /** Patchs installés par DLSGM, du plus ancien au plus récent. */
  patches: InstalledPatch[];
  sandbox: GameSandboxInfo;
}

export interface ElectronAPI {
  // Infos App
  getUserDataPath(): Promise<string>;

  // Gestion des paramètres
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<boolean>;
  updateLanguage(lang: string): void;

  // Gestion du cache — écritures par entrée uniquement, fusionnées côté main :
  // jamais de réécriture du cache complet depuis le renderer (voir Store).
  getCache(): Promise<GameCache>;
  /** Fusionne `patch` dans l'entrée existante ; sans effet (false) si l'entrée n'existe pas. */
  updateCacheEntry(gameId: string, patch: Partial<GameMetadata> & Record<string, unknown>): Promise<boolean>;
  replaceCacheEntry(gameId: string, data: GameMetadata): Promise<boolean>;
  deleteCacheEntry(gameId: string): Promise<boolean>;

  // Dialogues
  openFolderDialog(): Promise<string | null>;
  openImageDialog(): Promise<string | null>;

  // Opérations système
  /** `null` si le dossier n'existe pas (distinct d'un dossier vide). */
  listGameFolders(folderPath: string): Promise<string[] | null>;
  openGameFolder(gameId: string): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
  launchGame(gameId: string): Promise<LaunchGameResult>;
  /** Ouvre un sélecteur dans le dossier du jeu ; renvoie le chemin relatif mémorisé, ou null si annulé. */
  chooseGameExecutable(gameId: string): Promise<string | null>;
  downloadGameImages(gameId: string, metadata: GameMetadata): Promise<boolean>;
  resetImageCache(): Promise<void>;
  setCustomCover(gameId: string, sourceImagePath: string): Promise<boolean>;

  // Outils par jeu : moteur, sauvegardes, patchs réversibles
  getGameToolsInfo(gameId: string): Promise<GameToolsInfo>;
  /** Ouvre l'emplacement de sauvegarde n° `index` de getGameToolsInfo (jamais un chemin libre). */
  openSaveLocation(gameId: string, index: number): Promise<boolean>;
  installAutoTranslator(gameId: string, targetLanguage: string): Promise<GameToolsInfo>;
  /** Ouvre un sélecteur (.zip ou dossier) puis applique le patch ; null si annulé. */
  applyUserPatch(gameId: string, source: 'zip' | 'folder'): Promise<GameToolsInfo | null>;
  uninstallLastPatch(gameId: string): Promise<GameToolsInfo>;

  // Sandbox Sandboxie-Plus
  getSandboxieStatus(): Promise<SandboxieStatus>;
  /** Supprime tout ce que le jeu a écrit hors de son dossier ; refusé pendant que le jeu tourne. */
  clearGameSandbox(gameId: string): Promise<GameToolsInfo>;

  // Récupération des métadonnées DLsite (fetch Node pur, sans dépendance Python)
  fetchGameMetadata(gameId: string, locale: string): Promise<GameMetadata>;

  // Événements (du Main vers le Renderer)
  onPanicTriggered(callback: () => void): void;
}
