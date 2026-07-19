// Icono en la bandeja del sistema.
const path = require('path');
const { Tray, Menu, nativeImage } = require('electron');

// Crea el tray. Recibe callbacks para mostrar la ventana y salir de verdad.
function createTray({ onShow, onQuit, version }) {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    // Fallback: un icono vacio no rompe la app.
    image = nativeImage.createEmpty();
  }
  // En Windows conviene un icono pequeno para la bandeja.
  const trayIcon = image.isEmpty() ? image : image.resize({ width: 16, height: 16 });

  const tray = new Tray(trayIcon);
  tray.setToolTip(`Imperio Print v${version || ''}`.trim());

  const menu = Menu.buildFromTemplate([
    { label: `Imperio Print v${version || ''}`.trim(), enabled: false },
    { type: 'separator' },
    { label: 'Abrir configuracion', click: () => onShow && onShow() },
    { type: 'separator' },
    { label: 'Salir', click: () => onQuit && onQuit() }
  ]);

  tray.setContextMenu(menu);
  // Doble clic abre la configuracion.
  tray.on('double-click', () => onShow && onShow());

  return tray;
}

module.exports = { createTray };
