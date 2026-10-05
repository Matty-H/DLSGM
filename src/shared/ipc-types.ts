import type { ActiveTheme, CustomTheme } from './themes';
import type { OsPlatform } from './platforms';

/** Déplacement de la bibliothèque (src/main/library-move.ts). */
export interface LibraryMovePlan {
  /** Entrées déplacées (noms à la racine de la bibliothèque). */
  entries: string[];
  /** Dont les dossiers de jeux (nommés d'après un ID). */
  gameCount: number;
  /** Taille totale (octets). */
  bytes: number;
  /** Même disque : simples renommages, rien à copier. */
  sameVolume: boolean;
  /** Espace libre du disque cible (null si inconnu). */
  freeBytes: number | null;
}
export interface LibraryMoveProgress {
  done: number;
  total: number;
  /** `bytes` pour une copie, `entries` pour des renommages. */
  unit: 'bytes' | 'entries';
}
export interface LibraryMoveResult {
  moved: string[];
  /** Originaux non supprimés après la copie (restés à l'ancien endroit). */
  leftovers: string[];
  copied: boolean;
}

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
  /**
   * Mot de passe du proxy, chiffré (safeStorage) — dans `dlsiteProxy`, il est
   * remplacé par "********". Géré par main seul (voir dlsite-net.ts).
   */
  dlsiteProxySecret?: string;
  /** Collections créées par l'utilisateur, dans l'ordre d'affichage (appartenance : `GameMetadata.collections`). */
  collections: GameCollection[];
  /**
   * Affichage des étagères de l'accueil, par clé d'étagère ('recent',
   * 'to-finish', 'added', 'unplayed', 'user:<id>') — voir lib/collections.ts.
   * Absent = réglages par défaut de l'étagère.
   */
  homeShelves: Record<string, HomeShelfPrefs>;
  /** Bibliothèque : masquer les jeux marqués finis (case « Masquer les finis »). */
  hideCompleted: boolean;
  /** Bibliothèque (Mac) : seulement les jeux dont une version Mac est dans le dossier. */
  playableOnly?: boolean;
  /** Auto-clicker (Paramètres › Auto-clicker, et l'overlay en jeu). */
  autoClicker: AutoClickerSettings;
  /** Détecteur de rythme (Paramètres › Auto-clicker ; zones réglées jeu par jeu, `GameMetadata.pixelTriggers`). */
  pixelTrigger: PixelTriggerSettings;
  /** Overlay en jeu (Maj+Tab pendant qu'un jeu lancé depuis DLSGM tourne). */
  overlayEnabled: boolean;
  /** Copie des sauvegardes du jeu à chaque fermeture (voir src/main/save-backups.ts). */
  autoBackupSaves: boolean;
  /** Fermer la fenêtre la cache dans la zone de notification au lieu de quitter. */
  closeToTray: boolean;
  /**
   * Racine des dossiers de travaux (data mining...) : `<racine>/<ID>/`.
   * Vide = Documents/DLSGM/Work. Voir src/main/workspace.ts.
   */
  workspaceFolder: string;
  /**
   * Refaire les fetchs DLsite en échec à travers Private Internet Access,
   * connecté le temps des fetchs à `piaRegion` (restriction régionale).
   */
  piaRetry: boolean;
  /** Région PIA (identifiant de `piactl get regions`, ex: jp-tokyo). */
  piaRegion: string;
  /** Enregistreur de macros (Paramètres › Outils en jeu ; macros par jeu dans macros.db). */
  macroRecorder: MacroRecorderSettings;
  /** Dossier d'installation de Textractor (sous-dossiers x86 / x64 avec TextractorCLI.exe). */
  textractorPath: string;
  /** Où va le texte du fil choisi : presse-papiers, fichier du dossier de travaux, ou les deux. */
  textractorOutput: 'clipboard' | 'file' | 'both';
  /** Bouton « Extraire images et sons » sur la page des jeux RPG Maker MV/MZ chiffrés. */
  rpgMakerExtractor: boolean;
  /** Traduction à l'écran (OCR de Windows + traducteur), raccourci pendant une partie. */
  ocrTranslate: OcrTranslateSettings;
  /** Dossier de Locale Emulator (LEProc.exe), pour « Lancer en japonais ». */
  localeEmulatorPath: string;
  /** Captures d'écran du jeu (raccourci pendant une partie, overlay). */
  screenshot: ScreenshotSettings;
  /** Super bouton panique (Paramètres › Affichage). */
  superPanic: SuperPanicSettings;
  /** Chercher une nouvelle version au démarrage (Paramètres › Mises à jour). */
  checkUpdatesOnStartup: boolean;
  /**
   * Langue de l'interface : `system` (celle du système si l'interface y est
   * traduite, sinon anglais) ou le code d'un fichier de `locales/` (`fr`, `en`, `ja`…).
   */
  uiLanguage: string;
  /**
   * Thème de couleur : id d'une palette de src/shared/themes.ts, `random`
   * (une palette tirée à chaque démarrage) ou `turbo` (couleurs générées à
   * chaque démarrage). Absent dans les réglages d'avant les thèmes : `neon`, le thème par défaut.
   */
  theme?: string;
  /** Palettes créées par l'utilisateur (src/shared/themes.ts), enregistrées par `save-custom-themes`. Absent avant les palettes perso : aucune. */
  customThemes?: CustomTheme[];
  /**
   * Assistant du premier lancement à afficher (langue, dossier, thème). Écrit
   * à `true` seulement dans un settings.db neuf (valeurs par défaut du store) :
   * absent pour une installation existante, `false` une fois l'assistant fini.
   */
  onboardingPending?: boolean;
}

