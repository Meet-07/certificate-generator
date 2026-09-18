const { parseBody, sendJSON, getTransactions, saveTransactions, isAuthenticated, sendPasswordEmail } = require('../../server');

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
    const { paymentId, action } = body;
    const txs = getTransactions();
    const tx = txs.find(t => t.paymentId === paymentId);

    if (!tx) return sendJSON(res, 404, { error: 'Transaction not found.' });

    if (action === 'approve') {
      tx.status = 'approved';
      tx.approvedAt = new Date().toISOString();
      const sent = await sendPasswordEmail(tx.email, tx.name, tx.password, tx.utr);
      tx.emailSent = sent;
    } else if (action === 'reject') {
      tx.status = 'rejected';
    }

    saveTransactions(txs);
    return sendJSON(res, 200, { success: true, transaction: tx });
  } catch (err) {
    return sendJSON(res, 500, { error: 'Error updating transaction.' });
  }
};
