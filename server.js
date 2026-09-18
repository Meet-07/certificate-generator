const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const querystring = require('querystring');

const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'RavalMegh9898@';
const isVercel = Boolean(process.env.VERCEL);
const DATA_DIR = isVercel ? '/tmp' : __dirname;
const DB_FILE = path.join(DATA_DIR, 'transactions.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// In-memory active session tokens
const sessions = new Set();

// Initialize database file & config file (with Vercel seed support)
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const seedDb = path.join(__dirname, 'transactions.json');
  if (isVercel && fs.existsSync(seedDb) && !fs.existsSync(DB_FILE)) {
    fs.copyFileSync(seedDb, DB_FILE);
  } else if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
  }

  const seedConfig = path.join(__dirname, 'config.json');
  if (isVercel && fs.existsSync(seedConfig) && !fs.existsSync(CONFIG_FILE)) {
    fs.copyFileSync(seedConfig, CONFIG_FILE);
  }
} catch(e) {
  console.error('Initialization note:', e.message);
}

function getTransactions() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {}
  return [];
}

function saveTransactions(list) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error('Save transactions error:', e.message);
  }
}

const DEFAULT_CONFIG = {
  amount: 40,
  upiId: 'maraval0316@oksbi',
  organizerName: 'Raval Megh',
  organizerPhone: '7622806507'
};

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return Object.assign({}, DEFAULT_CONFIG, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
    }
  } catch(e) {}
  return Object.assign({}, DEFAULT_CONFIG);
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error('Save config error:', e.message);
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const ctype = (req.headers['content-type'] || '').toLowerCase();
      if (ctype.includes('application/json')) {
        try { return resolve(JSON.parse(body || '{}')); } catch (e) { return resolve({}); }
      }
      if (ctype.includes('application/x-www-form-urlencoded')) {
        return resolve(querystring.parse(body));
      }
      try {
        return resolve(JSON.parse(body || '{}'));
      } catch (e) {
        return resolve(querystring.parse(body));
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJSON(res, statusCode, obj) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(obj));
}

function getCookie(req, name) {
  const cookie = req.headers['cookie'] || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function isAuthenticated(req) {
  // Check Authorization Bearer header
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (sessions.has(token)) return true;
  }
  // Check cookie
  const cookieToken = getCookie(req, 'admin_session');
  if (cookieToken && sessions.has(cookieToken)) return true;

  return false;
}

// Mail Dispatcher Helper
let nodemailer;
try { nodemailer = require('nodemailer'); } catch(e) {}

const SMTP_USER = process.env.SMTP_USER || process.env.GMAIL_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || process.env.GMAIL_PASS || '';

