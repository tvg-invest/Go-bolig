const cheerio = require('cheerio');
const puppeteerCore = require('puppeteer-core');

// Known realtor domains
const REALTOR_DOMAINS = ['home.dk', 'edc.dk', 'nybolig.dk', 'danbolig.dk', 'estate.dk', 'realmaeglerne.dk', 'lokalbolig.dk', 'robinhus.dk'];

// Sites that need a headless browser (Cloudflare / JS-rendered)
const BROWSER_REQUIRED = ['boligsiden.dk'];

function isBoligsiden(url) {
  try { return new URL(url).hostname.replace('www.', '').includes('boligsiden.dk'); } catch { return false; }
}

function isRealtor(url) {
  try {
    const h = new URL(url).hostname.replace('www.', '');
    return REALTOR_DOMAINS.some(d => h.includes(d));
  } catch { return false; }
}

function needsBrowser(url) {
  try {
    const h = new URL(url).hostname.replace('www.', '');
    return BROWSER_REQUIRED.some(d => h.includes(d));
  } catch { return false; }
}

// ── Get Chromium browser ────────────────────────────────────────────
async function getBrowser() {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isServerless) {
    // Vercel / Lambda: use @sparticuz/chromium + puppeteer-core
    const chromium = require('@sparticuz/chromium');
    const execPath = await chromium.executablePath();
    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: execPath,
      headless: 'shell',
    });
  }

  // Local dev: use puppeteer (has bundled Chromium)
  const puppeteer = require('puppeteer');
  return puppeteer.launch({ headless: 'shell' });
}

// ── Fetch page HTML (simple HTTP) ───────────────────────────────────
async function fetchPage(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

// ── Fetch page HTML with headless browser ───────────────────────────
async function fetchPageWithBrowser(url) {
  const browser = await getBrowser();
  try {
    const page = await browser.newPage();

    // Stealth: override navigator properties to look like a real browser
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['da-DK', 'da', 'en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      window.chrome = { runtime: {} };
    });

    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7' });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });

    // Wait for Cloudflare challenge to resolve and content to load
    try {
      await page.waitForFunction(
        () => !document.title.includes('Just a moment') && document.querySelector('body')?.innerText?.length > 200,
        { timeout: 15000 }
      );
    } catch {
      // If still on challenge page, wait more and try once
      await new Promise(r => setTimeout(r, 5000));
    }

    const html = await page.content();
    console.log(`Browser fetched ${url}: ${html.length} bytes, title: "${await page.title()}"`);
    return html;
  } finally {
    await browser.close();
  }
}

// ── Scrape a single URL ─────────────────────────────────────────────
async function scrapeOne(url) {
  let html;
  if (needsBrowser(url)) {
    try {
      html = await fetchPageWithBrowser(url);
    } catch (err) {
      console.error(`Browser fetch failed for ${url}: ${err.message}, falling back to HTTP`);
      html = await fetchPage(url).catch(() => '<html></html>');
    }
  } else {
    // Try simple fetch first, fall back to browser if 403
    try {
      html = await fetchPage(url);
    } catch (err) {
      if (err.message.includes('403')) {
        console.log(`HTTP 403 for ${url}, retrying with browser...`);
        try { html = await fetchPageWithBrowser(url); } catch { html = '<html></html>'; }
      } else {
        throw err;
      }
    }
  }
  const $ = cheerio.load(html);
  const data = {};

  extractJsonLd($, data);
  extractNextData($, data, url);
  extractMetaTags($, data);

  const hostname = new URL(url).hostname.replace('www.', '');
  if (hostname.includes('boligsiden.dk')) extractBoligsiden($, data);
  if (hostname.includes('home.dk')) extractSiteGeneric($, data);
  if (hostname.includes('edc.dk')) extractSiteGeneric($, data);
  if (hostname.includes('nybolig.dk')) extractSiteGeneric($, data);
  if (hostname.includes('danbolig.dk')) extractSiteGeneric($, data);
  if (hostname.includes('estate.dk')) extractSiteGeneric($, data);

  extractGenericPatterns($, data);
  cleanData(data);
  return { data, $ };
}

