const crypto = require('crypto');
const { parseBody, sendJSON, sessions, ADMIN_PASSWORD } = require('../../server');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }
  const body = await parseBody(req);
  const pass = (body.password || '').trim();

  if (pass === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.add(token);

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'admin_session=' + token + '; Path=/; HttpOnly; SameSite=Lax',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ success: true, token }));
  } else {
    return sendJSON(res, 401, { success: false, error: 'Incorrect password! Access denied.' });
  }
};
