import net from 'net';
import tls from 'tls';

/**
 * Relais local pour les proxys avec identifiants. Chromium (dont la pile
 * réseau sert à tous les accès DLsite, voir dlsite-net.ts) ne sait pas
 * s'authentifier auprès d'un proxy SOCKS5, et l'authentification d'un proxy
 * HTTP depuis `net.fetch` n'est pas fiable : DLSGM écoute donc sur
 * 127.0.0.1 en SOCKS5 sans authentification, et c'est ce relais qui ouvre le
 * tunnel vers le vrai proxy avec les identifiants (SOCKS5 RFC 1928 + 1929,
 * ou HTTP CONNECT avec Proxy-Authorization).
 *
 * N'écoute que sur la boucle locale, sur un port choisi par le système.
 */

export interface UpstreamProxy {
  scheme: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

const HANDSHAKE_TIMEOUT_MS = 20000;

/** Lecture d'un nombre exact d'octets sur une socket (poignées de main SOCKS / HTTP). */
class SocketReader {
  private buffer = Buffer.alloc(0);
  private waiter: (() => void) | null = null;
  private failure: Error | null = null;

  constructor(private socket: net.Socket) {
    socket.on('data', this.onData);
    socket.on('error', this.onEnd);
    socket.on('close', this.onEnd);
  }

  private onData = (chunk: Buffer) => {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.waiter?.();
  };

  private onEnd = (error?: Error | boolean) => {
    this.failure = error instanceof Error ? error : new Error('Connexion fermée pendant la négociation.');
    this.waiter?.();
  };

  private async waitFor(condition: () => boolean): Promise<void> {
    while (!condition()) {
      if (this.failure) throw this.failure;
      await new Promise<void>(resolve => (this.waiter = resolve));
      this.waiter = null;
    }
  }

  async read(n: number): Promise<Buffer> {
    await this.waitFor(() => this.buffer.length >= n);
    const out = this.buffer.subarray(0, n);
    this.buffer = this.buffer.subarray(n);
    return out;
  }

  /** Jusqu'à la fin des en-têtes HTTP (\r\n\r\n) incluse. */
  async readHttpHead(): Promise<string> {
    await this.waitFor(() => this.buffer.includes('\r\n\r\n'));
    const end = this.buffer.indexOf('\r\n\r\n') + 4;
    const head = this.buffer.subarray(0, end).toString('latin1');
    this.buffer = this.buffer.subarray(end);
    return head;
  }

