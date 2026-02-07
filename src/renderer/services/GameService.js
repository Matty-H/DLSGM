// src/renderer/services/GameService.js

const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec, spawn } = require('child_process');
const { GAME_ID_REGEX, ERROR_MESSAGES } = require('../../shared/constants');

/**
 * Service centralisé pour la gestion des jeux
 * Responsabilités: scan, lancement, téléchargement d'images, gestion des métadonnées
 */
class GameService {
  constructor(cacheService, settingsService, imgCacheDir, pythonScriptDir) {
    this.cacheService = cacheService;
    this.settingsService = settingsService;
    this.imgCacheDir = imgCacheDir;
    this.pythonScriptDir = pythonScriptDir;
    this.runningGames = new Map(); // gameId -> process
  }

  /**
   * Scanne le dossier de jeux et retourne les IDs de jeux trouvés
   * @returns {string[]} Array d'IDs de jeux
   */
  scanGamesFolder() {
    const gamesFolderPath = this.settingsService.getDestinationFolder();
    
    console.log('=== Scanning games folder ===');
    console.log('Configured games folder path:', gamesFolderPath);
    
    if (!gamesFolderPath) {
      console.warn('No games folder configured in settings');
      return [];
    }
    
    if (!fs.existsSync(gamesFolderPath)) {
      console.error('Games folder does not exist:', gamesFolderPath);
      return [];
    }

    try {
      const files = fs.readdirSync(gamesFolderPath);
      console.log('Total files/folders found:', files.length);
      
      const gameFolders = files.filter(file => GAME_ID_REGEX.test(file));
      console.log('Valid game IDs found:', gameFolders.length);
      console.log('Game IDs:', gameFolders);
      
      return gameFolders;
    } catch (error) {
      console.error('Error scanning games folder:', error);
      return [];
    }
  }

  /**
   * Récupère les jeux non cachés (nouveaux jeux)
   * @returns {string[]} Array d'IDs de jeux non cachés
   */
  getUncachedGames() {
    const allGames = this.scanGamesFolder();
    return allGames.filter(gameId => !this.cacheService.has(gameId));
  }

  /**
   * Purge les jeux obsolètes du cache et des images
   * @returns {{cache: string[], images: string[]}} Jeux purgés
   */
  purgeObsoleteGames() {
    console.log('--- DÉBUT DE LA PURGE DES DONNÉES ---');

    const currentGames = new Set(this.scanGamesFolder());
    const cachedGameIds = this.cacheService.getAllGameIds();
    
    const purgedCache = [];
    const purgedImages = [];

    // Purge du cache
    cachedGameIds.forEach(gameId => {
      if (!currentGames.has(gameId)) {
        purgedCache.push(gameId);
        this.cacheService.delete(gameId);
      }
    });

    if (purgedCache.length > 0) {
      console.log(`Purgé ${purgedCache.length} entrées du cache:`, purgedCache);
    }

    // Purge des images
    if (fs.existsSync(this.imgCacheDir)) {
      const imgFolders = fs.readdirSync(this.imgCacheDir);
      
      imgFolders.forEach(folderName => {
        const folderPath = path.join(this.imgCacheDir, folderName);
        
        if (!currentGames.has(folderName) && !this.cacheService.has(folderName)) {
          purgedImages.push(folderName);
          fs.rmSync(folderPath, { recursive: true, force: true });
          console.log(`Dossier image supprimé: ${folderName}`);
        }
      });
    }

    if (purgedImages.length > 0) {
      console.log(`Purgé ${purgedImages.length} dossiers images:`, purgedImages);
    }

    console.log('--- FIN DE LA PURGE DES DONNÉES ---');

    return { cache: purgedCache, images: purgedImages };
  }

