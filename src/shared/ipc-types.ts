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


  // Récupération des métadonnées DLsite (fetch Node pur, sans dépendance Python)
  fetchGameMetadata(gameId: string, locale: string): Promise<GameMetadata>;

  // Événements (du Main vers le Renderer)
  onPanicTriggered(callback: () => void): void;
}
