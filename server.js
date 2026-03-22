const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
app.use(cors());

app.get('/get-token', async (req, res) => {
  try {
    const { data } = await axios.get(
      'https://andalucialive.com/2022/05/16/webcam-sevilla-03-plaza-san-francisco/',
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 10000 }
    );
    const match = data.match(/hd-auth\.skylinewebcams\.com\/live\.m3u8\?a=([a-z0-9]+)/);
    if (match) {
      res.json({ ok: true, url: `https://hd-auth.skylinewebcams.com/live.m3u8?a=${match[1]}` });
    } else {
      res.json({ ok: false, error: 'Token no encontrado' });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Proxy listo'));
