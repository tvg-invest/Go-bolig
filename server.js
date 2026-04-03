const express = require('express');
const path = require('path');
const { handleFetchProperty } = require('./lib/scraper');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.post('/api/fetch-property', async (req, res) => {
  const { boligsidenUrl, maglerUrl } = req.body;

  try {
    const result = await handleFetchProperty(boligsidenUrl, maglerUrl);
    const status = result.status || 200;
    delete result.status;
    res.status(status).json(result);
  } catch (err) {
    console.error('Scrape error:', err.message);
    const msg = err.name === 'TimeoutError'
      ? 'Siden svarede ikke inden for tidsgrænsen.'
      : `Fejl ved hentning: ${err.message}`;
    res.status(500).json({ success: false, error: msg });
  }
});

app.post('/api/estimate-renovation', async (req, res) => {
  const handler = require('./api/estimate-renovation');
  await handler(req, res);
});

app.listen(PORT, () => {
  console.log(`\n  Go Bolig server kører på:\n  http://localhost:${PORT}\n`);
});
