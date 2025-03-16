const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 520,
    minHeight: 560,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // pour simplifier au début
    },
  });

  //win.webContents.openDevTools();
  win.loadFile('renderer/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
