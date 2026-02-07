// src/renderer/services/SettingsService.js

const fs = require('fs');
const path = require('path');
const { DEFAULT_SETTINGS } = require('../../shared/constants');

/**
 * Service centralisé pour la gestion des paramètres de l'application
 */
class SettingsService {
  constructor(settingsFilePath) {
    this.settingsFilePath = settingsFilePath;
    this.settings = {};
    this.initialize();
  }

  /**
   * Initialise le service en chargeant les paramètres existants
   */
  initialize() {
    this.settings = this.load();
  }

  /**
   * Charge les paramètres depuis le fichier
   * Crée le fichier avec les valeurs par défaut s'il n'existe pas
   * @returns {Object} Les paramètres chargés
   */
  load() {
    console.log('=== Loading settings ===');
    console.log('Settings file path:', this.settingsFilePath);
    
    try {
      if (fs.existsSync(this.settingsFilePath)) {
        const fileContent = fs.readFileSync(this.settingsFilePath, 'utf8');
        const loadedSettings = JSON.parse(fileContent);
        
        console.log('Settings loaded successfully');
        console.log('Destination folder:', loadedSettings.destinationFolder);
        console.log('Refresh rate:', loadedSettings.refreshRate);
        console.log('Language:', loadedSettings.language);
        
        // Fusionner avec les paramètres par défaut pour gérer les nouveaux paramètres
        return {
          ...DEFAULT_SETTINGS,
          ...loadedSettings
        };
      } else {
        console.log('Settings file does not exist, creating with defaults');
        
        // Créer le répertoire parent si nécessaire
        const settingsDir = path.dirname(this.settingsFilePath);
        if (!fs.existsSync(settingsDir)) {
          fs.mkdirSync(settingsDir, { recursive: true });
        }
        
        // Créer le fichier avec les paramètres par défaut
        fs.writeFileSync(
          this.settingsFilePath,
          JSON.stringify(DEFAULT_SETTINGS, null, 2)
        );
        
        return { ...DEFAULT_SETTINGS };
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Sauvegarde les paramètres actuels dans le fichier
   * @returns {boolean} True si la sauvegarde a réussi
   */
  save() {
    try {
      fs.writeFileSync(
        this.settingsFilePath,
        JSON.stringify(this.settings, null, 2)
      );
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  }

  /**
   * Récupère un paramètre spécifique
   * @param {string} key - La clé du paramètre
   * @returns {*} La valeur du paramètre
   */
  get(key) {
    return this.settings[key];
  }

  /**
   * Récupère tous les paramètres
   * @returns {Object} Tous les paramètres
   */
  getAll() {
    return { ...this.settings };
  }

  /**
   * Définit un paramètre spécifique
   * @param {string} key - La clé du paramètre
   * @param {*} value - La valeur à définir
   * @returns {boolean} True si la mise à jour a réussi
   */
  set(key, value) {
    this.settings[key] = value;
    return this.save();
  }

  /**
   * Met à jour plusieurs paramètres à la fois
   * @param {Object} updates - Objet contenant les mises à jour
   * @returns {boolean} True si la mise à jour a réussi
   */
  update(updates) {
    this.settings = {
      ...this.settings,
      ...updates
    };
    return this.save();
  }

  /**
   * Récupère le dossier de destination des jeux
   * @returns {string} Le chemin du dossier
   */
  getDestinationFolder() {
    return this.settings.destinationFolder || '';
  }

  /**
   * Définit le dossier de destination des jeux
   * @param {string} folderPath - Le chemin du dossier
   * @returns {boolean} True si la mise à jour a réussi
   */
  setDestinationFolder(folderPath) {
    return this.set('destinationFolder', folderPath);
  }

  /**
   * Récupère le taux de rafraîchissement
   * @returns {number} Le taux de rafraîchissement en minutes
   */
  getRefreshRate() {
    return Number(this.settings.refreshRate) || DEFAULT_SETTINGS.refreshRate;
  }

  /**
   * Définit le taux de rafraîchissement
   * @param {number} rate - Le taux en minutes
   * @returns {boolean} True si la mise à jour a réussi
   */
  setRefreshRate(rate) {
    return this.set('refreshRate', Number(rate));
  }

  /**
   * Récupère la langue sélectionnée
   * @returns {string} Le code de langue
   */
  getLanguage() {
    return this.settings.language || DEFAULT_SETTINGS.language;
  }

  /**
   * Définit la langue
   * @param {string} lang - Le code de langue
   * @returns {boolean} True si la mise à jour a réussi
   */
  setLanguage(lang) {
    return this.set('language', lang);
  }

  /**
   * Réinitialise tous les paramètres aux valeurs par défaut
   * @returns {boolean} True si la réinitialisation a réussi
   */
  reset() {
    this.settings = { ...DEFAULT_SETTINGS };
    return this.save();
  }

  /**
   * Recharge les paramètres depuis le fichier
   * @returns {Object} Les paramètres rechargés
   */
  reload() {
    this.settings = this.load();
    return this.settings;
  }
}

module.exports = SettingsService;
