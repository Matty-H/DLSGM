const { app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Gère le stockage des données de l'application dans le dossier userData de l'utilisateur.
 */
class Store {
  constructor(fileName, defaults) {
    const userDataPath = app.getPath('userData');
    this.path = path.join(userDataPath, fileName);
    this.data = this.parseDataFile(this.path, defaults);
  }

  /**
   * Récupère une valeur à partir d'une clé.
   */
  get(key) {
    return this.data[key];
  }

  /**
   * Définit une valeur pour une clé et sauvegarde le fichier.
   */
  set(key, val) {
    this.data[key] = val;
    try {
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du fichier store:', error);
    }
  }

  /**
   * Récupère l'intégralité des données.
   */
  getAll() {
    return this.data;
  }

  /**
   * Remplace l'intégralité des données et sauvegarde.
   */
  setAll(data) {
    this.data = data;
    try {
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde intégrale du store:', error);
    }
  }

  /**
   * Lit le fichier de données ou retourne les valeurs par défaut.
   */
  parseDataFile(filePath, defaults) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (error) {
      console.error('Erreur lors de la lecture du fichier store:', error);
    }
    return defaults;
  }
}

module.exports = Store;
