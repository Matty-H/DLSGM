// src/shared/constants.js

/**
 * Application-wide constants
 */

// Mapping des catégories DLsite vers leurs noms d'affichage
const CATEGORY_MAP = {
  "ACN": "Action",
  "ADV": "Adventure",
  "QIZ": "Quiz",
  "ICG": "CG/Illustrations",
  "DNV": "Digital Novel",
  "SCM": "Gekiga",
  "IMT": "Illustration Materials",
  "MNG": "Manga",
  "ET3": "Miscellaneous",
  "ETC": "Miscellaneous Game",
  "MUS": "Music",
  "AMT": "Music Materials",
  "NRE": "Novel",
  "PZL": "Puzzle",
  "RPG": "Role Playing",
  "STG": "Shooting",
  "SLN": "Simulation",
  "TBL": "Table",
  "TOL": "Tools/Accessories",
  "TYP": "Typing",
  "MOV": "Video",
  "SOU": "Voice/ASMR",
  "VCM": "Voiced Comic",
  "WBT": "Webtoon"
};

// Expression régulière pour identifier les IDs de jeux DLsite valides
const GAME_ID_REGEX = /^[A-Z]{2}\d{6,9}$/;

// Chemins de fichiers relatifs
const PATHS = {
  CACHE: 'data_base/cache.json',
  SETTINGS: 'data_base/settings.json',
  IMG_CACHE: 'img_cache',
  PYTHON_SCRIPTS: 'pythonScript'
};

// Paramètres par défaut
const DEFAULT_SETTINGS = {
  destinationFolder: '',
  refreshRate: 5,
  language: 'en_US'
};

// Canaux IPC
const IPC_CHANNELS = {
  // Settings
  UPDATE_LANGUAGE: 'update-language',
  OPEN_FOLDER_DIALOG: 'open-folder-dialog',
  SELECTED_FOLDER: 'selected-folder',
  
  // Shortcuts
  REGISTER_PANIC_SHORTCUT: 'register-panic-shortcut',
  PANIC_BUTTON_TRIGGERED: 'panic-button-triggered',
  
  // Games
  LAUNCH_GAME: 'launch-game',
  GAME_CLOSED: 'game-closed',
  UPDATE_GAME_TIME: 'update-game-time'
};

// Messages d'erreur
const ERROR_MESSAGES = {
  GAMES_FOLDER_NOT_FOUND: 'Games folder not found. Please configure the folder in settings.',
  NO_GAMES_FOUND: 'No games found in the configured folder.',
  UNSUPPORTED_OS: 'This operation is not supported on your operating system.',
  GAME_DIR_NOT_CONFIGURED: 'Game directory not configured. Please configure it in settings.',
  NO_APP_FILE: 'No .app file found in the game directory.',
  NO_EXECUTABLE: 'No executable binary found.'
};

// Export avec CommonJS
module.exports = {
  CATEGORY_MAP,
  GAME_ID_REGEX,
  PATHS,
  DEFAULT_SETTINGS,
  IPC_CHANNELS,
  ERROR_MESSAGES
};
