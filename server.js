const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
app.use(cors());

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Referer': 'https://www.google.com/',
};

const TOKEN_REGEX = /hd-auth\.skylinewebcams\.com\/live\.m3u8\?a=([a-zA-Z0-9_\-]+)/;

async function getHtml(url) {
  const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  return data;
}

async function extractToken() {
  // Paso 1: cargar la página principal
  const mainUrl  = 'https://andalucialive.com/2022/05/16/webcam-sevilla-03-plaza-san-francisco/';
  const mainHtml = await getHtml(mainUrl);

  // Buscar directamente en la página principal primero
  let m = mainHtml.match(TOKEN_REGEX);
  if (m) return { token: m[1], source: 'main' };

  // Paso 2: buscar video_embed=XXXX y cargar esa URL
  const embedMatch = mainHtml.match(/video_embed=(\d+)/);
  if (embedMatch) {
    const embedUrl  = `${mainUrl}?video_embed=${embedMatch[1]}`;
    const embedHtml = await getHtml(embedUrl);

    m = embedHtml.match(TOKEN_REGEX);
    if (m) return { token: m[1], source: 'embed' };

    // Paso 3: buscar iframe src de skylinewebcams dentro del embed
    const iframeMatch = embedHtml.match(/src=["'](https?:\/\/[^"']*skylinewebcams[^"']+)["']/i);
    if (iframeMatch) {
      const iframeHtml = await getHtml(iframeMatch[1]);
      m = iframeHtml.match(TOKEN_REGEX);
      if (m) return { token: m[1], source: 'iframe' };
    }

    // Paso 4: buscar cualquier URL de skyline en el embed
    const skylineMatch = embedHtml.match(/https?:\/\/[^"'\s]*skylinewebcams[^"'\s]*/i);
    if (skylineMatch) {
      const skylineHtml = await getHtml(skylineMatch[0]);
      m = skylineHtml.match(TOKEN_REGEX);
      if (m) return { token: m[1], source: 'skyline' };
    }

    return { token: null, debug: embedHtml.substring(0, 3000) };
  }

  return { token: null, debug: mainHtml.substring(0, 3000) };
}

app.get('/get-token', async (req, res) => {
  try {
    const result = await extractToken();
    if (result.token) {
      res.json({
        ok: true,
        url: `https://hd-auth.skylinewebcams.com/live.m3u8?a=${result.token}`,
        token: result.token,
        source: result.source
      });
    } else {
      res.json({ ok: false, error: 'Token no encontrado', debug: result.debug });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/debug', async (req, res) => {
  const url = req.query.url || 'https://andalucialive.com/2022/05/16/webcam-sevilla-03-plaza-san-francisco/?video_embed=7478';
  try {
    const html = await getHtml(url);
    res.type('text/plain').send(html.substring(0, 5000));
  } catch (e) {
    res.type('text/plain').send('Error: ' + e.message);
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Proxy listo'));
