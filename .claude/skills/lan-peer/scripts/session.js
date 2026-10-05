// État partagé par les scripts lan-peer : <repo>/.claude/lan-peer-session.json
// (ignoré par git : il contient le token). Créé par `relay.js init` sur l'hôte,
// par `msg.js join` sur le pair.
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '../../../..');
const FILE = path.join(REPO, '.claude', 'lan-peer-session.json');

function load() {
  if (!fs.existsSync(FILE)) {
    console.error(`Pas de session : ${FILE} absent. Hôte : node relay.js init <nom>. Pair : node msg.js join <url> <token> <nom>.`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function save(session) {
  fs.writeFileSync(FILE, JSON.stringify(session, null, 2));
}

function lanIPv4() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
    .map(i => i.address);
}

/** Profil DLSGM de cette machine (USER_DATA pour en forcer un autre). */
function userDataDir() {
  if (process.env.USER_DATA) return process.env.USER_DATA;
  if (process.platform === 'win32') return path.join(process.env.APPDATA, 'dlsgm');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'dlsgm');
  return path.join(os.homedir(), '.config', 'dlsgm');
}

module.exports = { REPO, FILE, load, save, lanIPv4, userDataDir };
