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
  /**
   * Proxy pour les requêtes DLsite (ex: http://hôte:port, socks5://hôte:port) ;
   * vide = proxy système. Voir src/main/dlsite-net.ts.
   */
  dlsiteProxy: string;
  /** Collections créées par l'utilisateur, dans l'ordre d'affichage (appartenance : `GameMetadata.collections`). */
  collections: GameCollection[];
  /** Copie des sauvegardes du jeu à chaque fermeture (voir src/main/save-backups.ts). */
  autoBackupSaves: boolean;
  /** Fermer la fenêtre la cache dans la zone de notification au lieu de quitter. */
  closeToTray: boolean;
  /**
   * Racine des dossiers de travaux (data mining...) : `<racine>/<ID>/`.
   * Vide = Documents/DLSGM/Travaux. Voir src/main/workspace.ts.
   */
  workspaceFolder: string;
  /**
   * Refaire les fetchs DLsite en échec à travers Private Internet Access,
   * connecté le temps des fetchs à `piaRegion` (restriction régionale).
   */
  piaRetry: boolean;
  /** Région PIA (identifiant de `piactl get regions`, ex: jp-tokyo). */
  piaRegion: string;
}

/** État de Private Internet Access (voir src/main/pia.ts). */
export interface PiaStatus {
  /** piactl trouvé sur ce PC. */
  available: boolean;
  connectionState: string | null;
  region: string | null;
  regions: string[];
  /** piactl présent mais sans réponse (service PIA arrêté...). */
  error?: string;
}

export interface GameWorkspaceEntry {
  name: string;
  isDirectory: boolean;
  /** Octets (contenu total pour un dossier). */
  size: number;
  modified: string;
}

/** Dossier de travaux d'un jeu (créé seulement à la première ouverture). */
export interface GameWorkspaceInfo {
  path: string;
  exists: boolean;
  /** Entrées de premier niveau, les plus récemment modifiées d'abord (50 au plus). */
  entries: GameWorkspaceEntry[];
  totalFiles: number;
  totalBytes: number;
  /** Décompte arrêté en route (très gros dossier) : totaux minimaux. */
  truncated: boolean;
}

export interface GameCollection {
  id: string;
  name: string;
}

/** Session de jeu suivie (lancement → fermeture du processus). */
export interface PlaySession {
  /** Début de la session (ISO). */
  start: string;
  /** Durée en secondes. */
  duration: number;
}

/** Copie des sauvegardes d'un jeu, stockée dans userData/save_backups/<ID>/. */
export interface SaveBackup {
  id: string;
  createdAt: string;
  /** auto = à la fermeture du jeu ; pre-restore = état écrasé par une restauration. */
  reason: 'auto' | 'manual' | 'pre-restore';
  /** Libellés des emplacements copiés (voir SaveLocation.label). */
  locations: string[];
  fileCount: number;
  totalBytes: number;
}

/** Dictionnaire des tags : genre japonais (clé, langue de référence) → traduction anglaise. */
export type GenreTranslations = Record<string, { en: string; manual: boolean }>;

/** Jeu de la liste de souhaits
 (voir src/main/wishlist.ts). Champs null tant que la fiche n'a pas pu être récupérée. */
export interface WishlistItem {
  id: string;
  addedAt: string;
  work_name: string | null;
  circle: string | null;
  age_category: GameMetadata['age_category'] | null;
  category: string | null;
  release_date: string | null;
  /** Couverture téléchargée : atom://img/_wishlist/<ID>.jpg. */
  hasCover: boolean;
  /** Dernier échec de récupération de la fiche (restriction régionale, ID inexistant...). */
  error?: string;
}

export interface WishlistAddResult {
  added: string[];
  alreadyListed: string[];
  /** Déjà dans la bibliothèque : pas ajoutés. */
  inLibrary: string[];
  /** Aucun ID DLsite dans le texte saisi. */
  noIdFound?: boolean;
}

/** Résultat de l'import d'une archive choisie par l'utilisateur. */
export interface ArchiveImportResult {
  file: string;
  gameId?: string;
  error?: string;
}

/** Avancement d'un import : archive en cours d'extraction (1-indexée). */
export interface ArchiveImportProgress {
  file: string;
  index: number;
  total: number;
}