// ── Find cross-reference links ──────────────────────────────────────
function findCrossLinks($, sourceUrl) {
  const found = { boligsiden: null, realtor: null };
  const allLinks = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.length < 10) return;
    let abs = href;
    try { abs = new URL(href, sourceUrl).href; } catch { return; }
    allLinks.push(abs);
  });

  $('script[type="application/ld+json"], script#__NEXT_DATA__').each((_, el) => {
    const text = $(el).html() || '';
    const urlMatches = text.match(/https?:\/\/[^\s"',}]+/g) || [];
    allLinks.push(...urlMatches);
  });

  for (const link of allLinks) {
    if (!found.boligsiden && isBoligsiden(link) && !isBoligsiden(sourceUrl)) {
      if (/boligsiden\.dk\/.+\/.+/.test(link)) found.boligsiden = link;
    }
    if (!found.realtor && isRealtor(link) && !isRealtor(sourceUrl)) {
      const path = new URL(link).pathname;
      if (path.length > 5) found.realtor = link;
    }
  }

  return found;
}

// ── Merge data ──────────────────────────────────────────────────────
function mergeData(primary, secondary) {
  const merged = { ...primary };
  for (const [key, val] of Object.entries(secondary)) {
    if (val !== null && val !== undefined && val !== '' && (merged[key] === undefined || merged[key] === null || merged[key] === '')) {
      merged[key] = val;
    }
  }
  return merged;
}

// ── Main handler logic ──────────────────────────────────────────────
async function handleFetchProperty(boligsidenUrl, maglerUrl) {
  const urlA = (boligsidenUrl || '').trim();
  const urlB = (maglerUrl || '').trim();

  if (!urlA && !urlB) {
    return { success: false, error: 'Indsæt mindst ét link.', status: 400 };
  }

  for (const u of [urlA, urlB]) {
    if (u && !/^https?:\/\//i.test(u)) {
      return { success: false, error: `Ugyldig URL: ${u}`, status: 400 };
    }
  }

  const sources = [];
  let mergedData = {};
  let discoveredBoligsiden = null;
  let discoveredRealtor = null;

  const fetchTasks = [];
  if (urlA) fetchTasks.push({ url: urlA, label: 'boligsiden' });
  if (urlB) fetchTasks.push({ url: urlB, label: 'mægler' });

  for (const task of fetchTasks) {
    try {
      const result = await scrapeOne(task.url);
      mergedData = mergeData(mergedData, result.data);
      sources.push(new URL(task.url).hostname.replace('www.', ''));

      const cross = findCrossLinks(result.$, task.url);
      if (cross.boligsiden && !discoveredBoligsiden && !urlA) discoveredBoligsiden = cross.boligsiden;
      if (cross.realtor && !discoveredRealtor && !urlB) discoveredRealtor = cross.realtor;
    } catch (err) {
      console.error(`Error fetching ${task.label} (${task.url}):`, err.message);
    }
  }

  const discoveredUrl = discoveredBoligsiden || discoveredRealtor;
  if (discoveredUrl) {
    try {
      const result = await scrapeOne(discoveredUrl);
      mergedData = mergeData(mergedData, result.data);
      sources.push(new URL(discoveredUrl).hostname.replace('www.', ''));
    } catch (err) {
      console.error(`Error fetching discovered URL (${discoveredUrl}):`, err.message);
    }
  }

  cleanData(mergedData);

  const fieldCount = Object.values(mergedData).filter(v => v !== null && v !== undefined && v !== '').length;
  if (fieldCount === 0) {
    // Give a helpful error depending on what was tried
    const triedBoligsiden = urlA && isBoligsiden(urlA);
    const triedOnlyBoligsiden = triedBoligsiden && !urlB;
    if (triedOnlyBoligsiden) {
      return { success: false, error: 'Boligsiden er beskyttet mod automatisk hentning fra servere. Prøv at indsætte mægler-linket i stedet (edc.dk, home.dk osv.) — det virker altid.' };
    }
    return { success: false, error: 'Kunne ikke finde ejendomsdata. Prøv et direkte link til en boligannonce.' };
  }

  return {
    success: true,
    data: mergedData,
    sources,
    discovered: { boligsiden: discoveredBoligsiden, realtor: discoveredRealtor }
  };
}

// ── Extraction strategies ───────────────────────────────────────────

function extractJsonLd($, data) {
  $('script[type="application/ld+json"]').each((_, el) => {
    try { walkJsonLd(JSON.parse($(el).html()), data); } catch {}
  });
}

function walkJsonLd(node, data) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => walkJsonLd(n, data)); return; }
  if (node['@graph']) { walkJsonLd(node['@graph'], data); return; }

  const rawType = node['@type'];
  const types = Array.isArray(rawType) ? rawType : [rawType].filter(Boolean);
  const typeStr = types.join(' ').toLowerCase();

  if (!/realestate|product|residence|singlefamily|apartment|house|accommodation|place|offer|lodging/.test(typeStr)) return;

  if (node.address && !data.address) {
    data.address = typeof node.address === 'string' ? node.address :
      [node.address.streetAddress, node.address.postalCode, node.address.addressLocality].filter(Boolean).join(', ');
  }
  if (node.name && !data.address) data.address = node.name;

  const price = node.offers?.price ?? node.offers?.lowPrice ?? node.price;
  if (price && !data.price) data.price = parseNum(price);

  const floor = node.floorSize?.value ?? node.floorSize;
  if (floor && !data.size) data.size = parseNum(floor);

  const lot = node.lotSize?.value ?? node.lotSize;
  if (lot && !data.lotSize) data.lotSize = parseNum(lot);

  if (node.numberOfRooms && !data.rooms) data.rooms = parseInt(node.numberOfRooms);
  if (node.yearBuilt && !data.yearBuilt) data.yearBuilt = parseInt(node.yearBuilt);

  const img = node.image?.url ?? node.image;
  if (img && !data.imageUrl) data.imageUrl = typeof img === 'string' ? img : (Array.isArray(img) ? img[0] : null);

  if (node.description && !data.description) data.description = String(node.description).slice(0, 500);

  for (const val of Object.values(node)) {
    if (val && typeof val === 'object') walkJsonLd(val, data);
  }
}

