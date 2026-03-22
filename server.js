const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
app.use(cors());

const TOKEN_REGEX = /livee?\.m3u8\?a=([a-zA-Z0-9_\-]+)/;

let cache = { token: null, ts: 0 };
const CACHE_TTL = 3 * 60 * 1000;

// URLs a probar en orden
const SOURCES = [
  {
    label: 'andalucialive-embed',
    url: 'https://andalucialive.com/2022/05/16/webcam-sevilla-03-plaza-san-francisco/?video_embed=7478',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Referer': 'https://andalucialive.com/',
    }
  },
  {
    label: 'andalucialive-main',
    url: 'https://andalucialive.com/2022/05/16/webcam-sevilla-03-plaza-san-francisco/',
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-ES,es;q=0.9',
    }
  },
  {
    label: 'skyline-embed',
    url: 'https://www.skylinewebcams.com/en/webcam/espana/andalucia/sevilla/siviglia-plaza-san-francisco.html',
    headers: {
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Accept': 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  },
  {
    label: 'skyline-mobile',
    url: 'https://www.skylinewebcams.com/en/webcam/espana/andalucia/sevilla/siviglia-plaza-san-francisco.html',
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html',
      'Accept-Language': 'en',
      'Referer': 'https://www.google.com/',
    }
  },
];

async function fetchToken() {
  if (cache.token && (Date.now() - cache.ts) < CACHE_TTL) {
    console.log('[cache] token válido');
    return { token: cache.token, source: 'cache' };
  }

  for (const src of SOURCES) {
    try {
      console.log(`[fetch] probando: ${src.label}`);
      const { data: html, status } = await axios.get(src.url, {
        headers: src.headers,
        timeout: 12000,
        maxRedirects: 5,
      });

      console.log(`[fetch] ${src.label}: status=${status} longitud=${html.length}`);

      if (!html || html.length < 100) {
        console.log(`[fetch] ${src.label}: respuesta vacía, saltando`);
        continue;
      }

      const match = html.match(TOKEN_REGEX);
      if (match) {
        console.log(`[fetch] ✓ token encontrado en ${src.label}: ${match[1].substring(0,10)}...`);
        cache = { token: match[1], ts: Date.now() };
        return { token: match[1], source: src.label };
      }

      // Mostrar fragmento para debug
      const idx = html.indexOf('m3u8');
      if (idx !== -1) {
        console.log(`[debug] ${src.label} - fragmento m3u8: ${html.substring(Math.max(0,idx-60), idx+80)}`);
      } else {
        console.log(`[debug] ${src.label} - no contiene m3u8. Primeros 200 chars: ${html.substring(0,200)}`);
      }

    } catch (e) {
      console.log(`[error] ${src.label}: ${e.message}`);
    }
  }

  return { token: null };
}

app.get('/get-token', async (req, res) => {
  try {
    const result = await fetchToken();
    if (result.token) {
      res.json({ ok: true, url: `https://hd-auth.skylinewebcams.com/live.m3u8?a=${result.token}`, token: result.token, source: result.source });
    } else {
      res.json({ ok: false, error: 'Token no encontrado en ninguna fuente' });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/', (req, res) => res.send('OK'));

app.listen(process.env.PORT || 3000, () => console.log('Servidor listo'));
