const express   = require('express');
const cors      = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());

const PAGE_URL    = 'https://andalucialive.com/2022/05/16/webcam-sevilla-03-plaza-san-francisco/';
const TOKEN_REGEX = /hd-auth\.skylinewebcams\.com\/live\.m3u8\?a=([a-zA-Z0-9_\-]+)/;

let cache = { token: null, ts: 0 };
const CACHE_TTL = 3 * 60 * 1000;

async function getToken() {
  if (cache.token && (Date.now() - cache.ts) < CACHE_TTL) {
    console.log('[cache] token válido');
    return cache.token;
  }

  console.log('[puppeteer] lanzando Chrome...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--no-zygote',
      '--single-process',
    ]
  });

  try {
    const page = await browser.newPage();
    let foundToken = null;

    await page.setRequestInterception(true);
    page.on('request', req => {
      const url  = req.url();
      const tipo = req.resourceType();
      const m    = url.match(TOKEN_REGEX);
      if (m) {
        foundToken = m[1];
        console.log('[red] ✓ token capturado:', foundToken.substring(0, 12) + '...');
      }
      if (['image', 'stylesheet', 'font'].includes(tipo)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    console.log('[puppeteer] cargando página...');
    await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 45000 });

    // Buscar en HTML renderizado si no lo capturamos en red
    if (!foundToken) {
      const html  = await page.content();
      const match = html.match(TOKEN_REGEX);
      if (match) { foundToken = match[1]; console.log('[html] token en HTML renderizado'); }
    }

    // Buscar en iframes
    if (!foundToken) {
      for (const frame of page.frames()) {
        try {
          const fhtml = await frame.content();
          const match = fhtml.match(TOKEN_REGEX);
          if (match) { foundToken = match[1]; console.log('[iframe] token en iframe'); break; }
        } catch (_) {}
      }
    }

    if (foundToken) {
      cache = { token: foundToken, ts: Date.now() };
      console.log('[puppeteer] ✓ éxito');
    } else {
      console.log('[puppeteer] ✗ token no encontrado');
    }
    return foundToken;

  } finally {
    await browser.close();
    console.log('[puppeteer] navegador cerrado');
  }
}

app.get('/get-token', async (req, res) => {
  try {
    const token = await getToken();
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

app.get('/', (req, res) => res.send('OK'));
app.listen(process.env.PORT || 3000, () => console.log('Servidor listo'));
