const zlib = require('zlib');
const packed = [0, 1, 2, 3].map((i) => require('./summaries_c' + i)).join('');
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
