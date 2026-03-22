const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
app.use(cors());

// Todas las URLs de webcams de skylinewebcams que queramos soportar
const WEBCAM_PAGES = [
  'https://andalucialive.com/2022/05/16/webcam-sevilla-03-plaza-san-francisco/',
  // Añade más páginas aquí si quieres
];

async function extractToken(pageUrl) {
  const { data: html } = await axios.get(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Referer': 'https://www.google.com/',
    },
    timeout: 15000
  });

  // Método 1: URL completa del m3u8
  let match = html.match(/https?:\/\/hd-auth\.skylinewebcams\.com\/live\.m3u8\?a=([a-zA-Z0-9_\-]+)/);
  if (match) return { token: match[1], method: 1 };

  // Método 2: solo el parámetro ?a=
  match = html.match(/live\.m3u8\?a=([a-zA-Z0-9_\-]+)/);
  if (match) return { token: match[1], method: 2 };

  // Método 3: variable JS skyline o similar
  match = html.match(/['"](ej[a-zA-Z0-9_\-]{10,})['"]/);
  if (match) return { token: match[1], method: 3 };

  // Método 4: buscar iframe de skylinewebcams y extraer token de src
  match = html.match(/skylinewebcams\.com[^"']*[?&]a=([a-zA-Z0-9_\-]+)/);
  if (match) return { token: match[1], method: 4 };

  // Método 5: buscar en scripts inline cualquier token largo alfanumérico cerca de "skyline"
  const skylineIdx = html.indexOf('skyline');
  if (skylineIdx !== -1) {
    const fragment = html.substring(Math.max(0, skylineIdx - 200), skylineIdx + 500);
    match = fragment.match(/[a-z0-9]{20,40}/);
    if (match) return { token: match[0], method: 5 };
  }

  // Si nada funciona, devolver el HTML para debug
  return { token: null, htmlSnippet: html.substring(0, 2000) };
}

app.get('/get-token', async (req, res) => {
  const pageUrl = req.query.url || WEBCAM_PAGES[0];
  try {
    const result = await extractToken(pageUrl);
    if (result.token) {
      const streamUrl = `https://hd-auth.skylinewebcams.com/live.m3u8?a=${result.token}`;
      res.json({ ok: true, url: streamUrl, token: result.token, method: result.method });
    } else {
      res.json({ ok: false, error: 'Token no encontrado', debug: result.htmlSnippet });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Ruta de diagnóstico: ver el HTML crudo de la página
app.get('/debug', async (req, res) => {
  const pageUrl = req.query.url || WEBCAM_PAGES[0];
  try {
    const { data: html } = await axios.get(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      timeout: 15000
    });
    // Devolver los primeros 5000 caracteres para inspeccionar
    res.type('text/plain').send(html.substring(0, 5000));
  } catch (e) {
    res.type('text/plain').send('Error: ' + e.message);
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Proxy listo'));
