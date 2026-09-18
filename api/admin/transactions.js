const { sendJSON, getTransactions, isAuthenticated } = require('../../server');

module.exports = (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }
  if (!isAuthenticated(req)) {
    return sendJSON(res, 401, { error: 'Unauthorized' });
  }
  return sendJSON(res, 200, getTransactions());
};
