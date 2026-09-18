const url = require('url');
const { sendJSON, getTransactions } = require('../../server');

module.exports = (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }
  const parsedUrl = url.parse(req.url, true);
  const paymentId = parsedUrl.query.id;
  if (!paymentId) return sendJSON(res, 400, { error: 'Missing payment ID.' });

  const txs = getTransactions();
  const tx = txs.find(t => t.paymentId === paymentId);
  if (!tx) return sendJSON(res, 404, { error: 'Payment not found.' });

  return sendJSON(res, 200, {
    paymentId: tx.paymentId,
    status: tx.status,
    password: tx.status === 'approved' ? tx.password : null,
    phone: tx.phone,
    email: tx.email
  });
};
