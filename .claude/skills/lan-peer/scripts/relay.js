// Relais de messages HTTP entre deux sessions Claude Code sur le réseau local.
//   node relay.js init <mon-nom>   crée la session (token aléatoire) et affiche le message pour le pair
//   node relay.js                  lance le relais (à faire par l'humain : voir SKILL.md)
//
// GET  /messages?since=<id>&wait=<s>   messages d'id > since (long-poll ≤ 120 s)
// POST /messages {"from","text"}        -> {id}
// PUT  /files/<nom>  GET /files/<nom>  GET /files   échange de fichiers (logs, sommes, scripts)
// Toutes les requêtes : en-tête X-Token.
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { load, save, lanIPv4, FILE } = require('./session');

const PORT = 47900;

if (process.argv[2] === 'init') {
  const me = process.argv[3] || os.hostname();
  const ip = lanIPv4()[0];
  const session = { url: `http://${ip}:${PORT}`, token: crypto.randomBytes(12).toString('hex'), me, host: true, lastSeen: 0 };
  save(session);
  console.log(`Session écrite dans ${FILE}`);
  console.log(`Relais : ${session.url}  (IPv4 locales : ${lanIPv4().join(', ')})`);
  console.log(`\nCommande pour le pair :\n  node .claude/skills/lan-peer/scripts/msg.js join ${session.url} ${session.token} <nom-du-pair>`);
  process.exit(0);
}

const { token } = load();
const DIR = path.join(os.tmpdir(), 'dlsgm-lan-relay');
const LOG = path.join(DIR, 'messages.json');
const FILES = path.join(DIR, 'files');
fs.mkdirSync(FILES, { recursive: true });

let messages = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : [];
let waiters = [];

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.headers['x-token'] !== token) return send(res, 401, { error: 'token' });

  if (url.pathname === '/messages' && req.method === 'GET') {
    const since = Number(url.searchParams.get('since') || 0);
    const wait = Math.min(Number(url.searchParams.get('wait') || 0), 120);
    const pending = messages.filter(m => m.id > since);
    if (pending.length || !wait) return send(res, 200, pending);
    const w = { since, res, timer: setTimeout(() => { waiters = waiters.filter(x => x !== w); send(res, 200, []); }, wait * 1000) };
    waiters.push(w);
    return;
  }

  if (url.pathname === '/messages' && req.method === 'POST') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let m;
      try { m = JSON.parse(body); } catch { return send(res, 400, { error: 'json' }); }
      if (typeof m.text !== 'string' || typeof m.from !== 'string') return send(res, 400, { error: 'from/text' });
      const msg = { id: messages.length + 1, from: m.from, text: m.text, ts: new Date().toISOString() };
      messages.push(msg);
      fs.writeFileSync(LOG, JSON.stringify(messages, null, 1));
      for (const w of waiters) { clearTimeout(w.timer); send(w.res, 200, messages.filter(x => x.id > w.since)); }
      waiters = [];
      send(res, 200, { id: msg.id });
    });
    return;
  }

  if (url.pathname === '/files' && req.method === 'GET') return send(res, 200, fs.readdirSync(FILES));

  const fm = url.pathname.match(/^\/files\/([\w.\-]{1,120})$/);
  if (fm) {
    const p = path.join(FILES, fm[1]);
    if (req.method === 'PUT') {
      const out = fs.createWriteStream(p);
      req.pipe(out);
      out.on('finish', () => send(res, 200, { ok: true, size: fs.statSync(p).size }));
      return;
    }
    if (req.method === 'GET') {
      if (!fs.existsSync(p)) return send(res, 404, { error: 'absent' });
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      return fs.createReadStream(p).pipe(res);
    }
  }
  send(res, 404, { error: 'route' });
}).listen(PORT, '0.0.0.0', () => console.log(`relais sur :${PORT} — données dans ${DIR}`));
