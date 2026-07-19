// Logica de la interfaz de configuracion (SOLO LECTURA).
// La asignacion de impresoras y las pruebas se hacen desde el panel web por WebSocket.
const $ = (id) => document.getElementById(id);

function toast(msg, kind) {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'show ' + (kind || '');
  setTimeout(() => { el.className = ''; }, 2600);
}

async function loadStatus() {
  try {
    const s = await window.api.getStatus();
    $('version').textContent = 'Imperio Print v' + s.version;
    $('port-pill').textContent = 'puerto ' + s.port;
    $('dot').className = 'status-dot ' + (s.running ? 'dot-on' : 'dot-off');
    $('status-text').textContent = s.running ? 'Servidor activo' : 'Servidor detenido';
  } catch (e) {
    $('dot').className = 'status-dot dot-off';
    $('status-text').textContent = 'Servidor detenido';
  }
}

// Refresca token e impresora asignada (solo lectura).
async function loadConfig() {
  const cfg = await window.api.getConfig();
  // No sobrescribir el token si el usuario lo esta editando.
  if (document.activeElement !== $('token')) {
    $('token').value = cfg.token || '';
  }
  renderAssigned(cfg.printers || {});
}

function renderAssigned(printers) {
  const cashier = printers.cashier;
  const paperPill = $('assigned-paper');
  if (cashier && cashier.name) {
    $('assigned-name').textContent = cashier.name;
    $('assigned-hint').textContent = 'Configurada desde el panel web.';
    paperPill.textContent = (cashier.paperSize || 80) + ' mm';
    paperPill.style.display = '';
  } else {
    $('assigned-name').textContent = 'Sin asignar';
    $('assigned-hint').textContent = 'Las impresoras se configuran desde el panel web.';
    paperPill.style.display = 'none';
  }
}

// --- Token ---
$('btn-save-token').addEventListener('click', async () => {
  try {
    await window.api.setToken($('token').value);
    toast('Token guardado', 'ok');
  } catch (e) { toast('Error: ' + e.message, 'err'); }
});

$('btn-disconnect').addEventListener('click', async () => {
  try {
    await window.api.setToken('');
    $('token').value = '';
    toast('Desconectado', 'ok');
  } catch (e) { toast('Error: ' + e.message, 'err'); }
});

// --- Auto-actualizacion ---
$('btn-download').addEventListener('click', () => {
  window.api.downloadUpdate();
  $('banner-text').textContent = 'Descargando actualizacion...';
  $('btn-download').disabled = true;
});

$('btn-install').addEventListener('click', () => window.api.installUpdate());

window.api.onUpdateEvent((data) => {
  const banner = $('banner');
  if (data.type === 'available') {
    $('banner-text').textContent = `Actualizacion disponible (v${data.version}).`;
    $('btn-download').style.display = '';
    $('btn-download').disabled = false;
    $('btn-install').style.display = 'none';
    banner.classList.add('show');
  } else if (data.type === 'progress') {
    $('banner-text').textContent = `Descargando... ${data.percent}%`;
  } else if (data.type === 'downloaded') {
    $('banner-text').textContent = `Listo para actualizar (v${data.version}).`;
    $('btn-download').style.display = 'none';
    $('btn-install').style.display = '';
    banner.classList.add('show');
  } else if (data.type === 'none') {
    banner.classList.remove('show');
  } else if (data.type === 'error') {
    toast('Actualizacion: ' + data.message, 'err');
  }
});

// --- Inicio + refresco periodico (para reflejar cambios hechos desde la web) ---
async function refresh() {
  await loadStatus();
  await loadConfig();
}

refresh();
setInterval(refresh, 3000);