/** Version de l'application et mode d'installation (src/main/updater.ts). */
export interface AppUpdateInfo {
  version: string;
  /** Exécutable portable : pas de mise à jour automatique, seulement un pop-up. */
  portable: boolean;
  /** electron-updater peut télécharger et installer (installeur Windows, macOS). */
  selfUpdate: boolean;
}

/** Avancement du téléchargement d'une mise à jour (barre au-dessus de la barre des touches). */
export interface UpdateDownloadProgress {
  version: string;
  /** 0 à 100. */
  percent: number;
}

export type UpdateCheckResult =
  | { status: 'up-to-date' | 'available'; version: string }
  | { status: 'error'; message: string }
  | { status: 'busy' };

/** Super bouton panique (src/main/super-panic.ts). */
export interface SuperPanicSettings {
  enabled: boolean;
  /** Raccourci global, jamais Alt+Espace (panique simple) ni Maj+Tab. */
  hotkey: string;
  /** Fenêtre de travail ouverte : adresse web, chemin d'une appli ou d'un document ; vide = rien. */
  target: string;
  /** Coupe le son de l'ordinateur (rétabli au second appui, s'il n'était pas déjà coupé). */
  mute: boolean;
}

export interface ScreenshotSettings {
  enabled: boolean;
  hotkey: string;
}

/** Capture d'un jeu (`<travaux>/<ID>/captures/<file>`), servie par `atom://capture/<ID>/<file>`. */
export interface CaptureInfo {
  file: string;
  size: number;
  /** Date ISO. */
  date: string;
}

/** Fil de texte capté par Textractor (un hook dans un processus du jeu). */
export interface TextractorThread {
  key: string;
  name: string;
  hookcode: string;
  lastText: string;
  count: number;
}

/** Session Textractor d'une partie (voir src/main/textractor.ts). */
export interface TextractorView {
  running: boolean;
  error: string | null;
  attachedPids: number[];
  /** Les plus bavards d'abord. */
  threads: TextractorThread[];
  /** Hookcode du fil envoyé au presse-papiers / au fichier (null : tous au fichier, rien au presse-papiers). */
  selectedHook: string | null;
}

/** Taille d'un dossier de jeu (voir src/main/disk-usage.ts), mise en cache. */
export interface GameDiskUsage {
  bytes: number;
  files: number;
  computedAt: number;
  /** Date de modification du dossier au moment du calcul (changée = à recalculer). */
  folderMtimeMs: number;
}

export interface DiskInfo {
  /** Racine du disque (`D:\`). */
  root: string;
  totalBytes: number | null;
  freeBytes: number | null;
}

export interface DiskUsageReport {
  /** Tailles connues des jeux demandés (les autres arrivent par `onDiskUsageChanged`). */
  games: Record<string, GameDiskUsage>;
  /** Disque de chaque jeu (racine). */
  gameDisks: Record<string, string>;
  disks: DiskInfo[];
  /** Jeux encore à mesurer. */
  pending: number;
}

/** Ligne reconnue par l'OCR, en pixels relatifs à la capture (voir src/main/ocr.ts). */
export interface OcrLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bloc de texte (lignes regroupées : une bulle, un menu). */
export type OcrBlock = OcrLine;

/** Kanji d'un mot, avec son sens (KANJIDIC). */
export interface DictKanji {
  char: string;
  meanings: string[];
  /** Sens en français (sinon en anglais). */
  french: boolean;
  on: string[];
  kun: string[];
}

/** Mot du texte lu, avec son sens (dictionnaire hors ligne, voir src/main/dictionary.ts). */
export interface DictToken {
  /** Texte tel qu'à l'écran. */
  text: string;
  /** Forme du dictionnaire quand le mot est conjugué (食べました → 食べる). */
  base: string | null;
  /** Lecture en kana (null : le mot est déjà en kana, ou inconnu). */
  reading: string | null;
  /** Sens, chacun en quelques traductions ; vide = pas un mot du dictionnaire (ponctuation, inconnu). */
  senses: string[][];
  french: boolean;
  kanji: DictKanji[];
}

/** Dictionnaire hors ligne : installé (version) ou non, et téléchargement en cours. */
export interface DictionaryStatus {
  installed: boolean;
  version: string | null;
  /** Étape en cours : téléchargement (octets reçus / total) ou préparation de l'index. */
  progress: { step: 'download' | 'build'; received: number; total: number } | null;
  error: string | null;
}

