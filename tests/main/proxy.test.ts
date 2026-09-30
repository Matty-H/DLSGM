import net from 'net';
import { afterEach, describe, expect, it, vi } from 'vitest';

// safeStorage factice (réversible, reconnaissable) : pas de DPAPI en test.
vi.mock('electron', () => ({
  net: {},
  session: {},
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(`enc:${plain}`),
    decryptString: (blob: Buffer) => blob.toString().replace(/^enc:/, '')
  }
}));

import { PASSWORD_MASK, maskProxyUrl, parseProxyUrl, resolveUpstream } from '../../src/main/proxy-config';
import { startProxyRelay, type ProxyRelay } from '../../src/main/proxy-relay';
import { protectProxySettings } from '../../src/main/dlsite-net';

describe('parseProxyUrl', () => {
  it('accepte un SOCKS5 avec identifiants (le format des fournisseurs)', () => {
    expect(parseProxyUrl('socks5://VOTRE_ID:VOTRE_MDP@154.21.7.115:1080')).toEqual({
      scheme: 'socks5', host: '154.21.7.115', port: 1080, username: 'VOTRE_ID', password: 'VOTRE_MDP'
    });
  });

  it('décode les caractères spéciaux et accepte un « : » dans le mot de passe', () => {
    expect(parseProxyUrl('http://user%40mail.com:p%40ss:word@proxy.example.jp:8080')).toMatchObject({
      username: 'user@mail.com', password: 'p@ss:word', host: 'proxy.example.jp'
    });
  });

  it.each([
    ['http://127.0.0.1:8080', true],
    ['socks5://[2001:db8::1]:1080', true],
    ['socks4://user:pass@1.2.3.4:1080', false], // pas de mot de passe en SOCKS4
    ['ftp://1.2.3.4:21', false],
    ['socks5://1.2.3.4', false],
    ['socks5://1.2.3.4:99999', false],
    ['socks5://user:bad%zz@1.2.3.4:1080', false]
  ])('%s → valide : %s', (value, valid) => {
    expect(parseProxyUrl(value) !== null).toBe(valid);
  });
});

describe('masque et secret', () => {
  it("n'enregistre jamais le mot de passe en clair, et garde l'ancien si le masque n'a pas changé", () => {
    const first = protectProxySettings('socks5://id:secret@1.2.3.4:1080', undefined);
    expect(first.dlsiteProxy).toBe(`socks5://id:${PASSWORD_MASK}@1.2.3.4:1080`);
    expect(first.dlsiteProxy).not.toContain('secret');
    expect(Buffer.from(first.dlsiteProxySecret, 'base64').toString()).toBe('enc:secret');

    const again = protectProxySettings(first.dlsiteProxy, first.dlsiteProxySecret);
    expect(again).toEqual(first);

    const upstream = resolveUpstream(parseProxyUrl(again.dlsiteProxy)!, 'secret');
    expect(upstream).toMatchObject({ username: 'id', password: 'secret' });
  });

  it('efface le secret quand le proxy n’a plus d’identifiants', () => {
    expect(protectProxySettings('http://1.2.3.4:8080', 'ancien')).toEqual({ dlsiteProxy: 'http://1.2.3.4:8080', dlsiteProxySecret: '' });
    expect(maskProxyUrl('http://1.2.3.4:8080')).toBe('http://1.2.3.4:8080');
  });
});

// --- Relais de bout en bout ------------------------------------------------

const servers: net.Server[] = [];
const relays: ProxyRelay[] = [];
afterEach(async () => {
  await Promise.all(relays.splice(0).map(r => r.close()));
  servers.splice(0).forEach(s => s.close());
});

function listen(server: net.Server): Promise<number> {
  servers.push(server);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port)));
}

/** Serveur cible : répond "pong:<reçu>". */
const startTarget = () => listen(net.createServer(s => s.on('data', d => s.end(`pong:${d}`))));

/** Lit exactement n octets (mode pause : rien n'est perdu entre deux lectures). */
function readN(socket: net.Socket, n: number): Promise<Buffer> {
  return new Promise(resolve => {
    const tryRead = () => {
      const chunk = socket.read(n) as Buffer | null;
      if (chunk) {
        socket.off('readable', tryRead);
        resolve(chunk);
      }
    };
    socket.on('readable', tryRead);
    tryRead();
  });
}

