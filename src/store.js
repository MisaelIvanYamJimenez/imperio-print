// Persistencia de configuracion con electron-store.
// IMPORTANTE: electron-store se fija en v8 (CommonJS). v9+ es ESM-only y rompe require().
const Store = require('electron-store');

const store = new Store({
  name: 'imperio-print-config',
  defaults: {
    // Token de la sucursal. La web debe enviar este mismo token en cada mensaje.
    token: '',
    // Impresoras asignadas: { cashier: { name: "POS-80", paperSize: 80 } }
    printers: {}
  }
});

module.exports = store;
