// Configuracion central de Imperio Print.
// Puerto WebSocket: 9633 (9632 lo usa otro proyecto, NO reutilizar).
const PORT = 9633;
const HOST = '127.0.0.1';

// Origenes permitidos para conexiones WebSocket entrantes.
// Los origenes localhost/127.0.0.1 (cualquier puerto) se permiten siempre en security.js
// para desarrollo. Aqui van los dominios de PRODUCCION del panel Imperio.
// TODO: reemplazar por el/los dominio(s) reales cuando el panel este publicado.
const ALLOWED_ORIGINS = [
  'https://imperio.app',
  'https://www.imperio.app',
  'https://panel.imperio.app'
];

// Tipos de impresora soportados. En barberia solo existe "cashier" (caja).
const PRINTER_TYPES = ['cashier'];

// Anchos de papel: caracteres por linea segun milimetros.
const PAPER_WIDTHS = { 80: 48, 58: 32 };

module.exports = { PORT, HOST, ALLOWED_ORIGINS, PRINTER_TYPES, PAPER_WIDTHS };
