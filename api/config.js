const { getConfig, sendJSON } = require('../server');

module.exports = (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }
  return sendJSON(res, 200, getConfig());
};
