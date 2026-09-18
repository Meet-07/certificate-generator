const { parseBody, sendJSON, getConfig, saveConfig, isAuthenticated } = require('../../server');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }
  if (!isAuthenticated(req)) {
    return sendJSON(res, 401, { error: 'Unauthorized' });
  }
  try {
    const body = await parseBody(req);
    const cfg = getConfig();
    if (body.amount !== undefined) {
      const amt = parseInt(body.amount, 10);
      if (isNaN(amt) || amt <= 0) {
        return sendJSON(res, 400, { error: 'Invalid amount. Must be greater than 0.' });
      }
      cfg.amount = amt;
    }
    if (body.upiId) cfg.upiId = body.upiId.trim();
    if (body.organizerName) cfg.organizerName = body.organizerName.trim();
    if (body.organizerPhone) cfg.organizerPhone = body.organizerPhone.trim();

    saveConfig(cfg);
    return sendJSON(res, 200, { success: true, config: cfg });
  } catch(err) {
    return sendJSON(res, 500, { error: 'Error updating configuration.' });
  }
};