  /**
   * Télécharge une image depuis une URL
   * @param {string} url - URL de l'image
   * @param {string} outputPath - Chemin de destination
   * @returns {Promise<void>}
   */
  downloadImage(url, outputPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath);
      https.get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(outputPath, () => reject(err));
      });
    });
  }

  /**
   * Télécharge toutes les images d'un jeu
   * @param {string} gameId - ID du jeu
   * @param {Object} metadata - Métadonnées du jeu
   * @returns {Promise<void>}
   */
  async downloadGameImages(gameId, metadata) {
    const gameDir = path.join(this.imgCacheDir, gameId);

    if (!fs.existsSync(gameDir)) {
      fs.mkdirSync(gameDir, { recursive: true });
    }

    try {
      // Image principale
      if (metadata.work_image) {
        const workImageUrl = `https:${metadata.work_image}`;
        const workImagePath = path.join(gameDir, 'work_image.jpg');
        console.log(`Téléchargement image principale pour ${gameId}...`);
        await this.downloadImage(workImageUrl, workImagePath);
      }

      // Images d'échantillon
      if (Array.isArray(metadata.sample_images)) {
        for (let i = 0; i < metadata.sample_images.length; i++) {
          const sampleImageUrl = `https:${metadata.sample_images[i]}`;
          const sampleImagePath = path.join(gameDir, `sample_${i + 1}.jpg`);
          console.log(`Téléchargement échantillon ${i + 1} pour ${gameId}...`);
          await this.downloadImage(sampleImageUrl, sampleImagePath);
        }
      }
    } catch (error) {
      console.error(`Erreur téléchargement images pour ${gameId}:`, error);
    }
  }

  /**
   * Récupère les métadonnées d'un jeu via le script Python
   * @param {string} gameId - ID du jeu
   * @returns {Promise<Object>} Les métadonnées
   */
  fetchGameMetadata(gameId) {
    return new Promise((resolve, reject) => {
      const pythonScriptPath = path.join(this.pythonScriptDir, 'fetch_dlsite.py');
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      
      const options = {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      };
      
      exec(`${pythonCmd} "${pythonScriptPath}" "${gameId}"`, options, async (error, stdout, stderr) => {
        if (error) {
          console.error(`Erreur exécution script Python:`, error.message);
          reject(error);
          return;
        }
        
        if (stderr) {
          console.warn(`Messages Python (stderr):`, stderr);
        }

        try {
          // Filtrer les lignes pour ne garder que le JSON
          // Le script Python peut afficher des erreurs ou avertissements avant le JSON
          const lines = stdout.split('\n');
          let jsonStartIndex = -1;
          
          // Chercher la première ligne qui commence par '{'
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('{')) {
              jsonStartIndex = i;
              break;
            }
          }
          
          if (jsonStartIndex === -1) {
            throw new Error('Aucun JSON trouvé dans la sortie du script Python');
          }
          
          // Prendre tout à partir de la première accolade
          const jsonString = lines.slice(jsonStartIndex).join('\n');
          const metadata = JSON.parse(jsonString);
          
          console.log(`Métadonnées récupérées avec succès pour ${gameId}`);
          
          // Sauvegarder dans le cache
          this.cacheService.set(gameId, metadata);
          
          // Télécharger les images
          await this.downloadGameImages(gameId, metadata);
          
          resolve(metadata);
        } catch (parseError) {
          console.error('Erreur parsing métadonnées:', parseError);
          console.error('Sortie complète du script:', stdout);
          reject(parseError);
        }
      });
    });
  }

  /**
   * Lance un jeu
   * @param {string} gameId - ID du jeu
   * @returns {Promise<ChildProcess>} Le processus du jeu
   */
  async launchGame(gameId) {
    const platform = process.platform;
    
    // Vérifier que le jeu n'est pas déjà en cours
    if (this.runningGames.has(gameId)) {
      throw new Error('Game is already running');
    }

    // Pour l'instant, uniquement supporté sur macOS
    if (platform !== 'darwin') {
      throw new Error(ERROR_MESSAGES.UNSUPPORTED_OS);
    }

    const gamesFolderPath = this.settingsService.getDestinationFolder();
    if (!gamesFolderPath) {
      throw new Error(ERROR_MESSAGES.GAME_DIR_NOT_CONFIGURED);
    }

    const gameDirPath = path.join(gamesFolderPath, gameId);
    
    // Trouver le fichier .app
    const files = fs.readdirSync(gameDirPath);
    const appDirName = files.find(file => file.endsWith('.app'));
    
    if (!appDirName) {
      throw new Error(ERROR_MESSAGES.NO_APP_FILE);
    }

    // Trouver l'exécutable
    const macOSDirPath = path.join(gameDirPath, appDirName, 'Contents', 'MacOS');
    const macOSFiles = fs.readdirSync(macOSDirPath);
    const binaryName = macOSFiles[0];
    
    if (!binaryName) {
      throw new Error(ERROR_MESSAGES.NO_EXECUTABLE);
    }

    const executablePath = path.join(macOSDirPath, binaryName);
    
    // Lancer le jeu
    return this.startGameProcess(gameId, executablePath);
  }

  /**
   * Lance le processus d'un jeu et le suit
   * @param {string} gameId - ID du jeu
   * @param {string} executablePath - Chemin de l'exécutable
   * @returns {ChildProcess} Le processus du jeu
   */
  startGameProcess(gameId, executablePath) {
    const startTime = Date.now();
    const gameProcess = spawn(executablePath);

    this.runningGames.set(gameId, gameProcess);

    gameProcess.on('error', (error) => {
      console.error(`Échec lancement jeu ${gameId}:`, error.message);
      this.runningGames.delete(gameId);
    });

    gameProcess.on('close', (code) => {
      const endTime = Date.now();
      const playTimeInSeconds = Math.round((endTime - startTime) / 1000);

      this.runningGames.delete(gameId);
      this.updateGameTime(gameId, playTimeInSeconds);
    });

    return gameProcess;
  }

  /**
   * Met à jour le temps de jeu d'un jeu
   * @param {string} gameId - ID du jeu
   * @param {number} sessionTimeInSeconds - Temps de la session en secondes
   */
  updateGameTime(gameId, sessionTimeInSeconds) {
    const gameEntry = this.cacheService.get(gameId) || {};
    const currentTotalTime = gameEntry.totalPlayTime || 0;
    const newTotalTime = currentTotalTime + sessionTimeInSeconds;

    this.cacheService.update(gameId, {
      totalPlayTime: newTotalTime,
      lastPlayed: new Date().toISOString()
    });
  }

  /**
   * Ouvre le dossier d'un jeu dans l'explorateur
   * @param {string} gameId - ID du jeu
   */
  openGameFolder(gameId) {
    const platform = process.platform;
    const gamesFolderPath = this.settingsService.getDestinationFolder();
    
    if (!gamesFolderPath) {
      throw new Error(ERROR_MESSAGES.GAME_DIR_NOT_CONFIGURED);
    }

    const targetFolderPath = path.join(gamesFolderPath, gameId);
    
    if (!fs.existsSync(targetFolderPath)) {
      throw new Error('Game folder not found');
    }

    const commands = {
      win32: `explorer "${targetFolderPath}"`,
      darwin: `open "${targetFolderPath}"`
    };

    if (commands[platform]) {
      exec(commands[platform]);
    } else {
      throw new Error(ERROR_MESSAGES.UNSUPPORTED_OS);
    }
  }

  /**
   * Réinitialise et re-télécharge toutes les images
   * @returns {Promise<void>}
   */
  async resetAndRedownloadImages() {
    console.log('--- DÉBUT DU RESET DES IMAGES ---');

    // Supprimer tous les dossiers d'images
    if (fs.existsSync(this.imgCacheDir)) {
      const imgFolders = fs.readdirSync(this.imgCacheDir);
      
      for (const folderName of imgFolders) {
        const folderPath = path.join(this.imgCacheDir, folderName);
        try {
          fs.rmSync(folderPath, { recursive: true, force: true });
          console.log(`Dossier supprimé: ${folderName}`);
        } catch (error) {
          console.error(`Erreur suppression ${folderName}:`, error);
        }
      }
    } else {
      fs.mkdirSync(this.imgCacheDir, { recursive: true });
    }

    // Re-télécharger toutes les images
    const gameIds = this.cacheService.getAllGameIds();
    console.log(`Re-téléchargement des images pour ${gameIds.length} jeux...`);

    for (const gameId of gameIds) {
      const metadata = this.cacheService.get(gameId);
      if (!metadata) {
        console.warn(`Pas de metadata pour ${gameId}`);
        continue;
      }

      try {
        await this.downloadGameImages(gameId, metadata);
        console.log(`Images re-téléchargées pour ${gameId}`);
      } catch (error) {
        console.error(`Erreur téléchargement pour ${gameId}:`, error);
      }
    }

    console.log('--- FIN DU RESET DES IMAGES ---');
  }

  /**
   * Vérifie si des jeux sont en cours d'exécution
   * @returns {boolean}
   */
  hasRunningGames() {
    return this.runningGames.size > 0;
  }

  /**
   * Récupère la liste des jeux en cours
   * @returns {string[]} Array d'IDs de jeux en cours
   */
  getRunningGameIds() {
    return Array.from(this.runningGames.keys());
  }
}

module.exports = GameService;