/** Traduction à l'écran (voir src/main/ocr.ts et translator.ts). */
export interface OcrTranslateSettings {
  enabled: boolean;
  hotkey: string;
  /** Langue OCR de Windows (balise : ja, en-US, zh-Hans...). */
  source: string;
  /** Langue de traduction (code court : fr, en...). */
  target: string;
  /**
   * none : texte reconnu seul ; dictionary : sens de chaque mot et kanji, hors
   * ligne (JMdict / KANJIDIC) ; local : serveur LLM compatible OpenAI sur ce
   * PC ; deepl / google : service en ligne (clé).
   */
  engine: 'none' | 'dictionary' | 'local' | 'deepl' | 'google';
  /** Adresse du serveur local (Ollama, LM Studio, llama.cpp...), ex: http://127.0.0.1:11434/v1. */
  localUrl: string;
  localModel: string;
}

/** Ce qu'affiche la fenêtre de traduction posée sur le jeu (#ocr-view). */
export interface OcrView {
  status: 'idle' | 'reading' | 'translating' | 'done' | 'error';
  /** Origine de la capture en DIP (coin de la zone client du jeu) et sa taille. */
  area: { x: number; y: number; width: number; height: number } | null;
  /** Blocs en DIP relatifs à `area`, avec leur traduction (null : pas encore, ou pas de traduction). */
  blocks: (OcrBlock & { translation: string | null; words?: DictToken[] })[];
  error: string | null;
  engine: OcrTranslateSettings['engine'];
  /** Langue des sens demandée (dictionnaire : français si JMdict en a, sinon anglais). */
  target?: string;
}

/** Résultat de l'extraction des ressources RPG Maker (voir src/main/rpgmaker-assets.ts). */
export interface RpgMakerExtractResult {
  files: number;
  keySource: 'system' | 'image';
  failed: string[];
  /** Dossier de sortie, relatif au dossier de travaux du jeu. */
  folder: string;
}

/** Enregistreur de macros (voir src/main/macro-recorder.ts). */
export interface MacroRecorderSettings {
  enabled: boolean;
  /** Raccourci global : démarre / arrête l'enregistrement. */
  recordHotkey: string;
  /** Raccourci global : lance / arrête la macro active du jeu. */
  playHotkey: string;
}

/**
 * Étape d'une macro : `[t, type, code, a, b]`, `t` en ms depuis le début.
 * Types : 0 touche enfoncée / 1 relâchée (code = touche virtuelle, a = code
 * de balayage, b = touche étendue 0|1) ; 2 bouton enfoncé / 3 relâché / 4
 * déplacement bouton tenu (code = 0 gauche, 1 droit, 2 milieu ; a, b =
 * position en pixels physiques relative à la zone client du jeu).
 */
export type MacroStep = [t: number, kind: number, code: number, a: number, b: number];

export interface GameMacro {
  id: string;
  name: string;
  createdAt: string;
  /** Rejouée en boucle jusqu'à l'arrêt (sinon une fois). */
  loop: boolean;
  /** Durée d'un tour (jusqu'à l'arrêt de l'enregistrement) : l'attente avant de reboucler. */
  durationMs: number;
  steps: MacroStep[];
}

/** Macros d'un jeu (macros.db, une entrée par ID ; jamais dans le cache ni en LAN). */
export interface GameMacros {
  macros: GameMacro[];
  /** Macro jouée par le raccourci de lecture (null : la plus récente). */
  activeId: string | null;
}

export interface MacroRecorderStatus {
  available: boolean;
  recording: boolean;
  playing: boolean;
  /** Lecture suspendue : le jeu n'est plus au premier plan. */
  paused: boolean;
  /** Un jeu lancé depuis DLSGM où l'enregistreur a été ajouté tourne. */
  inGame: boolean;
  hotkeysActive: boolean;
  /** Étapes enregistrées (en cours ou dernier enregistrement). */
  stepCount: number;
  /** Tours joués par la lecture en boucle. */
  loops: number;
  playingMacroId: string | null;
  error: string | null;
}

export interface LanAddress {
  /** Nom de l'interface Windows (Ethernet, Wi-Fi, adaptateur du VPN...). */
  interface: string;
  address: string;
}

