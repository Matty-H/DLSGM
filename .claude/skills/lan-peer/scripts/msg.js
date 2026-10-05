// Client du relais lan-peer.
//   node msg.js join <url> <token> <mon-nom>   (pair) enregistre la session
//   node msg.js ping                           vérifie que le relais répond (et refuse sans token)
//   node msg.js post <texte | @fichier>        envoie un message signé de mon nom
//   node msg.js wait [minutes=28]              attend un message de l'AUTRE session ; à lancer en arrière-plan
//   node msg.js read                           affiche les messages non lus (sans attendre)
//   node msg.js put <fichier> [nom]            dépose un fichier ;  get <nom> <dest>  le récupère
// `wait` et `read` avancent le curseur (lastSeen) : un message n'est rendu qu'une fois.
const fs = require('fs');
const path = require('path');
const { load, save, FILE } = require('./session');

const [cmd, ...args] = process.argv.slice(2);

async function call(session, method, pathname, body, raw) {
  const res = await fetch(session.url + pathname, {
    method,
    headers: { 'X-Token': session.token, ...(body && !raw ? { 'Content-Type': 'application/json; charset=utf-8' } : {}) },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(125_000)
  });
  if (!res.ok) throw new Error(`${method} ${pathname} : HTTP ${res.status} ${await res.text()}`);
  return raw === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.json();
}

function show(messages) {
  for (const m of messages) console.log(`\n--- #${m.id} de ${m.from} (${m.ts})\n${m.text}`);
}

(async () => {
  if (cmd === 'join') {
    const [url, token, me] = args;
    if (!url || !token || !me) throw new Error('usage : join <url> <token> <mon-nom>');
    save({ url: url.replace(/\/$/, ''), token, me, host: false, lastSeen: 0 });
    console.log(`Session écrite dans ${FILE}`);
    return;
  }
  const s = load();
  if (cmd === 'ping') {
    const all = await call(s, 'GET', '/messages?since=0');
    const anon = await fetch(s.url + '/messages').then(r => r.status);
    console.log(`relais OK (${all.length} messages), sans token : ${anon}`);
  } else if (cmd === 'post') {
    const text = args[0]?.startsWith('@') ? fs.readFileSync(args[0].slice(1), 'utf8') : args.join(' ');
    if (!text) throw new Error('message vide');
    console.log(await call(s, 'POST', '/messages', { from: s.me, text }));
  } else if (cmd === 'read' || cmd === 'wait') {
    const deadline = Date.now() + Number(args[0] || 28) * 60_000;
    for (;;) {
      const got = await call(s, 'GET', `/messages?since=${s.lastSeen}&wait=${cmd === 'wait' ? 110 : 0}`);
      // Mes propres messages font seulement avancer le curseur, ils ne réveillent pas l'attente.
      if (got.length) {
        s.lastSeen = got.at(-1).id;
        save(s);
      }
      const others = got.filter(m => m.from !== s.me);
      if (others.length) return show(others);
      if (cmd === 'read' || Date.now() > deadline) {
        console.log(cmd === 'read' ? 'aucun message non lu' : `aucun message en ${args[0] || 28} min — relance l'attente`);
        return;
      }
    }
  } else if (cmd === 'put') {
    const name = args[1] || path.basename(args[0]);
    console.log(await call(s, 'PUT', `/files/${name}`, fs.readFileSync(args[0]), true));
  } else if (cmd === 'get') {
    fs.writeFileSync(args[1], await call(s, 'GET', `/files/${args[0]}`, undefined, 'buffer'));
    console.log(`écrit : ${args[1]}`);
  } else {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 9).join('\n'));
  }
})().catch(e => { console.error('ERREUR', e.message); process.exit(1); });
