const { parseBody, sendJSON, getTransactions, saveTransactions, getConfig } = require('../../server');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method not allowed' });
  try {
    const body = await parseBody(req);
    const name = (body.name || '').trim();
    const phone = (body.phone || '').trim().replace(/[^0-9]/g, '');
    const password = (body.password || '').trim();

    if (!name) return sendJSON(res, 400, { error: 'Recipient name is required.' });
    if (!phone || phone.length < 10) return sendJSON(res, 400, { error: 'A valid 10-digit WhatsApp number is required.' });
    if (!password) return sendJSON(res, 400, { error: 'Password is required.' });

    const txs = getTransactions();
    const currentConfig = getConfig();
    const paymentId = 'PAY-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    const newTx = {
      paymentId,
      name,
      phone,
      password,
      amount: currentConfig.amount,
      status: 'pending',
      used: false,
      createdAt: new Date().toISOString(),
      approvedAt: null
    };

    txs.unshift(newTx);
    saveTransactions(txs);

    return sendJSON(res, 200, {
      success: true,
      paymentId,
      password: newTx.password,
      phone: newTx.phone,
      status: 'pending'
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'Server error.' });
  }
};