/** Adresses IP (voir src/main/ip-check.ts). */
export interface IpCheckResult {
  lan: LanAddress[];
  /** IP publique telle que DLsite la voit (même chemin réseau : proxy / VPN). */
  wan?: { ip: string; country: string | null; region: string | null; city: string | null; org: string | null };
  wanError?: string;
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

export type ClickerButton = 'left' | 'right' | 'middle';

/** Auto-clicker façon OP Auto Clicker (voir src/main/auto-clicker.ts, Windows). */
export interface AutoClickerSettings {
  /**
   * Auto-clicker activé. Même activé, le raccourci n'existe que pendant
   * qu'un jeu lancé depuis DLSGM tourne, et les clics ne partent que vers ce jeu.
   */
  enabled: boolean;
  /** Raccourci marche / arrêt (accélérateur Electron, ex: F6). */
  hotkey: string;
  /** Délai entre deux clics (ou doubles clics), en millisecondes. */
  intervalMs: number;
  button: ClickerButton;
  double: boolean;
  /** Nombre de clics avant arrêt automatique ; 0 = jusqu'à l'arrêt. */
  repeat: number;
  /** null : là où est le curseur ; sinon un point fixe de l'écran (coordonnées Electron, DIP). */
  position: { x: number; y: number } | null;
}

export interface AutoClickerStatus {
  /** Windows uniquement. */
  available: boolean;
  running: boolean;
  /** En marche mais en pause : la fenêtre au premier plan n'est pas celle du jeu. */
  paused: boolean;
  /** Un jeu lancé depuis DLSGM, avec l'auto-clicker permis, tourne : le raccourci est actif. */
  inGame: boolean;
  /** Dernier démarrage : de l'appui sur le raccourci (ou le bouton) au premier clic, en ms. */
  lastStartLatencyMs: number | null;
  /** Dernier arrêt : de l'appui à l'arrêt effectif, en ms. */
  lastStopLatencyMs: number | null;
  /** Le raccourci est bien enregistré (faux s'il est pris par une autre application). */
  hotkeyActive: boolean;
  error: string | null;
}

/**
 * Détecteur de rythme (voir src/main/pixel-trigger.ts, Windows) : clique à
 * un point fixe (ou appuie sur une touche) quand les pixels d'une zone de
 * l'écran bougent ou prennent une couleur — pour les jeux de rythme.
 */
export interface PixelTriggerSettings {
  /** Interrupteur général. Même activé, n'agit que pendant un jeu lancé depuis DLSGM qui a des zones actives. */
  enabled: boolean;
  /** Raccourci marche / arrêt (accélérateur Electron, ex: F7). */
  hotkey: string;
}

/** `motion` : les pixels changent d'une image à l'autre ; `color` : ils ont la couleur visée. */
export type PixelTriggerMode = 'motion' | 'color';

/** Une zone surveillée (une « piste » d'un jeu de rythme) et ce qu'elle déclenche. */
export interface PixelTrigger {
  /** Identifiant aléatoire (compteurs du statut). */
  id: string;
  name: string;
  enabled: boolean;
  mode: PixelTriggerMode;
  /** Rectangle surveillé, coordonnées Electron (DIP) ; null = pas encore visé. */
  zone: { x: number; y: number; width: number; height: number } | null;
  /** Couleur visée (#rrggbb), mode `color`. */
  color: string;
  /**
   * Écart toléré par canal (0-255) : mode `color`, écart à la couleur visée ;
   * mode `motion`, écart au-delà duquel un pixel compte comme changé.
   */
  tolerance: number;
  /** Part des pixels de la zone qui doivent correspondre (1-100 %). */
  minPercent: number;
  action: 'click' | 'key';
  button: ClickerButton;
  /** Point cliqué (DIP) ; null = centre de la zone. */
  clickPoint: { x: number; y: number } | null;
  /** Touche appuyée (action `key`), nom de lib/pixelTrigger.ts (ex: 'Space', 'D'). */
  key: string;
  /** Attente entre la détection et l'action, en ms (zone placée en amont de la ligne de frappe). */
  delayMs: number;
  /** Maintenir le bouton / la touche tant que la zone correspond (notes longues). */
  hold: boolean;
  /** Délai minimal entre deux déclenchements de cette zone, en ms. */
  cooldownMs: number;
}

export interface PixelTriggerStatus {
  /** Windows uniquement. */
  available: boolean;
  running: boolean;
  /** En marche mais en pause : la fenêtre au premier plan n'est pas celle du jeu. */
  paused: boolean;
  /** Un jeu lancé depuis DLSGM avec au moins une zone active tourne : le raccourci est actif. */
  inGame: boolean;
  hotkeyActive: boolean;
  /** Zones surveillées pendant la partie en cours. */
  zoneCount: number;
  /** Déclenchements depuis le dernier démarrage, par `PixelTrigger.id`. */
  hits: Record<string, number>;
  /** Durée moyenne d'un tour de surveillance (capture de toutes les zones), en ms. */
  frameMs: number | null;
  error: string | null;
}

/** Visée d'une zone : position du curseur (DIP) et couleur du pixel dessous. */
export interface PixelTarget {
  x: number;
  y: number;
  color: string;
}

/** Jeu lancé depuis DLSGM, affiché dans l'overlay (Maj+Tab). */
export interface OverlayGame {
  id: string;
  name: string;
  /** Début de la session en cours (ISO). */
  startedAt: string;
  /** Temps de jeu enregistré avant cette session, en secondes. */
  previousPlayTime: number;
  sessionCount: number;
  lastPlayed: string | null;
  /** Auto-clicker ajouté à ce jeu (case de l'overlay ; `autoClickerEnabled` dans la fiche, décoché par défaut). */
  autoClickerEnabled: boolean;
  /** Détecteur de rythme ajouté à ce jeu (case de l'overlay ; `pixelTriggerEnabled` dans la fiche, décoché par défaut). */
  pixelTriggerEnabled: boolean;
  /** Enregistreur de macros ajouté à ce jeu (case de l'overlay ; `macroEnabled` dans la fiche, décoché par défaut). */
  macroEnabled: boolean;
}

/** Zones dessinées par-dessus le jeu (src/main/trigger-zones.ts) : coordonnées DIP de l'écran, `origin` = coin de la fenêtre. */
export interface TriggerZonesView {
  origin: { x: number; y: number };
  zones: { id: string; name: string; zone: { x: number; y: number; width: number; height: number }; delayMs: number }[];
}

export interface OverlayState {
  games: OverlayGame[];
  clicker: AutoClickerStatus;
  clickerSettings: AutoClickerSettings;
  trigger: PixelTriggerStatus;
  triggerSettings: PixelTriggerSettings;
  /** Zones du détecteur de rythme de chaque jeu en cours, par ID. */
  gameTriggers: Record<string, PixelTrigger[]>;
  macro: MacroRecorderStatus;
  macroSettings: MacroRecorderSettings;
  /** Macros de chaque jeu en cours où l'enregistreur a été ajouté, par ID. */
  gameMacros: Record<string, GameMacros>;
  /** Sessions Textractor des jeux en cours lancés avec Textractor, par ID. */
  textractor: Record<string, TextractorView>;
  /** Traduction à l'écran activée, et son raccourci (bouton de l'overlay). */
  ocr: { enabled: boolean; hotkey: string };
  /** Captures activées, et leur raccourci. */
  screenshot: ScreenshotSettings;
}

/** Taille des jaquettes d'une étagère de l'accueil. */
export type ShelfSize = 'small' | 'medium' | 'large';

export interface HomeShelfPrefs {
  /** Étagère masquée sur l'accueil (la collection reste un filtre de la bibliothèque). */
  hidden?: boolean;
  size?: ShelfSize;
}

export interface GameCollection {
  id: string;
  name: string;
  /**
   * Règles d'ajout automatique (voir renderer lib/collections.ts) : un jeu est
   * dans la collection s'il y a été ajouté à la main OU s'il correspond aux règles.
   */
  rules?: CollectionRules;
}

/**
 * Champ testé par une condition : tag DLsite (clé japonaise), tag perso, type
 * d'œuvre, fini (sans valeur), temps de jeu (`value` = seuil en minutes :
 * au moins ce temps, moins avec `negate`), ou un champ créateur.
 */
export type CollectionRuleField =
  | 'genre'
  | 'customTag'
  | 'category'
  | 'completed'
  | 'playTime'
  | 'circle'
  | 'brand'
  | 'publisher'
  | 'label'
  | 'series'
  | 'author'
  | 'writer'
  | 'scenario'
  | 'illustration'
  | 'voice_actor'
  | 'music';

export interface CollectionCondition {
  field: CollectionRuleField;
  value: string;
  /** Cercle / marque : identifiant DLsite (RG…/BG…), indépendant de la langue. */
  makerId?: string | null;
  /** Vrai : le jeu ne doit PAS avoir cette valeur. */
  negate?: boolean;
}

/**
 * (groupe 1 OU groupe 2 OU …) ET AUCUNE des exclusions. Un groupe est vrai
 * quand toutes ses conditions le sont. Sans groupe non vide, les règles
 * n'ajoutent aucun jeu.
 */
export interface CollectionRules {
  groups: CollectionCondition[][];
  exclude: CollectionCondition[];
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
  /** Import réussi : identifiant permettant de mettre son archive à la corbeille. */
  importId?: string;
  /** Version et DLC lus dans les noms (archive, archive interne, dossiers). */
  version?: string | null;
  dlc?: boolean;
  /**
   * Échec faute de mot de passe (aucun des mots de passe connus ou trouvés
   * n'a marché) : identifiant à passer à `retryArchiveImport` avec un mot de
   * passe — le renderer ne désigne jamais l'archive par son chemin.
   */
  retryId?: string;
}

/** Origine des fichiers d'un jeu (`<jeu>/.dlsgm/install.json`) : archive importée ou ancien nom du dossier. */
export interface InstallInfo {
  /** Nom de l'archive ou ancien nom du dossier. */
  source: string;
  version: string | null;
  dlc: boolean;
  /** Date ISO de l'import ou du renommage. */
  date: string;
}

/** Dossier du dossier de jeux qui contient un ID sans porter exactement ce nom (voir folder-rename.ts). */
export interface MisnamedFolder {
  folder: string;
  gameId: string;
  version: string | null;
  dlc: boolean;
  /** Renommage impossible : `exists` = un dossier porte déjà cet ID, `duplicate` = plusieurs dossiers pour le même ID. */
  conflict?: 'exists' | 'duplicate';
}

/** Bilan de santé de la bibliothèque (src/main/library-health.ts) : constats seulement, rien n'est corrigé d'office. */
export interface LibraryHealthReport {
  checkedAt: string;
  /** Dossiers de jeux présents. */
  gameCount: number;
  /** Jeux (catégorie DLsite « jeu ») sans exécutable trouvé ; `chosenMissing` : celui choisi à la main a disparu. */
  noExecutable: { gameId: string; chosenMissing: string | null }[];
  fetchFailed: { gameId: string; error: string | null }[];
  /** Images DLsite absentes du cache (jaquette, nombre d'échantillons), ou téléchargement resté incomplet. */
  missingImages: { gameId: string; cover: boolean; samples: number }[];
  misnamed: MisnamedFolder[];
  /** Fiches gardées dont le dossier a disparu (invisibles dans la bibliothèque). */
  orphans: { gameId: string; name: string; failed: boolean }[];
  /** Patchs installés dont des fichiers ajoutés ou des copies d'origine ont disparu. */
  brokenPatches: { gameId: string; patchId: string; name: string; missingFiles: string[]; missingBackups: string[]; isLast: boolean }[];
}

export interface FolderRenameResult {
  folder: string;
  gameId?: string;
  error?: string;
}

/** Mise à la corbeille des archives importées (toutes leurs parties). */
export interface TrashArchivesResult {
  trashed: number;
  errors: string[];
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
  /** Arguments passés à l'exécutable au lancement (`-dx11`...), saisis sur la page du jeu. Jamais partagés en LAN. */
  launchArguments?: string;
  /** Jeu exclu de la sandbox (lancé normalement même si `sandboxLaunch` est actif). */
  sandboxDisabled?: boolean;
  /** Marqué comme fini par l'utilisateur (macaron sur la jaquette). Donnée personnelle, jamais partagée en LAN. */
  completed?: boolean;
  /** Auto-clicker ajouté à ce jeu (case de l'overlay, opt-in). Donnée personnelle, jamais partagée en LAN. */
  autoClickerEnabled?: boolean;
  /** Détecteur de rythme ajouté à ce jeu (case de l'overlay, opt-in). Donnée personnelle, jamais partagée en LAN. */
  pixelTriggerEnabled?: boolean;
  /** Enregistreur de macros ajouté à ce jeu (case de l'overlay, opt-in ; macros dans macros.db). Donnée personnelle, jamais partagée en LAN. */
  macroEnabled?: boolean;
  /** Lancer ce jeu en locale japonaise via Locale Emulator (page du jeu). Donnée personnelle, jamais partagée en LAN. */
  localeEmulator?: boolean;
  /** Lancer ce jeu avec Textractor (page du jeu). Donnée personnelle, jamais partagée en LAN. */
  textractorEnabled?: boolean;
  /** Hookcode du fil Textractor choisi pour ce jeu (retrouvé aux lancements suivants). */
  textractorHook?: string;
  /** Zones du détecteur de rythme pour ce jeu. Donnée personnelle, jamais partagée en LAN. */
  pixelTriggers?: PixelTrigger[];
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
  /** D'où viennent les fichiers (import d'archive, renommage) ; null si DLSGM ne le sait pas. */
  install: InstallInfo | null;
}

export interface ElectronAPI {
  // Infos App
  /** process.platform du processus main ('win32', 'darwin'...) : sert à masquer les outils Windows-only sur les autres OS. */
  platform: string;
  getUserDataPath(): Promise<string>;

