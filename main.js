const { app, BrowserWindow, ipcMain, dialog } = require('electron');

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
