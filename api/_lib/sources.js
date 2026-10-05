const zlib = require('zlib');
const packed = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => require('./sources_c' + i)).join('');
const code = zlib.inflateSync(Buffer.from(packed, 'base64')).toString('utf8');
const m = { exports: {} };
new Function('require', 'module', 'exports', '__filename', '__dirname', code)(
  require,
  m,
  m.exports,
  __filename,
  __dirname
);
module.exports = m.exports;