  // Gestion des paramètres
  getSettings(): Promise<AppSettings>;
  /** Langues préférées du système (app.getPreferredSystemLanguages). */
  getSystemLanguages(): Promise<string[]>;
  /** Quitte l'application (même avec `closeToTray`). */
  quitApp(): void;
  /** Thème résolu par main (le même pour toutes les fenêtres). */
  getActiveTheme(): Promise<ActiveTheme>;
  /** Enregistre la liste des palettes perso (vérifiée par main), renvoie la liste retenue. */
  saveCustomThemes(list: CustomTheme[]): Promise<CustomTheme[]>;
  /** Nouveau tirage du thème (modes aléatoire et turbo). */
  rerollTheme(): Promise<ActiveTheme>;
  /** Icône aux couleurs du thème (PNG en data URL) pour la fenêtre et la zone de notification. */
  setAppIcon(pngDataUrl: string): void;
  onThemeChanged(callback: (theme: ActiveTheme) => void): () => void;
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
  /** Plateformes dont une version est présente dans le dossier de chaque jeu (fichiers .exe, .app/.dmg, .apk). */
  detectGamePlatforms(gameIds: string[]): Promise<Record<string, OsPlatform[]>>;
  /** Déplacement de la bibliothèque vers `target` : vérification et description (src/main/library-move.ts). */
  planLibraryMove(target: string): Promise<{ ok: true; plan: LibraryMovePlan; busy: string | null } | { ok: false; error: string }>;
  /** Déplace la bibliothèque, puis change `destinationFolder` (seulement en cas de succès). */
  moveLibrary(target: string): Promise<{ ok: true; result: LibraryMoveResult } | { ok: false; error: string }>;
  onLibraryMoveProgress(callback: (progress: LibraryMoveProgress) => void): () => void;
  /** Sélecteur de fichier pour la fenêtre de travail du super bouton panique (null : annulé). */
  chooseSuperPanicTarget(): Promise<string | null>;
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
  /** Met à la corbeille les archives (et leurs parties) des imports réussis donnés. */
  trashImportedArchives(importIds: string[]): Promise<TrashArchivesResult>;
  /** Réessaie un import en échec faute de mot de passe ; `remember` l'ajoute aux mots de passe essayés d'office. */
  retryArchiveImport(retryId: string, password: string, remember: boolean): Promise<ArchiveImportResult>;
  /** Gestionnaire de mots de passe d'archives (essayés automatiquement à chaque import). */
  listArchivePasswords(): Promise<string[]>;
  /** Ajoute un mot de passe au gestionnaire (sans doublon) ; rend la liste à jour. */
  addArchivePassword(password: string): Promise<string[]>;
  removeArchivePassword(password: string): Promise<string[]>;

