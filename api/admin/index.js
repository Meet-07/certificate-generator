const { getAdminSpaHtml } = require('../../server');

module.exports = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  return res.end(getAdminSpaHtml());
};
