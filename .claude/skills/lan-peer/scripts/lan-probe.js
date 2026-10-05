// Client de test brut du protocole LAN de DLSGM (version 1), indépendant de l'app :
// cas limites qu'un envoyeur DLSGM normal ne produit pas.
//   node lan-probe.js discover [ip-du-pair]            broadcast UDP 47822 (+ unicast) et réponses
//   node lan-probe.js hello <host> <port> <code>
//   node lan-probe.js send <host> <port> <code> <ID> <scénario>
//     jp-nfc       noms japonais NFC, sous-dossiers, dossier vide, fichier vide → doit réussir
//     jp-nfd       mêmes noms en NFD → doit arriver en NFC (depuis 1.3.1)
//     nfc-nfd-dup  même nom en NFC et en NFD → 400 « Fichier en double »
//     reserved     aux.txt → 400 à l'offre
//     big-lie      fichier plus gros qu'annoncé → 400, compteur jamais négatif
//     big          50 Mo aléatoires → débit brut du lien
// Chaque ID envoyé crée un vrai dossier de jeu chez le receveur : utiliser des ID
// factices (RJ999999xx) et un dossier de test côté receveur.
const dgram = require('dgram');
const http = require('http');
const crypto = require('crypto');

const [cmd, host, port, code, gameId, scenario] = process.argv.slice(2);

function req(method, p, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const r = http.request({ host, port: Number(port), method, path: p, timeout: 300000,
      headers: { 'x-dlsgm-code': code, ...(payload ? { 'Content-Length': payload.length } : {}), ...extraHeaders } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    r.end(payload ?? undefined);
  });
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const SCENARIOS = {
  // Noms japonais NFC (forme Windows habituelle), dossier vide, fichier vide.
  'jp-nfc': () => ({
    files: { 'game/ゲーム.exe': 'MZ fake exe', 'game/セーブ/データ１.sav': 'save', 'game/www/img/パンダ.png': 'png', 'game/empty.txt': '' },
    dirs: ['セーブ', 'www', 'www/img', '空フォルダ']
  }),
  // Mêmes noms en NFD (forme produite par d'anciens HFS+ / certains zip mac) : ガ = カ + U+3099.
  'jp-nfd': () => ({
    files: { ['game/' + 'ゲーム.exe'.normalize('NFD')]: 'MZ nfd', ['game/' + 'データ'.normalize('NFD') + '/a.txt']: 'x' },
    dirs: ['データ'.normalize('NFD')]
  }),
  // Deux chemins qui ne diffèrent que par la normalisation : même fichier sur APFS.
  'nfc-nfd-dup': () => ({
    files: { ['game/' + 'ゲーム.txt'.normalize('NFC')]: 'nfc', ['game/' + 'ゲーム.txt'.normalize('NFD')]: 'nfd' },
    dirs: []
  }),
  // Doit être refusé à l'offre (400).
  // 50 Mo d'un seul bloc : débit brut du receveur.
  big: () => ({ files: { 'game/big.bin': crypto.randomBytes(50 * 1024 * 1024) }, dirs: [] }),
  reserved: () => ({ files: { 'game/aux.txt': 'x' }, dirs: [] }),
  // Annonce 5 octets, en envoie 10 : le receveur doit refuser le fichier.
  'big-lie': () => ({ files: { 'game/a.bin': 'xxxxx' }, dirs: [], lie: { 'game/a.bin': '0123456789' } })
};

async function send() {
  const sc = SCENARIOS[scenario]();
  const entries = Object.entries(sc.files).map(([k, v]) => [k, Buffer.from(v, 'utf8')]);
  const hello = await req('GET', '/dlsgm/hello');
  console.log('hello', hello.status, hello.body);
  const offer = await req('POST', '/dlsgm/offer', {
    gameId, senderName: 'lanprobe-windows', dirs: sc.dirs,
    files: entries.map(([k, b]) => ({ path: k, size: b.length })), metadata: null
  }, { 'Content-Type': 'application/json' });
  console.log('offer', offer.status, offer.body);
  if (offer.status !== 200) return;
  const { transferId } = JSON.parse(offer.body);
  for (const [k, b] of entries) {
    const body = sc.lie?.[k] ? Buffer.from(sc.lie[k]) : b;
    const put = await req('PUT', `/dlsgm/transfer/${transferId}/file?path=${encodeURIComponent(k)}`, body,
      { 'Content-Type': 'application/octet-stream' }).catch((e) => ({ status: 'ERR', body: e.message }));
    const ok = put.status === 200 && JSON.parse(put.body).sha256 === sha(body);
    console.log('put', JSON.stringify(k), put.status, put.body, ok ? 'sha OK' : '');
  }
  const done = await req('POST', `/dlsgm/transfer/${transferId}/complete`, {}, { 'Content-Type': 'application/json' });
  console.log('complete', done.status, done.body);
  if (done.status !== 200) {
    const del = await req('DELETE', `/dlsgm/transfer/${transferId}`);
    console.log('delete', del.status, del.body);
  }
}

function discover() {
  const s = dgram.createSocket('udp4');
  s.on('message', (m, r) => console.log('réponse de', r.address + ':' + r.port, m.toString()));
  s.bind(0, () => {
    s.setBroadcast(true);
    const os = require('os');
    const targets = new Set(['255.255.255.255', ...(host ? [host] : [])]);
    for (const i of Object.values(os.networkInterfaces()).flat()) {
      if (!i || i.family !== 'IPv4' || i.internal) continue;
      const a = i.address.split('.').map(Number), m = i.netmask.split('.').map(Number);
      targets.add(a.map((b, k) => (b | (~m[k] & 255)) & 255).join('.'));
    }
    for (const a of targets) {
      s.send('DLSGM_DISCOVER_1', 47822, a, (e) => console.log('envoi vers', a, e ? e.message : 'ok'));
    }
    setTimeout(() => { s.close(); console.log('fin'); }, 2500);
  });
}

(async () => {
  if (cmd === 'discover') return discover();
  if (cmd === 'hello') return console.log(await req('GET', '/dlsgm/hello'));
  if (cmd === 'send') return send();
})().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });
