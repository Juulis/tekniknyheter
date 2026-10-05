/**
 * Sidhämtning för sammanfattningar: egen GET (tål långa headers), skip för 403-värdar.
 */
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const {
  descriptionVia,
  extractDescription,
  extractImage,
  descriptionComplete,
  words,
  overlap,
} = require('./summaries_html');

const FETCH_TIMEOUT_MS = 3000;
const MAX_BYTES = 450 * 1024;
// Saknas bild i <head> läser vi vidare (samma request) till så här många byte och letar första stora <img>.
const IMG_SCAN_BYTES = 150 * 1024;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** Egen GET med node:https: tål långa svarshuvuden (Yahoo) som fetch/undici avvisar. Följer upp till 3 omdirigeringar. */
function httpGetHead(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return reject(e);
    }
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(
      u,
      {
        method: 'GET',
        maxHeaderSize: 128 * 1024,
        timeout: FETCH_TIMEOUT_MS,
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
          res.resume();
          return resolve(httpGetHead(new URL(res.headers.location, u).toString(), redirects - 1));
        }
        const type = String(res.headers['content-type'] || '');
        if (status !== 200 || (type && !/html/i.test(type))) {
          res.resume();
          return resolve({ status: status === 200 ? 'not_html' : status, html: '' });
        }
        const enc = String(res.headers['content-encoding'] || '').toLowerCase();
        let stream = res;
        if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        const dec = new TextDecoder('utf-8');
        let html = '';
        let bytes = 0;
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          req.destroy();
          resolve({ status: 200, html, url: u.toString() });
        };
        stream.on('data', (chunk) => {
          bytes += chunk.length;
          html += dec.decode(chunk, { stream: true });
          if (bytes > MAX_BYTES || (descriptionComplete(html) && extractDescription(html) && (extractImage(html, url) || bytes > IMG_SCAN_BYTES))) done();
        });
        stream.on('end', done);
        stream.on('error', done);
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => reject(e));
    req.end();
  });
}

async function fetchDescription(url, title) {
  const res = await Promise.race([
    httpGetHead(url),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), FETCH_TIMEOUT_MS + 500)),
  ]);
  const html = res.html || '';
  let { text: desc, via } = descriptionVia(html);
  // JSON-LD och första stycket måste dela minst ett ord med rubriken (annars kan det vara fel text).
  if ((via === 'p' || via === 'jsonld') && title && !overlap(words(title), words(desc))) desc = '';
  return { status: res.status, desc, via: desc ? via : '', image: extractImage(html, res.url || url) };
}

function isGoogleUrl(url) {
  return /^https?:\/\/news\.google\.com\//i.test(String(url || ''));
}

/** Vercel-IP får 403 här – hoppa över sidhämtning (PAIR/CHRG m.fl.). */
function skipSummaryFetch(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return /(^|\.)(tech-insider\.org|dealroom\.co|dealroom\.net)$/.test(h);
  } catch (_) {
    return false;
  }
}

module.exports = {
  FETCH_TIMEOUT_MS,
  httpGetHead,
  fetchDescription,
  isGoogleUrl,
  skipSummaryFetch,
};
