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
  /** Ouvre la fenêtre en plein écran au démarrage (F11 bascule à tout moment). */
  startFullscreen: boolean;
  /** Port TCP écouté pour recevoir des jeux en réseau local (voir src/main/lan-share.ts). */
  lanSharePort: number;
}

/** PC du réseau local dont la réception est ouverte (réponse à la découverte UDP). */
export interface LanPeer {
  name: string;
  host: string;
  port: number;
}

export interface LanReceiverStatus {
  running: boolean;
  port: number;
  /** Code à saisir sur le PC qui envoie ; régénéré à chaque ouverture. */
  code: string | null;
  deviceName: string;
  /** Adresses IPv4 de ce PC sur le réseau local. */
  addresses: string[];
  /** Raison d'un arrêt que l'utilisateur n'a pas demandé (trop de codes erronés...). */
  stoppedReason?: string;
}

export interface LanTransferProgress {
  /** Identifiant stable du transfert (clé côté renderer). */
  key: string;
  direction: 'send' | 'receive';
  gameId: string;
  /** Nom ou adresse de l'autre PC. */
  peer: string;
  totalBytes: number;
  transferredBytes: number;
  totalFiles: number;
  doneFiles: number;
  state: 'active' | 'done' | 'failed' | 'cancelled';
  error?: string;
}

export interface LanSendRequest {
  host: string;
  port: number;
  code: string;
  gameIds: string[];
}

export interface LanSendResult {
  sent: string[];
  failed: { gameId: string; error: string }[];
  cancelled: boolean;
}

/**
 * Image d'une liste d'échantillons après édition manuelle : un échantillon
 * existant (`sample_<keep>.jpg`, 1-indexé) déplacé à sa nouvelle position,
 * ou une nouvelle image fournie en octets (JPEG, PNG, GIF ou WebP).
 */
export type GameImageSource = { keep: number } | { data: Uint8Array };

export interface GameImagesPlan {
  cover: 'keep' | 'remove' | { data: Uint8Array };
  /** Liste finale et ordonnée des échantillons ; ceux qui n'y figurent pas sont supprimés. */
  samples: GameImageSource[];
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
  /** Applique les modifications d'images de l'édition manuelle (couverture + échantillons). */
  applyGameImages(gameId: string, plan: GameImagesPlan): Promise<boolean>;

  // Plein écran
  /** Bascule le plein écran ; renvoie le nouvel état. */
  toggleFullscreen(): Promise<boolean>;
  isFullscreen(): Promise<boolean>;

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

  // Échange de jeux en réseau local (voir src/main/lan-share.ts)
  getLanReceiverStatus(): Promise<LanReceiverStatus>;
  /** Ouvre la réception sur `port` avec un nouveau code d'appairage. */
  startLanReceiver(port: number): Promise<LanReceiverStatus>;
  /** Ferme la réception et annule les transferts entrants en cours. */
  stopLanReceiver(): Promise<LanReceiverStatus>;
  /** Cherche (broadcast UDP) les PC dont la réception est ouverte. */
  discoverLanPeers(): Promise<LanPeer[]>;
  /** Envoie les jeux un par un ; un seul envoi à la fois. */
  sendGamesOverLan(request: LanSendRequest): Promise<LanSendResult>;
  cancelLanSend(): Promise<void>;

  // Événements (du Main vers le Renderer)
  onPanicTriggered(callback: () => void): void;
  /** Progression des envois et réceptions ; renvoie la fonction de désabonnement. */
  onLanTransferProgress(callback: (progress: LanTransferProgress) => void): () => void;
  /** Changements d'état de la réception non demandés par le renderer (arrêt automatique). */
  onLanReceiverStatus(callback: (status: LanReceiverStatus) => void): () => void;
  /** Abonnement aux changements de plein écran (F11, bouton, paramètre) ; renvoie la fonction de désabonnement. */
  onFullscreenChange(callback: (isFullscreen: boolean) => void): () => void;
}
