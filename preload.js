// Puente seguro entre la UI (renderer) y el proceso principal.
// contextIsolation: true -> la UI solo ve lo expuesto aqui.
// NOTA: la UI de escritorio es SOLO LECTURA. La asignacion de impresoras,
// pruebas y apertura de cajon se hacen desde el panel web via WebSocket,
// no desde aqui, por eso esos metodos no se exponen a la UI.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setToken: (token) => ipcRenderer.invoke('set-token', token),
  downloadUpdate: () => ipcRenderer.invoke('update-download'),
  installUpdate: () => ipcRenderer.invoke('update-install'),

  // Eventos main -> UI
  onUpdateEvent: (cb) => ipcRenderer.on('update-event', (e, data) => cb(data)),
  onLog: (cb) => ipcRenderer.on('log', (e, msg) => cb(msg))
});