function extractNextData($, data, url) {
  const script = $('#__NEXT_DATA__').html();
  if (!script) return;
  try {
    const props = JSON.parse(script).props?.pageProps;
    if (props) searchPropertyData(props, data, 0);
  } catch {}
}

function searchPropertyData(obj, data, depth) {
  if (!obj || typeof obj !== 'object' || depth > 6) return;
  const keys = Object.keys(obj);
  if (/\b(price|pris|address|adresse|squaremeter|kvm|areal|bolig)\b/.test(keys.join(' ').toLowerCase())) {
    extractFromPropertyObject(obj, data);
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') searchPropertyData(val, data, depth + 1);
  }
}

function extractFromPropertyObject(obj, data) {
  const find = (keys) => {
    for (const k of keys) {
      const lower = k.toLowerCase();
      for (const [key, val] of Object.entries(obj)) {
        if (key.toLowerCase() === lower) return val;
      }
    }
    return undefined;
  };

  if (!data.address) {
    const val = find(['address', 'adresse', 'streetAddress', 'fullAddress', 'propertyAddress', 'vejnavn']);
    if (val && typeof val === 'string' && val.length > 3) data.address = val;
    else if (val && typeof val === 'object') {
      const addr = [val.street ?? val.streetName ?? val.vejnavn, val.zipCode ?? val.postalCode ?? val.postnr, val.city ?? val.cityName ?? val.by].filter(Boolean).join(', ');
      if (addr.length > 3) data.address = addr;
    }
  }

  if (!data.price) { const v = find(['price', 'pris', 'cashPrice', 'kontantpris', 'askingPrice', 'salesPrice', 'salgspris', 'listPrice']); if (v) data.price = parseNum(v); }
  if (!data.size) { const v = find(['size', 'areal', 'squareMeters', 'kvm', 'boligareal', 'livingArea', 'area', 'bruttoareal', 'boligAreal']); if (v) data.size = parseNum(v); }
  if (!data.lotSize) { const v = find(['lotSize', 'grundAreal', 'grundareal', 'plotSize']); if (v) data.lotSize = parseNum(v); }
  if (!data.rooms) { const v = find(['rooms', 'vaerelser', 'værelser', 'numberOfRooms', 'antalVaerelser']); if (v) data.rooms = parseInt(String(v)); }
  if (!data.yearBuilt) { const v = find(['yearBuilt', 'byggeaar', 'byggeår', 'buildYear', 'constructionYear']); if (v) data.yearBuilt = parseInt(String(v)); }
  if (!data.monthlyExpense) { const v = find(['monthlyExpense', 'ejerudgift', 'boligudgift', 'monthlyOwnerExpense', 'ejerudgiftPrMd']); if (v) data.monthlyExpense = parseNum(v); }
  if (!data.energyLabel) { const v = find(['energyLabel', 'energimaerke', 'energimærke', 'energyRating']); if (v && typeof v === 'string') data.energyLabel = v; }
  if (!data.propertyType) { const v = find(['propertyType', 'boligtype', 'type', 'estateType', 'ejendomstype']); if (v && typeof v === 'string' && v.length < 50) data.propertyType = v; }
}