  /** Dossiers qui contiennent un ID DLsite sans être nommés exactement d'après lui. */
  findMisnamedFolders(): Promise<MisnamedFolder[]>;
  /** Renomme ces dossiers d'après leur ID (jamais par-dessus un dossier existant). */
  renameMisnamedFolders(folders: string[]): Promise<FolderRenameResult[]>;
  /** Bilan de santé de la bibliothèque (constats seulement). */
  checkLibraryHealth(): Promise<LibraryHealthReport>;

  /** Copie cache.db dans userData/db_backups (5 dernières gardées) ; renvoie le chemin de la copie. */
  snapshotCache(): Promise<string>;

  /** IP locales (LAN) et publique (WAN, via ipinfo.io par le même chemin que DLsite). */
  checkIp(): Promise<IpCheckResult>;
  /** Accès à DLsite avec le proxy enregistré : statut HTTP et durée ; lève l'erreur réseau sinon. */
  testDlsiteConnection(): Promise<{ status: number; ms: number }>;

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
  /** Racine effective (paramètre, ou Documents/DLSGM/Work si vide). */
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

  // Overlay en jeu et auto-clicker (src/main/overlay.ts, src/main/auto-clicker.ts)
  getOverlayState(): Promise<OverlayState>;
  hideOverlay(): Promise<void>;
  getAutoClickerStatus(): Promise<AutoClickerStatus>;
  /** Position du curseur (coordonnées Electron) après `delayMs`, pour fixer l'endroit des clics. */
  captureCursorPosition(delayMs: number): Promise<{ x: number; y: number }>;
  onAutoClickerStatus(callback: (status: AutoClickerStatus) => void): () => void;
  /** Jeux en cours changés (overlay) ; renvoie la fonction de désabonnement. */
  onOverlayStateChanged(callback: () => void): () => void;
  /** L'overlay vient d'être affiché (Maj+Tab). */
  onOverlayShown(callback: () => void): () => void;
  /** Témoin de l'auto-clicker : déplier (réglages rapides, seulement à l'arrêt) ou replier. */
  setClickerHudExpanded(expanded: boolean): Promise<void>;
  /** Intervalle / raccourci changés depuis le témoin (enregistrés tout de suite). */
  saveClickerQuickSettings(patch: { intervalMs?: number; hotkey?: string }): Promise<AutoClickerStatus>;
  /** Overlay : ajoute ou retire l'auto-clicker d'un jeu en cours (enregistré dans sa fiche). */
  setGameAutoClicker(gameId: string, enabled: boolean): Promise<void>;
  onClickerHudExpanded(callback: (expanded: boolean) => void): () => void;
  // Détecteur de rythme (src/main/pixel-trigger.ts)
  getPixelTriggerState(): Promise<{ status: PixelTriggerStatus; settings: PixelTriggerSettings }>;
  /** Overlay : ajoute ou retire le détecteur de rythme d'un jeu en cours (enregistré dans sa fiche). */
  setGamePixelTrigger(gameId: string, enabled: boolean): Promise<void>;
  /** Témoin du détecteur : déplier (réglages rapides, seulement à l'arrêt) ou replier. */
  setTriggerHudExpanded(expanded: boolean): Promise<void>;
  /** Témoin du détecteur : raccourci, enregistré tout de suite. */
  saveTriggerQuickSettings(patch: { hotkey?: string }): Promise<PixelTriggerStatus>;
  // Textractor (src/main/textractor.ts) et ressources RPG Maker (src/main/rpgmaker-assets.ts)
  /** Fil Textractor envoyé au presse-papiers / au fichier pour ce jeu (null : aucun). */
  setTextractorHook(gameId: string, hookcode: string | null): Promise<void>;
  /** Textractor trouvé (TextractorCLI x86 / x64) dans ce dossier, ou celui des paramètres. */
  checkTextractor(dir?: string): Promise<{ x86: boolean; x64: boolean }>;
  onTextractorChanged(callback: (gameId: string, view: TextractorView) => void): () => void;
  /** Déchiffre images et sons d'un jeu RPG Maker MV/MZ dans son dossier de travaux. */
  extractRpgMakerAssets(gameId: string): Promise<RpgMakerExtractResult>;
  onRpgMakerExtractProgress(callback: (progress: { gameId: string; done: number; total: number }) => void): () => void;
  // Captures d'écran (src/main/screenshots.ts)
  /** Overlay : capture la fenêtre du jeu en cours (le plus récent) ; null si aucun jeu. */
  takeScreenshot(): Promise<CaptureInfo | null>;
  listCaptures(gameId: string): Promise<CaptureInfo[]>;
  /** Met une capture à la corbeille. */
  deleteCapture(gameId: string, file: string): Promise<CaptureInfo[]>;
  openCapturesFolder(gameId: string): Promise<void>;
  onCapturesChanged(callback: (gameId: string) => void): () => void;
  /** Tailles connues des jeux donnés, et mesure en tâche de fond de celles qui manquent (`force` : toutes). */
  getDiskUsage(gameIds: string[], force?: boolean): Promise<DiskUsageReport>;
  onDiskUsageChanged(callback: (gameId: string, usage: GameDiskUsage, pending: number) => void): () => void;
  /** Locale Emulator dans ce dossier (ou celui des paramètres) : LEProc présent, et installé (LECommonLibrary.dll). */
  checkLocaleEmulator(dir?: string): Promise<{ found: boolean; installed: boolean }>;
  // Traduction à l'écran (src/main/ocr.ts, translator.ts, ocr-view.ts)
  /** Fenêtre #ocr-view : état affiché (au montage), puis mises à jour. */
  getOcrView(): Promise<OcrView | null>;
  onOcrView(callback: (view: OcrView) => void): () => void;
  /** Langues OCR installées dans Windows (balises). */
  getOcrLanguages(): Promise<string[]>;
  /** Overlay : lit et traduit la fenêtre du jeu (comme le raccourci). */
  ocrTranslateNow(): Promise<void>;
  /** Dictionnaire hors ligne (moteur « dictionary ») : état, installation (≈14 Mo), suppression. */
  getDictionaryStatus(): Promise<DictionaryStatus>;
  installDictionary(): Promise<DictionaryStatus>;
  removeDictionary(): Promise<DictionaryStatus>;
  onDictionaryStatus(callback: (status: DictionaryStatus) => void): () => void;
  /** Mots et sens d'un texte japonais (dictionnaire hors ligne). */
  lookupJapanese(text: string): Promise<DictToken[]>;
  /** Clés enregistrées (jamais renvoyées en clair). */
  getTranslationKeys(): Promise<{ deepl: boolean; google: boolean }>;
  /** Enregistre (chiffrée) ou efface (null) la clé d'un service. */
  setTranslationKey(engine: 'deepl' | 'google', key: string | null): Promise<void>;
  // Enregistreur de macros (src/main/macro-recorder.ts)
  /** Overlay : ajoute ou retire l'enregistreur de macros d'un jeu en cours (enregistré dans sa fiche). */
  setGameMacroEnabled(gameId: string, enabled: boolean): Promise<void>;
  /** Macro jouée par le raccourci de lecture. */
  setActiveMacro(gameId: string, macroId: string): Promise<GameMacros>;
  updateMacro(gameId: string, macroId: string, patch: { loop?: boolean; name?: string }): Promise<GameMacros>;
  deleteMacro(gameId: string, macroId: string): Promise<GameMacros>;
  /** Enregistrer / arrêter, lire / arrêter (comme les raccourcis). */
  toggleMacroRecording(): Promise<MacroRecorderStatus>;
  toggleMacroPlayback(): Promise<MacroRecorderStatus>;
  onMacroStatus(callback: (status: MacroRecorderStatus) => void): () => void;
  /** Fenêtre des zones (#trigger-zones) : zones à dessiner (au montage, puis à chaque changement). */
  getTriggerZones(): Promise<TriggerZonesView | null>;
  onTriggerZones(callback: (view: TriggerZonesView) => void): () => void;
  onPixelTriggerStatus(callback: (status: PixelTriggerStatus) => void): () => void;
  /** Après `delayMs` (le temps de viser dans le jeu) : position du curseur et couleur du pixel dessous. */
  capturePixelTarget(delayMs: number, hideOverlay?: boolean): Promise<PixelTarget>;
  /** Overlay : remplace les zones d'un jeu (enregistrées dans sa fiche, appliquées tout de suite). */
  setGamePixelTriggers(gameId: string, triggers: PixelTrigger[]): Promise<PixelTrigger[]>;
  /** Une fiche a été modifiée hors de la fenêtre principale (overlay) : `patch` à fusionner dans sa copie. */
  onCacheEntryChanged(callback: (gameId: string, patch: Record<string, unknown>) => void): () => void;
  /** Paramètres modifiés hors de la fenêtre principale (témoin) : à relire. */
  onSettingsChanged(callback: () => void): () => void;
  // Mises à jour (src/main/updater.ts) : les pop-ups sont affichés par main.
  getAppUpdateInfo(): Promise<AppUpdateInfo>;
  checkForUpdates(): Promise<UpdateCheckResult>;
  /** Téléchargement d'une mise à jour en cours (null : terminé ou abandonné). */
  onUpdateDownloadProgress(callback: (progress: UpdateDownloadProgress | null) => void): () => void;

  // Événements (du Main vers le Renderer)
  /** Mode panique basculé (Alt+Espace) ou fixé (`active`, super bouton panique). */
  onPanicTriggered(callback: (active?: boolean) => void): void;
  /** Progression des envois et réceptions ; renvoie la fonction de désabonnement. */
  onLanTransferProgress(callback: (progress: LanTransferProgress) => void): () => void;
  /** Changements d'état de la réception non demandés par le renderer (arrêt automatique). */
  onLanReceiverStatus(callback: (status: LanReceiverStatus) => void): () => void;
  /** Abonnement aux changements de plein écran (F11, bouton, paramètre) ; renvoie la fonction de désabonnement. */
  onFullscreenChange(callback: (isFullscreen: boolean) => void): () => void;
}
