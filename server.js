const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
app.use(cors());

// ✅ Apuntamos directamente a Skylinewebcams (no Andalucía Live)
// El token está en el HTML como: livee.m3u8?a=XXXXXX (doble 'e' en livee)
const PAGE_URL    = 'https://www.skylinewebcams.com/en/webcam/espana/andalucia/sevilla/siviglia-plaza-san-francisco.html';
const TOKEN_REGEX = /livee?\.m3u8\?a=([a-zA-Z0-9_\-]+)/;

let cache = { token: null, ts: 0 };
const CACHE_TTL = 3 * 60 * 1000;

async function fetchToken() {
  if (cache.token && (Date.now() - cache.ts) < CACHE_TTL) {
    console.log('[cache] usando token cacheado');
    return cache.token;
  }

  console.log('[fetch] descargando página...');
  const { data: html } = await axios.get(PAGE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/',
    },
    timeout: 15000
  });

  // Buscar token con regex que acepta live.m3u8 o livee.m3u8
  const match = html.match(TOKEN_REGEX);
  if (match) {
    console.log('[fetch] token encontrado:', match[1].substring(0, 10) + '...');
    cache = { token: match[1], ts: Date.now() };
    return match[1];
  }

  // Debug: mostrar fragmento del HTML donde debería estar el token
  const idx = html.indexOf('m3u8');
  if (idx !== -1) {
    console.log('[debug] fragmento cerca de m3u8:', html.substring(Math.max(0, idx-50), idx+100));
  } else {
    console.log('[debug] no se encontró m3u8 en el HTML, longitud:', html.length);
  }

  return null;
}

app.get('/get-token', async (req, res) => {
  try {
    const token = await fetchToken();
    if (token) {
      res.json({ ok: true, url: `https://hd-auth.skylinewebcams.com/live.m3u8?a=${token}`, token });
    } else {
      res.json({ ok: false, error: 'Token no encontrado' });
    }
  } catch (e) {
    console.error('[error]', e.message);
    res.json({ ok: false, error: e.message });
  }
});

app.get('/', (req, res) => res.send('Proxy webcam OK'));

app.listen(process.env.PORT || 3000, () => console.log('Servidor listo'));