function extractMetaTags($, data) {
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const ogDesc = $('meta[property="og:description"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  const title = $('title').text();

  if (!data.address && ogTitle) { const c = ogTitle.replace(/\s*[-|].*$/, '').trim(); if (c.length > 3) data.address = c; }
  if (!data.address && title) { const c = title.replace(/\s*[-|].*$/, '').trim(); if (c.length > 3 && c.length < 100) data.address = c; }
  if (!data.imageUrl && ogImage) data.imageUrl = ogImage;
  if (!data.description && ogDesc) data.description = ogDesc.slice(0, 500);
  if (!data.price && ogDesc) { const m = ogDesc.match(/(\d[\d.]+)\s*kr/i); if (m) data.price = parseNum(m[1]); }

  $('meta').each((_, el) => {
    const name = ($(el).attr('name') || $(el).attr('property') || '').toLowerCase();
    const content = $(el).attr('content');
    if (!content) return;
    if (/price|pris/.test(name) && !data.price) data.price = parseNum(content);
    if (/sqm|areal|size/.test(name) && !data.size) data.size = parseNum(content);
  });
}

function extractBoligsiden($, data) {
  if (!data.address) { const h1 = $('h1').first().text().trim(); if (h1 && h1.length > 3 && h1.length < 150) data.address = h1; }
  extractPriceFromText($, data);
  extractDetailPairs($, data);
}

function extractSiteGeneric($, data) {
  if (!data.address) { const h1 = $('h1').first().text().trim(); if (h1) data.address = h1; }
  extractPriceFromText($, data);
  extractDetailPairs($, data);
}

function extractGenericPatterns($, data) {
  if (!data.address) { const h1 = $('h1').first().text().trim(); if (h1 && h1.length > 3 && h1.length < 150) data.address = h1; }
  extractPriceFromText($, data);
  extractDetailPairs($, data);
}

function extractPriceFromText($, data) {
  if (data.price) return;
  const body = $('body').text();
  const patterns = [
    /kontantpris[:\s]*(\d[\d.]*)\s*(?:kr|,-)/i,
    /udbudspris[:\s]*(\d[\d.]*)\s*(?:kr|,-)/i,
    /salgspris[:\s]*(\d[\d.]*)\s*(?:kr|,-)/i,
    /pris[:\s]*(\d[\d.]*)\s*(?:kr|,-)/i,
    /(\d{1,3}(?:\.\d{3}){1,3})\s*kr/i,
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (m) { const val = parseNum(m[1]); if (val > 50000) { data.price = val; return; } }
  }
}

function extractDetailPairs($, data) {
  $('table tr, dl, .detail-row, .fact-row, .info-row, [class*="detail"], [class*="fact"]').each((_, el) => {
    matchDetailText($(el).text().trim(), data);
  });
  $('li, dt, dd, span, div, p').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 5 && text.length < 200) matchDetailText(text, data);
  });
}

function matchDetailText(text, data) {
  if (!text) return;
  if (!data.size) { const m = text.match(/(?:boligareal|beboelse|bolig|areal)[:\s]*(\d+)\s*(?:m²|m2|kvm)/i) || text.match(/(\d+)\s*(?:m²|m2|kvm)\b/i); if (m) data.size = parseInt(m[1]); }
  if (!data.lotSize) { const m = text.match(/(?:grundareal|grund)[:\s]*(\d[\d.]*)\s*(?:m²|m2|kvm)/i); if (m) data.lotSize = parseNum(m[1]); }
  if (!data.rooms) { const m = text.match(/(?:værelser|vær\.|rum)[:\s]*(\d+)/i) || text.match(/(\d+)\s*(?:værelser|vær\.|rum)\b/i); if (m) data.rooms = parseInt(m[1]); }
  if (!data.yearBuilt) { const m = text.match(/(?:byggeår|opført|bygget)[:\s]*(\d{4})/i); if (m) { const y = parseInt(m[1]); if (y > 1600 && y <= new Date().getFullYear()) data.yearBuilt = y; } }
  if (!data.energyLabel) { const m = text.match(/(?:energimærke|energi)[:\s]*([A-G]\d{0,4})/i); if (m) data.energyLabel = m[1].toUpperCase(); }
  if (!data.monthlyExpense) { const m = text.match(/(?:ejerudgift|boligudgift|mdl\.?\s*(?:udgift|ydelse))[:\s]*(\d[\d.]*)\s*(?:kr)?/i); if (m) data.monthlyExpense = parseNum(m[1]); }
  if (!data.propertyType) { const m = text.match(/(?:boligtype|ejendomstype|type)[:\s]*(villa|lejlighed|rækkehus|ejerlejlighed|landejendom|fritidshus|andelsbolig|townhouse)/i); if (m) data.propertyType = m[1]; }
}

function parseNum(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const s = String(val).replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseInt(s.replace(/\./g, ''));
  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

function cleanData(data) {
  if (data.price && data.price < 10000) delete data.price;
  if (data.size && (data.size < 5 || data.size > 10000)) delete data.size;
  if (data.rooms && (data.rooms < 1 || data.rooms > 50)) delete data.rooms;
  if (data.yearBuilt && (data.yearBuilt < 1600 || data.yearBuilt > new Date().getFullYear() + 1)) delete data.yearBuilt;
  if (data.monthlyExpense && data.monthlyExpense < 100) delete data.monthlyExpense;
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') data[k] = v.trim();
    if (v === '' || v === null || v === undefined) delete data[k];
  }
}

module.exports = { handleFetchProperty };