  /** Rend la main : les octets déjà lus mais non consommés, et plus d'écoute. */
  release(): Buffer {
    this.socket.off('data', this.onData);
    this.socket.off('error', this.onEnd);
    this.socket.off('close', this.onEnd);
    return this.buffer;
  }
}

/** Requête SOCKS5 CONNECT (sans l'en-tête VER/CMD/RSV) : ATYP + adresse + port. */
async function readSocksAddress(reader: SocketReader): Promise<Buffer> {
  const [atyp] = await reader.read(1);
  let address: Buffer;
  if (atyp === 0x01) address = await reader.read(4);
  else if (atyp === 0x04) address = await reader.read(16);
  else if (atyp === 0x03) {
    const [length] = await reader.read(1);
    address = Buffer.concat([Buffer.from([length]), await reader.read(length)]);
  } else throw new Error(`Type d'adresse SOCKS inconnu : ${atyp}`);
  return Buffer.concat([Buffer.from([atyp]), address, await reader.read(2)]);
}

/** "hôte:port" d'une adresse SOCKS (pour HTTP CONNECT). */
function describeSocksAddress(address: Buffer): string {
  const atyp = address[0];
  const port = address.readUInt16BE(address.length - 2);
  if (atyp === 0x01) return `${Array.from(address.subarray(1, 5)).join('.')}:${port}`;
  if (atyp === 0x03) return `${address.subarray(2, 2 + address[1]).toString('latin1')}:${port}`;
  const groups = [];
  for (let i = 1; i < 17; i += 2) groups.push(address.readUInt16BE(i).toString(16));
  return `[${groups.join(':')}]:${port}`;
}

function connectUpstream(upstream: UpstreamProxy): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket =
      upstream.scheme === 'https'
        ? tls.connect({ host: upstream.host, port: upstream.port, servername: upstream.host })
        : net.connect({ host: upstream.host, port: upstream.port });
    socket.setTimeout(HANDSHAKE_TIMEOUT_MS, () => socket.destroy(new Error('Le proxy ne répond pas.')));
    socket.once(upstream.scheme === 'https' ? 'secureConnect' : 'connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

/** Ouvre, à travers le proxy amont authentifié, un tunnel vers `address` (format SOCKS). */
async function openTunnel(upstream: UpstreamProxy, address: Buffer): Promise<{ socket: net.Socket; leftover: Buffer }> {
  const socket = await connectUpstream(upstream);
  const reader = new SocketReader(socket);
  try {
    if (upstream.scheme === 'socks5') {
      const withAuth = upstream.username !== undefined;
      socket.write(Buffer.from([0x05, 0x01, withAuth ? 0x02 : 0x00]));
      const [version, method] = await reader.read(2);
      if (version !== 0x05 || method === 0xff) throw new Error('Le proxy SOCKS5 refuse la méthode d’authentification.');
      if (method === 0x02) {
        const user = Buffer.from(upstream.username ?? '', 'utf8');
        const pass = Buffer.from(upstream.password ?? '', 'utf8');
        socket.write(Buffer.concat([Buffer.from([0x01, user.length]), user, Buffer.from([pass.length]), pass]));
        const [, status] = await reader.read(2);
        if (status !== 0x00) throw new Error('Identifiants refusés par le proxy SOCKS5.');
      }
      socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), address]));
      const [, reply] = await reader.read(3);
      await readSocksAddress(reader); // adresse liée, non utilisée
      if (reply !== 0x00) throw new Error(`Le proxy SOCKS5 a refusé la connexion (code ${reply}).`);
    } else {
      const target = describeSocksAddress(address);
      const auth = upstream.username !== undefined
        ? `Proxy-Authorization: Basic ${Buffer.from(`${upstream.username}:${upstream.password ?? ''}`).toString('base64')}\r\n`
        : '';
      socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${auth}\r\n`);
      const status = /^HTTP\/1\.[01] (\d{3})/.exec(await reader.readHttpHead())?.[1];
      if (status === '407') throw new Error('Identifiants refusés par le proxy HTTP (407).');
      if (status !== '200') throw new Error(`Le proxy HTTP a refusé le tunnel (${status ?? 'réponse illisible'}).`);
    }
    socket.setTimeout(0);
    return { socket, leftover: reader.release() };
  } catch (error) {
    reader.release();
    socket.destroy();
    throw error;
  }
}

async function handleClient(client: net.Socket, upstream: UpstreamProxy): Promise<void> {
  const reader = new SocketReader(client);
  client.setTimeout(HANDSHAKE_TIMEOUT_MS, () => client.destroy());
  // Salut SOCKS5 : on n'accepte que "sans authentification" (Chromium).
  const [version, count] = await reader.read(2);
  const methods = await reader.read(count);
  if (version !== 0x05 || !methods.includes(0x00)) {
    client.end(Buffer.from([0x05, 0xff]));
    return;
  }
  client.write(Buffer.from([0x05, 0x00]));
  const [, command] = await reader.read(3);
  const address = await readSocksAddress(reader);
  if (command !== 0x01) {
    client.end(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0])); // commande non prise en charge
    return;
  }

  let tunnel: { socket: net.Socket; leftover: Buffer };
  try {
    tunnel = await openTunnel(upstream, address);
  } catch (error) {
    console.error('Relais proxy :', (error as Error).message);
    client.end(Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0])); // échec général
    return;
  }
  client.setTimeout(0);
  client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
  const pending = reader.release();
  if (pending.length > 0) tunnel.socket.write(pending);
  if (tunnel.leftover.length > 0) client.write(tunnel.leftover);
  client.pipe(tunnel.socket).pipe(client);
  const close = () => {
    client.destroy();
    tunnel.socket.destroy();
  };
  client.on('error', close);
  tunnel.socket.on('error', close);
}

export interface ProxyRelay {
  /** Adresse à donner à Chromium, ex: socks5://127.0.0.1:53124 */
  url: string;
  close: () => Promise<void>;
}

export function startProxyRelay(upstream: UpstreamProxy): Promise<ProxyRelay> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer(client => {
    sockets.add(client);
    client.on('close', () => sockets.delete(client));
    handleClient(client, upstream).catch(() => client.destroy());
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({
        url: `socks5://127.0.0.1:${port}`,
        close: () =>
          new Promise(done => {
            sockets.forEach(s => s.destroy());
            server.close(() => done());
          })
      });
    });
  });
}