async function sendViaFormSubmit(toEmail, recipientName, password, utr) {
  try {
    const payload = JSON.stringify({
      _subject: `🎓 Your Certificates ZIP Unlock Password: ${password}`,
      name: `CertGen Official`,
      message: `Hello ${recipientName},\n\nYour payment of ₹40 (UTR: ${utr}) has been confirmed!\n\n🔑 YOUR ZIP UNLOCK PASSWORD:\n-----------------------------\n${password}\n-----------------------------\n\nUse this password to extract your 20 certificates from the downloaded ZIP.\n\nThank you,\nCertGen Administration`
    });

    const https = require('https');
    return new Promise(resolve => {
      const opt = {
        hostname: 'formsubmit.co',
        path: `/ajax/${encodeURIComponent(toEmail)}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'https://formsubmit.co',
          'Referer': 'https://formsubmit.co',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 8000
      };
      const req = https.request(opt, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(d);
            resolve(parsed.success === 'true' || parsed.success === true);
          } catch(e) { resolve(false); }
        });
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.write(payload);
      req.end();
    });
  } catch(e) {
    return false;
  }
}

async function sendPasswordEmail(toEmail, recipientName, password, utr) {
  let sent = false;
  // 1. Try Nodemailer if configured
  if (nodemailer && SMTP_USER && SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      });
      await transporter.sendMail({
        from: `"CertGen Official" <${SMTP_USER}>`,
        to: toEmail,
        subject: `🎓 Your Certificates ZIP Unlock Password: ${password}`,
        text: `Hello ${recipientName},\n\nYour payment of ₹40 (UTR: ${utr}) has been confirmed!\n\n🔑 YOUR ZIP UNLOCK PASSWORD:\n-----------------------------\n${password}\n-----------------------------\n\nUse this password to extract your 20 certificates from the downloaded ZIP.\n\nThank you,\nCertGen Administration`
      });
      sent = true;
    } catch (err) {
      console.error('SMTP email error:', err.message);
    }
  }

  // 2. Also dispatch via FormSubmit mailer
  const fsSent = await sendViaFormSubmit(toEmail, recipientName, password, utr);
  if (fsSent) sent = true;

  return sent;
}

let INDEX_HTML = '';
try {
  const p1 = path.join(__dirname, 'index.html');
  const p2 = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(p1)) INDEX_HTML = fs.readFileSync(p1, 'utf8');
  else if (fs.existsSync(p2)) INDEX_HTML = fs.readFileSync(p2, 'utf8');
} catch(e) {}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(INDEX_HTML);
  }

  // Config endpoint (public)
  if (pathname === '/api/config' && req.method === 'GET') {
    return sendJSON(res, 200, getConfig());
  }

  // 1. Create payment entry when user hits generate
  if (pathname === '/api/payment/submit' && req.method === 'POST') {
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
  }

  // 2. Check payment status
  if (pathname === '/api/payment/status' && req.method === 'GET') {
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
  }

  // ===== AJAX ADMIN AUTHENTICATION API =====

  // AJAX Login
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const body = await parseBody(req);
    const pass = (body.password || '').trim();

    if (pass === ADMIN_PASSWORD) {
      const token = crypto.randomBytes(24).toString('hex');
      sessions.add(token);

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `admin_session=${token}; Path=/; HttpOnly; SameSite=Lax`,
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify({ success: true, token }));
    } else {
      return sendJSON(res, 401, { success: false, error: 'Incorrect password! Access denied.' });
    }
  }

  // AJAX / API Admin: List transactions
  if (pathname === '/api/admin/transactions' && req.method === 'GET') {
    if (!isAuthenticated(req)) {
      return sendJSON(res, 401, { error: 'Unauthorized' });
    }
    return sendJSON(res, 200, getTransactions());
  }

  // AJAX / API Admin: Action (approve/reject)
  if (pathname === '/api/admin/action' && req.method === 'POST') {
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
  }

  // AJAX / API Admin: Update configuration (amount, etc.)
  if (pathname === '/api/admin/config' && req.method === 'POST') {
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
  }

  // Admin SPA Page (Login form + live dashboard driven entirely by AJAX)
  if (pathname === '/admin') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    return res.end(getAdminSpaHtml());
  }

  // ===== SERVE STATIC FRONTEND =====
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  }
  if (!fs.existsSync(filePath)) {
    if (INDEX_HTML) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(INDEX_HTML);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not Found');
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

// Admin SPA HTML (AJAX Form Login & AJAX Live Dashboard)
function getAdminSpaHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Dashboard — CertGen</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Montserrat:wght@600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;color:#c9d1d9;font-family:'Poppins',sans-serif;min-height:100vh}

/* Login View */
#loginView{display:flex;align-items:center;justify-content:center;min-height:90vh;padding:20px}
.login-card{background:#161b22;border:1px solid #30363d;padding:38px 32px;border-radius:16px;max-width:380px;width:100%;box-shadow:0 15px 40px rgba(0,0,0,.5);text-align:center}
.login-card h2{color:#f5af19;font-size:1.4rem;margin-bottom:8px}
.login-card p{color:#8b949e;font-size:.85rem;margin-bottom:20px}
.login-card input{width:100%;padding:13px 16px;background:#0d1117;border:1px solid #30363d;border-radius:10px;color:#fff;font-size:.95rem;outline:none;margin-bottom:16px;font-family:'Poppins',sans-serif}
.login-card input:focus{border-color:#f5af19}
.login-card button{width:100%;padding:13px;background:#238636;color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer;font-size:.95rem;transition:background .2s}
.login-card button:hover{background:#2ea043}
.login-card button:disabled{opacity:.6;cursor:not-allowed}
.login-alert{background:rgba(248,81,73,.15);border:1px solid rgba(248,81,73,.4);color:#f85149;padding:10px;border-radius:8px;font-size:.82rem;margin-bottom:16px;display:none}

/* Dashboard View */
#dashboardView{padding:25px 20px;display:none}
.header{max-width:1150px;margin:0 auto 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:15px}
h1{font-size:1.6rem;color:#f5af19;font-family:'Montserrat',sans-serif}
.badge-live{background:#238636;color:#fff;font-size:.75rem;padding:4px 10px;border-radius:20px;font-weight:600;display:inline-flex;align-items:center;gap:5px}
.badge-live::before{content:'';width:8px;height:8px;background:#39d353;border-radius:50%;display:inline-block;animation:pulse 1.5s infinite}
@keyframes pulse{0%{opacity:1}50%{opacity:.3}100%{opacity:1}}
.btn-logout{background:transparent;color:#8b949e;border:1px solid #30363d;padding:6px 14px;border-radius:8px;font-size:.8rem;cursor:pointer;text-decoration:none;display:inline-block}
.btn-logout:hover{color:#fff;border-color:#8b949e}
.banner{background:#161b22;border:1px solid #30363d;padding:12px 20px;border-radius:10px;max-width:1150px;margin:0 auto 18px;display:flex;justify-content:space-between;align-items:center;font-size:.85rem}
.banner strong{color:#f5af19}
.stats{display:flex;gap:15px;max-width:1150px;margin:0 auto 20px}
.stat-card{background:#161b22;border:1px solid #30363d;padding:14px 20px;border-radius:12px;flex:1;text-align:center}
.stat-num{font-size:1.7rem;font-weight:700;color:#fff}
.stat-label{font-size:.75rem;color:#8b949e;text-transform:uppercase;letter-spacing:1px}
.container{max-width:1150px;margin:0 auto;background:#161b22;border:1px solid #30363d;border-radius:14px;overflow:hidden}
.table-head{background:#21262d;padding:14px 20px;display:grid;grid-template-columns:1.8fr 1.6fr 1.3fr 1.3fr 1.8fr;font-weight:600;font-size:.82rem;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px}
.tx-list{max-height:680px;overflow-y:auto}
.tx-row{padding:16px 20px;display:grid;grid-template-columns:1.8fr 1.6fr 1.3fr 1.3fr 1.8fr;align-items:center;border-bottom:1px solid #21262d;font-size:.88rem;transition:background .2s}
.tx-row:hover{background:rgba(255,255,255,.02)}
.tx-name{font-weight:600;color:#fff}
.tx-email{font-size:.8rem;color:#58a6ff;word-break:break-all}
.tx-time{font-size:.72rem;color:#8b949e;margin-top:2px}
.tx-utr{font-family:monospace;font-size:.9rem;color:#e6edf3;background:rgba(56,139,253,.15);padding:4px 8px;border-radius:6px;display:inline-block;cursor:pointer}
.tx-pass{font-family:monospace;font-size:1rem;color:#f5af19;background:rgba(245,175,25,.1);border:1px dashed rgba(245,175,25,.3);padding:4px 8px;border-radius:6px;display:inline-block;font-weight:700;cursor:pointer}
.status-badge{display:inline-block;padding:3px 8px;border-radius:20px;font-size:.75rem;font-weight:600;text-transform:uppercase}
.status-pending{background:rgba(210,153,34,.15);color:#d29922;border:1px solid rgba(210,153,34,.4)}
.status-approved{background:rgba(46,160,67,.15);color:#3fb950;border:1px solid rgba(46,160,67,.4)}
.status-rejected{background:rgba(248,81,73,.15);color:#f85149;border:1px solid rgba(248,81,73,.4)}
.btn-action{padding:7px 12px;font-size:.78rem;font-weight:600;border-radius:8px;border:none;cursor:pointer;transition:.2s;display:inline-flex;align-items:center;gap:4px}
.btn-wa{background:#25d366;color:#fff;font-weight:600;padding:8px 14px;border-radius:8px;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:.82rem;transition:.2s;text-decoration:none}
.btn-wa:hover{background:#20ba59;box-shadow:0 4px 12px rgba(37,211,102,.35)}
.btn-reject{background:transparent;color:#f85149;border:1px solid #da3633;margin-left:6px;padding:7px 10px;border-radius:8px;cursor:pointer}
.btn-reject:hover{background:#da3633;color:#fff}
.empty-msg{padding:40px;text-align:center;color:#8b949e}
</style>
</head>
<body>

<!-- 1. AJAX LOGIN VIEW -->
<div id="loginView">
  <div class="login-card">
    <div style="font-size:2.5rem;margin-bottom:10px">🔒</div>
    <h2>Admin Login</h2>
    <p>Enter admin password to manage approvals</p>
    <div class="login-alert" id="loginAlert"></div>
    <form id="loginForm" onsubmit="event.preventDefault(); doAjaxLogin();">
      <input type="password" id="adminPassword" placeholder="Admin Password" required autofocus autocomplete="current-password">
      <button type="submit" id="btnLogin">Log In</button>
    </form>
  </div>
</div>

<!-- 2. AJAX LIVE DASHBOARD VIEW -->
<div id="dashboardView">
  <div class="header">
    <h1>🛡️ CertGen WhatsApp Approvals</h1>
    <div>
      <span class="badge-live">Live Sync (2s)</span>
      <button class="btn-logout" style="margin-left:10px" onclick="doLogout()">Sign Out</button>
      <a href="/" target="_blank" style="color:#58a6ff;text-decoration:none;font-size:.9rem;margin-left:15px">Open User App ↗</a>
    </div>
  </div>

  <div class="banner" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
    <div>
      <span>Active UPI: <strong>maraval0316@oksbi</strong> &nbsp;|&nbsp; WhatsApp: <strong>Raval Megh (+91 7622806507)</strong></span>
      <span style="display:block;font-size:.78rem;color:#8b949e;margin-top:4px">
        Click <strong>"📲 Share on WhatsApp"</strong> to approve and immediately open WhatsApp chat with the customer's phone number and pre-filled unlock password!
      </span>
    </div>
    <div style="background:#0d1117;border:1px solid #30363d;padding:8px 14px;border-radius:10px;display:flex;align-items:center;gap:10px">
      <span style="font-size:.85rem;color:#c9d1d9;font-weight:600">💰 Set Price:</span>
      <span style="color:#f5af19;font-weight:700">₹</span>
      <input type="number" id="inputAmount" min="1" max="10000" style="width:75px;padding:6px 8px;background:#161b22;border:1px solid #30363d;border-radius:6px;color:#f5af19;font-weight:700;font-size:.95rem;outline:none" value="40">
      <button onclick="updateAmount()" id="btnSaveAmount" style="background:#238636;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-weight:600;font-size:.8rem;cursor:pointer">Save</button>
      <span id="amountSavedToast" style="color:#3fb950;font-size:.8rem;display:none;font-weight:600">✓ Saved!</span>
    </div>
  </div>

  <div class="stats">
    <div class="stat-card">
      <div class="stat-num" id="statPending" style="color:#d29922">0</div>
      <div class="stat-label">Pending Verification</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" id="statApproved" style="color:#3fb950">0</div>
      <div class="stat-label">Approved & Shared</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" id="statTotal">0</div>
      <div class="stat-label">Total Submissions</div>
    </div>
  </div>

  <div class="container">
    <div class="table-head">
      <div>User & WhatsApp</div>
      <div>Amount & Time</div>
      <div>ZIP Password</div>
      <div>Status</div>
      <div style="text-align:right">Action</div>
    </div>
    <div class="tx-list" id="txList">
      <div class="empty-msg">Loading transactions...</div>
    </div>
  </div>
</div>

<script>
let authToken = sessionStorage.getItem('admin_token') || '';
let pollTimer = null;

window.addEventListener('DOMContentLoaded', () => {
  if (authToken) {
    checkAuthAndLoad();
  } else {
    showLogin();
  }
});

function showLogin() {
  if (pollTimer) clearInterval(pollTimer);
  document.getElementById('loginView').style.display = 'flex';
  document.getElementById('dashboardView').style.display = 'none';
  const pwd = document.getElementById('adminPassword');
  if (pwd) { pwd.value = ''; pwd.focus(); }
}

function showDashboard() {
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('dashboardView').style.display = 'block';
  loadAdminConfig();
  fetchTransactions();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchTransactions, 2000);
}

// 1. AJAX LOGIN REQUEST
async function doAjaxLogin() {
  const pwdInput = document.getElementById('adminPassword');
  const btn = document.getElementById('btnLogin');
  const alertEl = document.getElementById('loginAlert');
  const password = pwdInput.value.trim();

  alertEl.style.display = 'none';

  if (!password) {
    alertEl.textContent = 'Please enter password.';
    alertEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      authToken = data.token;
      sessionStorage.setItem('admin_token', authToken);
      btn.disabled = false;
      btn.textContent = 'Log In';
      showDashboard();
    } else {
      alertEl.textContent = data.error || 'Incorrect password! Access denied.';
      alertEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Log In';
      pwdInput.focus();
    }
  } catch (e) {
    alertEl.textContent = 'Connection error. Please ensure server is running on port 8080.';
    alertEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Log In';
  }
}

// Check existing session
async function checkAuthAndLoad() {
  try {
    const res = await fetch('/api/admin/transactions', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (res.ok) {
      showDashboard();
    } else {
      doLogout();
    }
  } catch (e) {
    showLogin();
  }
}

function doLogout() {
  sessionStorage.removeItem('admin_token');
  authToken = '';
  showLogin();
}

// 2. AJAX TRANSACTIONS FETCH
async function fetchTransactions() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/admin/transactions', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (res.status === 401) {
      doLogout();
      return;
    }
    const txs = await res.json();
    renderTransactions(txs);
  } catch (e) {
    console.error('AJAX fetch error:', e);
  }
}

function renderTransactions(txs) {
  document.getElementById('statPending').textContent = txs.filter(t => t.status === 'pending').length;
  document.getElementById('statApproved').textContent = txs.filter(t => t.status === 'approved').length;
  document.getElementById('statTotal').textContent = txs.length;

  const listEl = document.getElementById('txList');
  if (!txs || txs.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">No submissions yet. Submissions will appear here in real-time.</div>';
    return;
  }

  listEl.innerHTML = txs.map(t => {
    const time = new Date(t.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const rawPhone = (t.phone || '').replace(/[^0-9]/g, '');
    const cleanPhone = rawPhone.length === 10 ? ('91' + rawPhone) : rawPhone;
    const displayPhone = rawPhone.length >= 10 ? ('+91 ' + rawPhone.slice(-10)) : (t.phone || 'No Phone');
    const amt = t.amount || 40;

    const waMsgText = "🎓 Hello " + t.name + ",\\n\\nYour payment of ₹" + amt + " has been verified by Raval Megh! ✅\\n\\n🔑 *YOUR 20 CERTIFICATES ZIP UNLOCK PASSWORD:*\\n*" + t.password + "*\\n\\nUse this password to extract your 20 certificates from the downloaded ZIP archive.\\n\\nThank you,\\nRaval Megh";
    const waUrl = cleanPhone ? ("https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(waMsgText)) : "#";

    let actions = '';
    if (t.status === 'pending') {
      actions = \`
        <button class="btn-wa" onclick="shareOnWhatsApp('\${t.paymentId}', '\${cleanPhone}', '\${escapeJs(t.name)}', '\${t.password}', \${amt})">
          📲 Share on WhatsApp
        </button>
        <button class="btn-action btn-reject" onclick="handleReject('\${t.paymentId}')" title="Reject">✕</button>
      \`;
    } else if (t.status === 'approved') {
      actions = \`
        <a class="btn-wa" href="\${waUrl}" target="_blank" style="background:#166534" title="Open WhatsApp chat with password">
          📲 Resend on WhatsApp
        </a>
      \`;
    } else {
      actions = \`<span style="color:#f85149;font-size:.8rem;font-weight:600">✕ Rejected</span>\`;
    }

    return \`
      <div class="tx-row">
        <div>
          <div class="tx-name">\${escapeHtml(t.name)}</div>
          <div style="color:#25d366;font-size:.82rem;font-weight:600;margin-top:2px">📱 \${escapeHtml(displayPhone)}</div>
        </div>
        <div>
          <div><span style="color:#3fb950;font-weight:700;font-size:.85rem;background:rgba(46,160,67,.15);padding:2px 7px;border-radius:4px">₹\${amt}</span></div>
          <div style="font-size:.75rem;color:#8b949e;margin-top:4px">\${time}</div>
        </div>
        <div>
          <span class="tx-pass" onclick="copyText('\${t.password}')" title="Click to copy">\${t.password} 📋</span>
        </div>
        <div>
          <span class="status-badge status-\${t.status}">\${t.status}</span>
        </div>
        <div style="text-align:right">
          \${actions}
        </div>
      </div>
    \`;
  }).join('');
}

// 3. SHARE DIRECTLY ON WHATSAPP & APPROVE
async function shareOnWhatsApp(paymentId, cleanPhone, name, password, amt) {
  if (!cleanPhone) {
    alert('User did not provide a valid WhatsApp number.');
    return;
  }

  // 1. Mark as approved on backend
  try {
    await fetch('/api/admin/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken
      },
      body: JSON.stringify({ paymentId, action: 'approve' })
    });
    fetchTransactions();
  } catch(e) {
    console.error('Approval sync error:', e);
  }

  // 2. Open WhatsApp chat directly with prefilled password!
  const amountVal = amt || 40;
  const msgText = "🎓 Hello " + name + ",\\n\\nYour payment of ₹" + amountVal + " has been verified by Raval Megh! ✅\\n\\n🔑 *YOUR 20 CERTIFICATES ZIP UNLOCK PASSWORD:*\\n*" + password + "*\\n\\nUse this password to extract your 20 certificates from the downloaded ZIP archive.\\n\\nThank you,\\nRaval Megh";
  const waUrl = "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(msgText);
  window.open(waUrl, '_blank');
}

async function loadAdminConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const cfg = await res.json();
      const el = document.getElementById('inputAmount');
      if (el && cfg.amount) el.value = cfg.amount;
    }
  } catch(e) {}
}

async function updateAmount() {
  const el = document.getElementById('inputAmount');
  const btn = document.getElementById('btnSaveAmount');
  const toast = document.getElementById('amountSavedToast');
  const amt = parseInt(el.value, 10);
  if (isNaN(amt) || amt <= 0) {
    alert('Please enter a valid amount greater than 0.');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken
      },
      body: JSON.stringify({ amount: amt })
    });
    if (res.ok) {
      btn.disabled = false;
      btn.textContent = 'Save';
      toast.style.display = 'inline';
      setTimeout(() => { toast.style.display = 'none'; }, 2500);
      fetchTransactions();
    } else {
      alert('Failed to update amount.');
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  } catch(e) {
    alert('Error updating amount: ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

async function handleReject(paymentId) {
  if (!confirm('Reject this transaction?')) return;
  try {
    await fetch('/api/admin/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken
      },
      body: JSON.stringify({ paymentId, action: 'reject' })
    });
    fetchTransactions();
  } catch (e) {
    alert('Reject error: ' + e.message);
  }
}

function escapeJs(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function copyText(txt) {
  navigator.clipboard.writeText(txt).then(() => {
    alert('Copied: ' + txt);
  });
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}
</script>
</body>
</html>`;
}

const server = http.createServer(handleRequest);

if (!isVercel) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin approval panel at http://localhost:${PORT}/admin`);
  });
}

module.exports = handleRequest;
module.exports.server = server;
