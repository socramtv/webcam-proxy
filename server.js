const express   = require('express');
const cors      = require('cors');
const puppeteer = require('puppeteer-core');
const chromium  = require('@sparticuz/chromium');

const app = express();
app.use(cors());

const PAGE_URL    = 'https://andalucialive.com/2022/05/16/webcam-sevilla-03-plaza-san-francisco/';
const TOKEN_REGEX = /hd-auth\.skylinewebcams\.com\/live\.m3u8\?a=([a-zA-Z0-9_\-]+)/;

// Caché para no lanzar Puppeteer en cada petición
let cache = { token: null, ts: 0 };
const CACHE_TTL = 3 * 60 * 1000; // 3 minutos

async function getToken() {
  // Devolver caché si aún es válido
  if (cache.token && (Date.now() - cache.ts) < CACHE_TTL) {
    console.log('[cache] token válido, reutilizando');
    return cache.token;
  }

  console.log('[puppeteer] lanzando navegador...');

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    let foundToken = null;

    // Interceptar red para capturar la URL del m3u8 en tiempo real
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url();
      const m   = url.match(TOKEN_REGEX);
      if (m && !foundToken) {
        foundToken = m[1];
        console.log('[red] token capturado:', foundToken.substring(0, 12) + '...');
      }
      // Bloquear recursos innecesarios para ir más rápido
      const tipo = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(tipo)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Cargar página y esperar hasta que la red esté tranquila
    await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 40000 });

    // Si no lo capturamos en red, buscar en el HTML renderizado
    if (!foundToken) {
      const html  = await page.content();
      const match = html.match(TOKEN_REGEX);
      if (match) {
        foundToken = match[1];
        console.log('[html] token encontrado en HTML renderizado');
      }
    }

    // Buscar también en todos los iframes
    if (!foundToken) {
      for (const frame of page.frames()) {
        try {
          const fhtml = await frame.content();
          const match = fhtml.match(TOKEN_REGEX);
          if (match) {
            foundToken = match[1];
            console.log('[iframe] token encontrado en iframe');
            break;
          }
        } catch (_) {}
      }
    }

    if (foundToken) {
      cache = { token: foundToken, ts: Date.now() };
    }

    return foundToken;

  } finally {
    await browser.close();
    console.log('[puppeteer] navegador cerrado');
  }
}

// Ruta principal
app.get('/get-token', async (req, res) => {
  try {
    const token = await getToken();
    if (token) {
      res.json({
        ok: true,
        url: `https://hd-auth.skylinewebcams.com/live.m3u8?a=${token}`,
        token,
        cached: (Date.now() - cache.ts) < CACHE_TTL
      });
    } else {
      res.json({ ok: false, error: 'Token no encontrado tras renderizar la página' });
    }
  } catch (e) {
    console.error('[error]', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// Health check para que Render sepa que el servidor está vivo
app.get('/', (req, res) => res.send('Proxy webcam OK'));

app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor listo en puerto', process.env.PORT || 3000);
});
