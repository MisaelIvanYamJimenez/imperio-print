// Proceso principal de Imperio Print.
const path = require('path');
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');

// En modo dev, si NO esta empaquetada y NO tiene la bandera IMPERIO_DEV, salir.
// (Evita ejecuciones accidentales fuera del flujo de desarrollo.)
if (!app.isPackaged && !process.env.IMPERIO_DEV) {
  process.exit(0);
}

const AutoLaunch = require('auto-launch');
const { autoUpdater } = require('electron-updater');

const { PORT } = require('./src/config');
const store = require('./src/store');
const security = require('./src/security');
const printer = require('./src/printer');
const wsServer = require('./src/websocket-server');
const { createTray } = require('./src/tray');

let mainWindow = null;
let tray = null;
app.isQuitting = false;

// --- Single instance lock ---------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });
  bootstrap();
}

// --- Ventana ----------------------------------------------------------------
function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  mainWindow = new BrowserWindow({
    width: 520,
    height: 680,
    show: false,
    resizable: true,
    icon: icon.isEmpty() ? undefined : icon,
    title: 'Imperio Print',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  // Al cerrar la ventana: ocultar en bandeja (no cerrar la app).
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Revisar updates cada vez que se muestra la ventana.
  mainWindow.on('show', () => checkUpdates());
}

function showWindow() {
  if (!mainWindow) createWindow();
  mainWindow.show();
  mainWindow.focus();
}

function sendToUI(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// --- Arranque ---------------------------------------------------------------
function bootstrap() {
  app.whenReady().then(() => {
    createWindow();

    tray = createTray({
      version: app.getVersion(),
      onShow: () => showWindow(),
      onQuit: () => { app.isQuitting = true; app.quit(); }
    });

    // Servidor WebSocket
    wsServer.start({
      getVersion: () => app.getVersion(),
      onLog: (m) => { console.log('[ws]', m); sendToUI('log', m); }
    });

    setupAutoLaunch();
    setupAutoUpdater();
    checkUpdates();

    // Mostrar ventana solo en desarrollo; empaquetada inicia oculta en bandeja.
    if (!app.isPackaged) showWindow();

    app.on('activate', () => showWindow());
  });

  // No salir al cerrar todas las ventanas (vive en bandeja).
  app.on('window-all-closed', (e) => {
    // No hacemos app.quit(): la app permanece en la bandeja.
  });
}

// --- Auto-launch (inicia con Windows, oculto) -------------------------------
function setupAutoLaunch() {
  if (!app.isPackaged) return;
  const launcher = new AutoLaunch({ name: 'Imperio Print', isHidden: true });
  launcher.isEnabled()
    .then((enabled) => { if (!enabled) return launcher.enable(); })
    .catch((err) => console.warn('[auto-launch]', err.message));
}

// --- Auto-updater -----------------------------------------------------------
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => sendToUI('update-event', { type: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => sendToUI('update-event', { type: 'none' }));
  autoUpdater.on('download-progress', (p) => sendToUI('update-event', { type: 'progress', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => sendToUI('update-event', { type: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => sendToUI('update-event', { type: 'error', message: err == null ? 'error' : (err.message || String(err)) }));
}

function checkUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch((err) => console.warn('[updater]', err.message));
}

// --- IPC (UI -> main) -------------------------------------------------------
ipcMain.handle('get-status', () => ({
  version: app.getVersion(),
  port: PORT,
  running: true
}));

ipcMain.handle('get-config', () => ({
  printers: store.get('printers') || {},
  token: security.getToken()
}));

ipcMain.handle('get-printers', async () => {
  return printer.listSystemPrinters();
});

ipcMain.handle('assign-printer', (e, data) => {
  const type = (data && data.printerType) || 'cashier';
  const paperSize = Number(data && data.paperSize) === 58 ? 58 : 80;
  if (!data || !data.printerName) throw new Error('Falta el nombre de la impresora.');
  store.set(`printers.${type}`, { name: data.printerName, paperSize });
  return store.get('printers');
});

ipcMain.handle('unassign-printer', (e, data) => {
  const type = (data && data.printerType) || 'cashier';
  store.delete(`printers.${type}`);
  return store.get('printers');
});

ipcMain.handle('set-token', (e, token) => {
  return security.setToken(token);
});

ipcMain.handle('test-print', async (e, data) => {
  const type = (data && data.printerType) || 'cashier';
  const cfg = (store.get('printers') || {})[type];
  if (!cfg || !cfg.name) throw new Error('No hay impresora asignada.');
  await printer.printRaw(cfg.name, printer.buildTestTicket(cfg.paperSize));
  return true;
});

ipcMain.handle('open-drawer', async (e, data) => {
  const type = (data && data.printerType) || 'cashier';
  const cfg = (store.get('printers') || {})[type];
  if (!cfg || !cfg.name) throw new Error('No hay impresora asignada.');
  await printer.printRaw(cfg.name, printer.buildDrawerPulse());
  return true;
});

ipcMain.handle('update-download', () => autoUpdater.downloadUpdate());
ipcMain.handle('update-install', () => {
  app.isQuitting = true;
  autoUpdater.quitAndInstall();
});
