// Validacion de origen y token.
const { ALLOWED_ORIGINS } = require('./config');
const store = require('./store');

// Permite localhost/127.0.0.1 en cualquier puerto (desarrollo del panel).
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function isOriginAllowed(origin) {
  if (!origin) return false; // navegadores siempre envian Origin; sin el, se rechaza.
  if (LOCALHOST_RE.test(origin)) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

function getToken() {
  return store.get('token') || '';
}

function setToken(token) {
  store.set('token', String(token || '').trim());
  return getToken();
}

// El token es valido solo si hay uno configurado y coincide exactamente.
function isTokenValid(token) {
  const current = getToken();
  return !!current && typeof token === 'string' && token === current;
}

module.exports = { isOriginAllowed, getToken, setToken, isTokenValid };