/** Faux proxy SOCKS5 exigeant identifiant/mot de passe, qui se connecte vraiment à la cible demandée. */
function startSocks5Upstream(user: string, pass: string): Promise<number> {
  return listen(
    net.createServer(async client => {
      await readN(client, 3); // 05 01 02
      client.write(Buffer.from([0x05, 0x02]));
      const [, ulen] = await readN(client, 2);
      const u = (await readN(client, ulen)).toString();
      const [plen] = await readN(client, 1);
      const p = (await readN(client, plen)).toString();
      const ok = u === user && p === pass;
      client.write(Buffer.from([0x01, ok ? 0x00 : 0x01]));
      if (!ok) return client.end();
      const [, , , atyp] = await readN(client, 4);
      let host: string;
      if (atyp === 0x03) host = (await readN(client, (await readN(client, 1))[0])).toString();
      else host = Array.from(await readN(client, 4)).join('.');
      const port = (await readN(client, 2)).readUInt16BE(0);
      const target = net.connect(port, host, () => {
        client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]));
        client.pipe(target).pipe(client);
      });
    })
  );
}

/** Faux proxy HTTP : CONNECT avec Proxy-Authorization obligatoire. */
function startHttpUpstream(user: string, pass: string): Promise<number> {
  const expected = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  return listen(
    net.createServer(client => {
      client.once('data', head => {
        const text = head.toString();
        const [, host, port] = /^CONNECT ([^:]+):(\d+) /.exec(text)!;
        if (!text.includes(`Proxy-Authorization: ${expected}`)) return client.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
        const target = net.connect(Number(port), host, () => {
          client.write('HTTP/1.1 200 Connection established\r\n\r\n');
          client.pipe(target).pipe(client);
        });
      });
    })
  );
}

/** Client SOCKS5 minimal (comme Chromium : sans authentification, nom d'hôte). */
async function socksRequest(relayUrl: string, host: string, port: number, payload: string): Promise<{ reply: number; body: string }> {
  const relayPort = Number(new URL(relayUrl).port);
  const socket = net.connect(relayPort, '127.0.0.1');
  await new Promise(resolve => socket.once('connect', resolve));
  socket.write(Buffer.from([0x05, 0x01, 0x00]));
  await readN(socket, 2);
  const name = Buffer.from(host);
  const portBytes = Buffer.alloc(2);
  portBytes.writeUInt16BE(port);
  socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, name.length]), name, portBytes]));
  const [, reply] = await readN(socket, 10);
  if (reply !== 0x00) {
    socket.destroy();
    return { reply, body: '' };
  }
  socket.write(payload);
  const body = await new Promise<string>(resolve => {
    let text = '';
    socket.on('data', d => (text += d));
    socket.on('end', () => resolve(text));
  });
  return { reply, body };
}

describe('relais proxy', () => {
  it('traverse un proxy SOCKS5 authentifié', async () => {
    const targetPort = await startTarget();
    const upstreamPort = await startSocks5Upstream('id', 'mdp');
    const relay = await startProxyRelay({ scheme: 'socks5', host: '127.0.0.1', port: upstreamPort, username: 'id', password: 'mdp' });
    relays.push(relay);
    expect(relay.url).toMatch(/^socks5:\/\/127\.0\.0\.1:\d+$/);
    expect(await socksRequest(relay.url, 'localhost', targetPort, 'ping')).toEqual({ reply: 0, body: 'pong:ping' });
  });

  it('renvoie un échec SOCKS au client si les identifiants sont refusés', async () => {
    const targetPort = await startTarget();
    const upstreamPort = await startSocks5Upstream('id', 'mdp');
    const relay = await startProxyRelay({ scheme: 'socks5', host: '127.0.0.1', port: upstreamPort, username: 'id', password: 'faux' });
    relays.push(relay);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await socksRequest(relay.url, 'localhost', targetPort, 'ping')).reply).toBe(1);
    consoleError.mockRestore();
  });

  it('traverse un proxy HTTP authentifié (CONNECT)', async () => {
    const targetPort = await startTarget();
    const upstreamPort = await startHttpUpstream('id', 'mdp');
    const relay = await startProxyRelay({ scheme: 'http', host: '127.0.0.1', port: upstreamPort, username: 'id', password: 'mdp' });
    relays.push(relay);
    expect(await socksRequest(relay.url, 'localhost', targetPort, 'ping')).toEqual({ reply: 0, body: 'pong:ping' });
  });
});
