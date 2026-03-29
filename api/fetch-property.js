const { handleFetchProperty } = require('../lib/scraper');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { boligsidenUrl, maglerUrl } = req.body || {};

  try {
    const result = await handleFetchProperty(boligsidenUrl, maglerUrl);
    const status = result.status || 200;
    delete result.status;
    return res.status(status).json(result);
  } catch (err) {
    console.error('Scrape error:', err.message);
    const msg = err.name === 'TimeoutError'
      ? 'Siden svarede ikke inden for tidsgrænsen.'
      : `Fejl ved hentning: ${err.message}`;
    return res.status(500).json({ success: false, error: msg });
  }
};
