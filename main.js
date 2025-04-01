const { app, BrowserWindow, globalShortcut, ipcMain, dialog } = require('electron');
const fs = require('fs');
const settingsPath = 'renderer/data_base/settings.json';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 700,
    minHeight: 570,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // pour simplifier au début
    },
  });

  //win.webContents.openDevTools();
  mainWindow.loadFile('renderer/index.html');
}

app.whenReady().then(createWindow);

ipcMain.on('update-language', (event, lang) => {
  try {
    if (fs.existsSync(settingsPath)) {
      let settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings.language = lang;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    }
  } catch (error) {
    console.error('Erreur mise à jour langue:', error);
  }
});

// Gérer l'enregistrement du raccourci pour le panic button
ipcMain.on('register-panic-shortcut', (event) => {
  // Enregistre un raccourci global pour le double appui sur espace
  // Comme Electron ne peut pas vraiment détecter un double appui,
  // nous utilisons une combinaison de touches spécifique comme Alt+Space
  globalShortcut.register('Alt+Space', () => {
    console.log('Panic shortcut triggered');
    event.sender.send('panic-button-triggered');
  });
});

// Assurez-vous de libérer les raccourcis quand l'application se ferme
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.on('open-folder-dialog', async (event) => {
  const mainWindow = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    event.reply('selected-folder', result.filePaths[0]);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