export interface SaveRestoreResult {
  /** Emplacements de la copie introuvables aujourd'hui (moteur ou exécutable changé) : non restaurés. */
  skipped: string[];
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
 * Image après édition manuelle : une image existante déplacée à sa nouvelle
 * place (`keep` : 0 = couverture actuelle, n = `sample_<n>.jpg`, 1-indexé),
 * ou une nouvelle image fournie en octets (JPEG, PNG, GIF ou WebP). Chaque
 * image existante sert au plus une fois dans tout le plan.
 */
export type GameImageSource = { keep: number } | { data: Uint8Array };

export interface GameImagesPlan {
  /**
   * 'keep' = couverture inchangée ; `{ keep: n }` (n ≥ 1) = l'échantillon n
   * devient la couverture.
   */
  cover: 'keep' | 'remove' | GameImageSource;
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
  /**
   * Codes `options` de DLsite (ex: JPN, ENG, AIG = généré par IA, TRI =
   * version d'essai). Absent des fiches récupérées avant son ajout.
   */
  options?: string[] | null;
  /**
   * Identifiant DLsite du cercle ou de la marque (ex: RG01001209), le même
   * dans toutes les langues alors que le nom change ("cat 3" / "猫3"). Absent
   * des fiches récupérées avant son ajout.
   */
  maker_id?: string | null;
  /** Titre et nom de cercle anglais de DLsite (traductions ; les champs principaux sont en japonais). */
  work_name_en?: string | null;
  circle_en?: string | null;
  /**
   * Fiche modifiée à la main (formulaire d'édition) : la mise à jour groupée
   * depuis DLsite ne la touche pas. Remis à false par un fetch forcé du jeu.
   */
  manuallyEdited?: boolean;
  /** Fiche en échec dont la dernière tentative passait déjà par le VPN : pas refaite automatiquement à chaque scan. */
  failedThroughVpn?: boolean;

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
  /** Marqué comme fini par l'utilisateur (macaron sur la jaquette). Donnée personnelle, jamais partagée en LAN. */
  completed?: boolean;
  /** IDs des collections (AppSettings.collections) du jeu. Donnée personnelle, jamais partagée en LAN. */
  collections?: string[];
  /** Historique des sessions, enregistré par main à la fermeture du jeu. Donnée personnelle. */
  playSessions?: PlaySession[];
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
  /**
   * Télécharge les images manquantes ; avec `overwrite`, retélécharge aussi
   * celles présentes (fetch forcé) et supprime les échantillons en trop.
   */
  downloadGameImages(gameId: string, metadata: GameMetadata, options?: { overwrite?: boolean }): Promise<boolean>;
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

  // Liste de souhaits (voir src/main/wishlist.ts)
  /** Liste, sans les jeux arrivés entre-temps dans la bibliothèque (retirés au passage). */
  getWishlist(): Promise<WishlistItem[]>;
  /** Ajoute les IDs trouvés dans un texte libre (IDs, liens DLsite...) et récupère leurs fiches. */
  addToWishlist(text: string): Promise<WishlistAddResult>;
  removeFromWishlist(gameId: string): Promise<boolean>;
  /** Nouvelle tentative de récupération de la fiche. */
  refreshWishlistItem(gameId: string): Promise<void>;

  // Import d'archives (voir src/main/archive-import.ts)

  /**
   * Sélecteur d'archives (.zip, .rar, .7z, .part1.exe), puis extraction de
   * chacune dans le dossier de jeux sous son ID. [] si annulé.
   */
  importGameArchives(): Promise<ArchiveImportResult[]>;
  /** Avancement de l'import ; renvoie la fonction de désabonnement. */
  onArchiveImportProgress(callback: (progress: ArchiveImportProgress) => void): () => void;

  /** Copie cache.db dans userData/db_backups (5 dernières gardées) ; renvoie le chemin de la copie. */
  snapshotCache(): Promise<string>;

  // VPN Private Internet Access (voir src/main/pia.ts)
  getPiaStatus(): Promise<PiaStatus>;
  /**
   * Connecte PIA à la région des paramètres (ou rejoint la session en cours).
   * Chaque appel réussi doit être suivi de `endVpnSession`, qui restaure
   * l'état d'avant (région, connecté ou non) à la fin de la dernière session.
   */
  beginVpnSession(): Promise<void>;
  endVpnSession(): Promise<void>;

  // Dossier de travaux d'un jeu (voir src/main/workspace.ts)


  getGameWorkspace(gameId: string): Promise<GameWorkspaceInfo>;
  /** Crée le dossier s'il n'existe pas encore, puis l'ouvre dans l'explorateur. */
  openGameWorkspace(gameId: string): Promise<GameWorkspaceInfo>;
  /** Racine effective (paramètre, ou Documents/DLSGM/Travaux si vide). */
  getWorkspaceRoot(): Promise<string>;

  // Copies des sauvegardes (voir src/main/save-backups.ts)


  listSaveBackups(gameId: string): Promise<SaveBackup[]>;
  /** Copie maintenant ; null si aucun emplacement de sauvegarde ne contient de fichier. */
  createSaveBackup(gameId: string): Promise<SaveBackup | null>;
  /** Refusé pendant que le jeu tourne ; l'état écrasé est d'abord copié (reason 'pre-restore'). */
  restoreSaveBackup(gameId: string, backupId: string): Promise<SaveRestoreResult>;
  deleteSaveBackup(gameId: string, backupId: string): Promise<boolean>;

  // Sandbox Sandboxie-Plus
  getSandboxieStatus(): Promise<SandboxieStatus>;
  /** Supprime tout ce que le jeu a écrit hors de son dossier ; refusé pendant que le jeu tourne. */
  clearGameSandbox(gameId: string): Promise<GameToolsInfo>;

  // Récupération des métadonnées DLsite : en japonais (langue de référence),
  // plus les traductions anglaises ; les genres traduits enrichissent le
  // dictionnaire des tags côté main.
  fetchGameMetadata(gameId: string): Promise<GameMetadata>;

  // Dictionnaire des tags JP → EN (voir src/main/genre-translations.ts)
  getGenreTranslations(): Promise<GenreTranslations>;
  /** Traduction choisie à la main (jamais remplacée par DLsite) ; `null` rend la main à DLsite. */
  setGenreTranslation(japanese: string, english: string | null): Promise<GenreTranslations>;

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
