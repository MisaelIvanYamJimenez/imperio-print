// Servidor WebSocket en localhost:9633. Recibe comandos del panel Imperio web.
const WebSocket = require('ws');
const { PORT, HOST } = require('./config');
const security = require('./security');
const printer = require('./printer');
const store = require('./store');

let wss = null;

// Devuelve la impresora asignada para un tipo, o lanza error.
function getAssigned(printerType) {
  const type = printerType || 'cashier';
  const assigned = store.get('printers') || {};
  const cfg = assigned[type];
  if (!cfg || !cfg.name) {
    throw new Error(`No hay impresora asignada para "${type}".`);
  }
  return cfg;
}

// Maneja cada accion (ya validado el token, salvo ping que se atiende antes).
async function handleAction(action, msg, getVersion) {
  switch (action) {
    case 'list_printers': {
      const system = await printer.listSystemPrinters();
      return { system, assigned: store.get('printers') || {} };
    }

    case 'assign_printer': {
      const type = msg.printerType || 'cashier';
      if (!msg.printerName) throw new Error('Falta printerName.');
      const paperSize = Number(msg.paperSize) === 58 ? 58 : 80;
      store.set(`printers.${type}`, { name: msg.printerName, paperSize });
      return { assigned: store.get('printers') };
    }

    case 'unassign_printer': {
      const type = msg.printerType || 'cashier';
      store.delete(`printers.${type}`);
      return { assigned: store.get('printers') };
    }

    case 'print': {
      const cfg = getAssigned(msg.printerType);
      const bytes = printer.buildReceipt(msg.ticket || {}, cfg.paperSize);
      let buffer = bytes;
      if (msg.openDrawer) {
        // El pulso del cajon se antepone para que abra al imprimir.
        buffer = Buffer.concat([printer.buildDrawerPulse(), bytes]);
      }
      await printer.printRaw(cfg.name, buffer);
      return { printed: true };
    }

    case 'open_drawer': {
      const cfg = getAssigned(msg.printerType);
      await printer.printRaw(cfg.name, printer.buildDrawerPulse());
      return { drawer: 'opened' };
    }

    case 'test_print': {
      const cfg = getAssigned(msg.printerType);
      await printer.printRaw(cfg.name, printer.buildTestTicket(cfg.paperSize));
      return { printed: true };
    }

    case 'get_config': {
      return { printers: store.get('printers') || {}, version: getVersion() };
    }

    default:
      throw new Error(`Accion desconocida: ${action}`);
  }
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// Arranca el servidor. deps: { getVersion, onLog }
function start(deps = {}) {
  const getVersion = deps.getVersion || (() => '0.0.0');
  const onLog = deps.onLog || (() => {});

  wss = new WebSocket.Server({
    host: HOST,
    port: PORT,
    verifyClient: (info, cb) => {
      const origin = info.origin || (info.req && info.req.headers && info.req.headers.origin);
      if (security.isOriginAllowed(origin)) return cb(true);
      onLog(`Conexion rechazada por origen no permitido: ${origin || '(sin origen)'}`);
      cb(false, 403, 'Origin not allowed');
    }
  });

  wss.on('connection', (ws) => {
    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (_) {
        return send(ws, { ok: false, error: 'JSON invalido.' });
      }

      const action = msg.action;
      const id = msg.id;

      // ping: NO requiere token.
      if (action === 'ping') {
        return send(ws, {
          id,
          ok: true,
          action: 'ping',
          status: 'online',
          version: getVersion(),
          printers: store.get('printers') || {}
        });
      }

      // Resto de acciones: token obligatorio.
      if (!security.isTokenValid(msg.token)) {
        return send(ws, { id, ok: false, action, error: 'Token invalido o no configurado.' });
      }

      try {
        const result = await handleAction(action, msg, getVersion);
        send(ws, { id, ok: true, action, ...result });
      } catch (e) {
        onLog(`Error en accion "${action}": ${e.message}`);
        send(ws, { id, ok: false, action, error: e.message });
      }
    });
  });

  wss.on('error', (err) => onLog(`Error del servidor WebSocket: ${err.message}`));
  wss.on('listening', () => onLog(`WebSocket escuchando en ws://${HOST}:${PORT}`));

  return wss;
}

function stop() {
  if (wss) { wss.close(); wss = null; }
}

module.exports = { start, stop };
