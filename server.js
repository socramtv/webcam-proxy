const express    = require('express');
const cors       = require('cors');
const puppeteer  = require('puppeteer');

const app = express();
app.use(cors());

const PAGE_URL    = 'https://andalucialive.com/2022/05/16/webcam-sevilla-03-plaza-san-francisco/';
const TOKEN_REGEX = /hd-auth\.skylinewebcams\.com\/live\.m3u8\?a=([a-zA-Z0-9_\-]+)/;

let cachedToken = null;
let cacheTime   = 0;
const CACHE_TTL = 3 * 60 * 1000; // 3 minutos

async function fetchTokenWithPuppeteer() {
  // Devolver caché si aún es válido
  if (cachedToken && (Date.now() - cacheTime) < CACHE_TTL) {
    console.log('Token desde caché');
    return cachedToken;
  }

  console.log('Abriendo navegador...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]
  });

  try {
    const page = await browser.newPage();
    let foundToken = null;

    // Interceptar todas las peticiones de red para capturar el m3u8
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url();
      const m   = url.match(TOKEN_REGEX);
      if (m) {
        foundToken = m[1];
        console.log('Token capturado en red:', foundToken);
      }
      req.continue();
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Si no lo capturamos en red, buscar en el HTML final renderizado
    if (!foundToken) {
      const html  = await page.content();
      const match = html.match(TOKEN_REGEX);
      if (match) foundToken = match[1];
    }

    // También buscar en todos los iframes
    if (!foundToken) {
      for (const frame of page.frames()) {
        try {
          const fhtml = await frame.content();
          const match = fhtml.match(TOKEN_REGEX);
          if (match) { foundToken = match[1]; break; }
        } catch (_) {}
      }
    }

    if (foundToken) {
      cachedToken = foundToken;
      cacheTime   = Date.now();
    }

    return foundToken;
  } finally {
    await browser.close();
  }
}

app.get('/get-token', async (req, res) => {
  try {
    const token = await fetchTokenWithPuppeteer();
    if (token) {
      res.json({ ok: true, url: `https://hd-auth.skylinewebcams.com/live.m3u8?a=${token}`, token });
    } else {
      res.json({ ok: false, error: 'Token no encontrado tras renderizar la página' });
    }
  } catch (e) {
    console.error(e);
    res.json({ ok: false, error: e.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Proxy con Puppeteer listo'));
