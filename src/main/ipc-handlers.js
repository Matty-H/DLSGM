// src/main/ipc-handlers.js

const { ipcMain, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { IPC_CHANNELS } = require('../shared/constants');

/**
 * Configure tous les gestionnaires IPC
 */
function setupIpcHandlers() {
  // Gestionnaire pour la mise à jour de la langue
  ipcMain.on(IPC_CHANNELS.UPDATE_LANGUAGE, (event, lang) => {
    try {
      const settingsPath = path.join(__dirname, '../renderer/data_base/settings.json');
      
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        settings.language = lang;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      }
    } catch (error) {
      console.error('Error updating language:', error);
    }
  });

  // Gestionnaire pour ouvrir le dialogue de sélection de dossier
  ipcMain.on(IPC_CHANNELS.OPEN_FOLDER_DIALOG, async (event) => {
    const mainWindow = BrowserWindow.getFocusedWindow();
    
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        event.reply(IPC_CHANNELS.SELECTED_FOLDER, result.filePaths[0]);
      }
    } catch (error) {
      console.error('Error opening folder dialog:', error);
    }
  });
}

module.exports = { setupIpcHandlers };
