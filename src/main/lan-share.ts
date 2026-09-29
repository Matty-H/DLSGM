import http from 'http';
import dgram from 'dgram';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Transform, type Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { GameMetadata, LanPeer, LanReceiverStatus, LanSendRequest, LanSendResult, LanTransferProgress } from '../shared/ipc-types';

/**
 * Échange de jeux en réseau local, de PC à PC.
 *
 * Le PC qui reçoit ouvre un serveur HTTP (port TCP configurable) protégé par
 * un code à 6 chiffres régénéré à chaque ouverture, et répond à une
 * découverte par broadcast UDP. Le PC qui envoie pousse un jeu à la fois :
 *
 *   1. POST /dlsgm/offer     liste des fichiers (tailles), dossiers, fiche
 *   2. PUT  /dlsgm/transfer/<id>/file?path=…   un fichier par requête ; le
 *      receveur renvoie le SHA-256 de ce qu'il a écrit, comparé par l'envoyeur
 *   3. POST /dlsgm/transfer/<id>/complete   déplace le jeu dans la bibliothèque
 *
 * Tout est écrit dans `<dossier de jeux>/.dlsgm-incoming/<id>/` (même volume,
 * nom qui ne ressemble pas à un ID DLsite donc invisible du scan) et le
 * dossier du jeu n'apparaît, par un simple renommage, qu'une fois complet et
 * vérifié. Un jeu déjà présent chez le receveur n'est jamais écrasé.
 *
 * Le trafic n'est pas chiffré : le code protège contre un envoi non désiré
 * sur le réseau local, pas contre quelqu'un qui écoute ce réseau.
 */

export const DEFAULT_LAN_PORT = 47821;
const PROTOCOL_VERSION = 1;
const DISCOVERY_PORT = 47822;
const DISCOVERY_MAGIC = 'DLSGM_DISCOVER_1';
const DISCOVERY_WINDOW_MS = 1500;

const INCOMING_DIR = '.dlsgm-incoming';
// Au-delà, la réception se ferme d'elle-même : on ne laisse pas deviner le code.
const MAX_AUTH_FAILURES = 10;
const MAX_OFFER_BYTES = 32 * 1024 * 1024;
const MAX_FILES = 200_000;
const MAX_ACTIVE_TRANSFERS = 4;
// Transfert entrant abandonné (envoyeur éteint, câble débranché...).
const TRANSFER_IDLE_TIMEOUT_MS = 2 * 60_000;
// Socket inactive (ni octet reçu ni envoyé) : coupée des deux côtés.
const SOCKET_IDLE_TIMEOUT_MS = 60_000;
const PROGRESS_THROTTLE_MS = 200;

const GAME_ID_REGEX = /^[A-Z]{2}\d{6,9}$/;
const IMAGE_FILE_REGEX = /^(work_image|sample_\d+)\.jpg$/;
// Noms refusés par Windows, ou qui y désigneraient autre chose qu'un fichier
// (flux alternatif via ':', périphériques CON/NUL...).
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
const FORBIDDEN_CHARS = /[<>:"\\|?*\x00-\x1f]/;
// Marqueur d'image fournie par l'utilisateur (voir ipc-handlers.ts).
const MANUAL_IMAGE = 'manual';

export interface LanShareDeps {
  getDestinationFolder(): Promise<string>;
  getImgCacheDir(): string;
  getCacheEntry(gameId: string): Promise<GameMetadata | undefined>;
  /** Crée la fiche si elle n'existe pas ; false si une fiche existait déjà. */
  insertCacheEntry(gameId: string, entry: GameMetadata): Promise<boolean>;
  emitProgress(progress: LanTransferProgress): void;
  emitReceiverStatus(status: LanReceiverStatus): void;
}

/** Vrai si `child` est `parent` lui-même ou un chemin situé dessous. */
function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Chemin relatif reçu du réseau (séparateur '/') → segments sûrs, ou null.
 * Refuse tout ce qui pourrait sortir du dossier de réception ou y désigner
 * autre chose qu'un fichier ordinaire.
 */
function safeSegments(value: unknown): string[] | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return null;
  const segments = value.split('/');
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') return null;
    if (FORBIDDEN_CHARS.test(segment) || WINDOWS_RESERVED_NAME.test(segment) || /[. ]$/.test(segment)) return null;
  }
  return segments;
}

function localIPv4Addresses(includeInternal = false): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && (includeInternal || !i.internal))
    .map(i => i.address);
}

/** Adresses de broadcast de chaque interface (adresse | ~masque) + broadcast global. */
function broadcastAddresses(): string[] {
  const result = new Set<string>(['255.255.255.255']);
  for (const iface of Object.values(os.networkInterfaces()).flat()) {
    if (!iface || iface.family !== 'IPv4' || iface.internal) continue;
    const addr = iface.address.split('.').map(Number);
    const mask = iface.netmask.split('.').map(Number);
    result.add(addr.map((byte, i) => (byte | (~mask[i] & 255)) & 255).join('.'));
  }
  return [...result];
}

/** Compare deux codes en temps constant (longueurs égalisées par hachage). */
function codesMatch(given: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function isDlsiteImageUrl(value: string): boolean {
  try {
    const url = new URL(value.startsWith('http') ? value : `https:${value}`);
    return url.protocol === 'https:' && /(^|\.)dlsite\.(jp|com)$/.test(url.hostname);
  } catch {
    return false;
  }
}

const STRING_FIELDS = [
  'title_name_masked', 'circle', 'brand', 'publisher', 'label', 'description', 'category', 'announce_date',
  'release_date', 'regist_date', 'modified_date', 'file_size', 'series'
] as const;
const STRING_ARRAY_FIELDS = [
  'genre', 'file_format', 'language', 'author', 'writer', 'scenario', 'illustration', 'voice_actor', 'music', 'event'
] as const;

/**
 * Fiche reçue d'un autre PC : donnée non fiable. On ne garde que les champs
 * de métadonnées connus et bien typés — jamais les données personnelles de
 * l'envoyeur (note, tags, temps de jeu, exclusion de sandbox) — et on
 * neutralise toute URL d'image hors DLsite, que `download-game-images` irait
 * sinon chercher.
 */
function sanitizeMetadata(raw: unknown): GameMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.work_name !== 'string' || r.fetchFailed) return null;

  const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
  const out: Record<string, unknown> = {
    work_name: r.work_name,
    age_category: r.age_category === 'R15' || r.age_category === 'R18' ? r.age_category : 'ALL_AGES',
    platform: typeof r.platform === 'string' ? r.platform : '',
    page_count: typeof r.page_count === 'number' && Number.isFinite(r.page_count) ? r.page_count : null,
    work_image: typeof r.work_image === 'string' && (r.work_image === MANUAL_IMAGE || isDlsiteImageUrl(r.work_image)) ? r.work_image : null,
    // Une URL refusée devient 'manual' plutôt que d'être retirée : la
    // position des échantillons (sample_<n>.jpg) doit rester la même.
    sample_images: isStringArray(r.sample_images)
      ? r.sample_images.map(src => (src === MANUAL_IMAGE || isDlsiteImageUrl(src) ? src : MANUAL_IMAGE))
      : null,
    addedDate: new Date().toISOString()
  };
  for (const key of STRING_FIELDS) out[key] = typeof r[key] === 'string' ? r[key] : null;
  for (const key of STRING_ARRAY_FIELDS) out[key] = isStringArray(r[key]) ? r[key] : null;
  if (safeSegments(r.executablePath)) out.executablePath = r.executablePath;
  return out as unknown as GameMetadata;
}

/** Fiche à transmettre : les métadonnées seules, sans les données personnelles. */
function shareableMetadata(entry: GameMetadata | undefined): Record<string, unknown> | null {
  if (!entry || entry.fetchFailed) return null;
  const e = entry as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ['work_name', 'age_category', 'platform', 'page_count', 'work_image', 'sample_images', ...STRING_FIELDS, ...STRING_ARRAY_FIELDS]) {
    out[key] = e[key] ?? null;
  }
  // Relatif au dossier du jeu, avec '/' : identique d'un PC à l'autre.
  if (entry.executablePath) out.executablePath = entry.executablePath.split(path.sep).join('/');
  return out;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': data.length });
  res.end(data);
}

async function readJsonBody(req: http.IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Requête trop volumineuse.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON invalide.');
  }
}

/** Limite la fréquence d'un appel, en laissant toujours passer le dernier via `flush`. */
function throttle(fn: () => void, intervalMs: number): { call: () => void; flush: () => void } {
  let last = 0;
  return {
    call: () => {
      const now = Date.now();
      if (now - last >= intervalMs) {
        last = now;
        fn();
      }
    },
    flush: () => {
      last = Date.now();
      fn();
    }
  };
}

interface IncomingFile {
  size: number;
  received: boolean;
}

interface IncomingTransfer {
  id: string;
  gameId: string;
  peer: string;
  destinationFolder: string;
  stagingDir: string;
  /** Clés 'game/<chemin>' ou 'images/<fichier>'. */
  files: Map<string, IncomingFile>;
  dirs: string[][];
  metadata: GameMetadata | null;
  totalBytes: number;
  receivedBytes: number;
  doneFiles: number;
  lastActivity: number;
  /** Requêtes d'upload en cours, coupées si le transfert est annulé. */
  uploads: Set<http.IncomingMessage>;
  writing: Set<string>;
  completing: boolean;
  report: ReturnType<typeof throttle>;
}

interface FileToSend {
  key: string;
  abs: string;
  size: number;
}

export class LanShare {
  private server: http.Server | null = null;
  private discovery: dgram.Socket | null = null;
  private port = DEFAULT_LAN_PORT;
  private code: string | null = null;
  private authFailures = 0;
  private stoppedReason: string | undefined;
  private transfers = new Map<string, IncomingTransfer>();
  private idleTimer: NodeJS.Timeout | null = null;
  private sendAbort: AbortController | null = null;

  constructor(private deps: LanShareDeps) {}

  // ---------------------------------------------------------------------
  // Réception
  // ---------------------------------------------------------------------

  status(): LanReceiverStatus {
    return {
      running: this.server !== null,
      port: this.port,
      code: this.code,
      deviceName: os.hostname(),
      addresses: localIPv4Addresses(),
      ...(this.stoppedReason ? { stoppedReason: this.stoppedReason } : {})
    };
  }

  async startReceiver(port: number): Promise<LanReceiverStatus> {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port invalide (1024 à 65535).');
    if (port === DISCOVERY_PORT) throw new Error(`Le port ${DISCOVERY_PORT} est réservé à la découverte.`);
    if (this.server) await this.stopReceiver();

    const destinationFolder = await this.deps.getDestinationFolder();
    if (!destinationFolder || !fs.existsSync(destinationFolder)) throw new Error('Dossier de jeux non configuré ou introuvable.');
    // Restes d'une réception interrompue (crash, arrêt brutal).
    await fs.promises.rm(path.join(destinationFolder, INCOMING_DIR), { recursive: true, force: true });

    const server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((error: unknown) => {
        const status = error instanceof HttpError ? error.status : 500;
        if (status === 500) console.error('Erreur de réception LAN:', error);
        sendJson(res, status, { error: error instanceof Error ? error.message : String(error) });
      });
    });
    // Un gros fichier peut mettre bien plus que les 5 min par défaut de
    // Node : pas de limite de durée par requête, seulement d'inactivité.
    server.requestTimeout = 0;
    server.timeout = SOCKET_IDLE_TIMEOUT_MS;

    await new Promise<void>((resolve, reject) => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        reject(new Error(error.code === 'EADDRINUSE' ? `Le port ${port} est déjà utilisé.` : error.message));
      });
      server.listen(port, '0.0.0.0', () => resolve());
    });
    server.on('error', error => console.error('Serveur de réception LAN:', error));

    this.server = server;
    this.port = port;
    this.code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    this.authFailures = 0;
    this.stoppedReason = undefined;
    this.startDiscoveryResponder();
    this.idleTimer = setInterval(() => this.cancelIdleTransfers(), 30_000);
    return this.status();
  }

  async stopReceiver(reason?: string): Promise<LanReceiverStatus> {
    const server = this.server;
    this.server = null;
    this.code = null;
    this.stoppedReason = reason;
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = null;
    this.discovery?.close();
    this.discovery = null;

    await Promise.all([...this.transfers.values()].map(t => this.cancelTransfer(t, 'Réception fermée.')));
    if (server) {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    return this.status();
  }

  private startDiscoveryResponder(): void {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('message', (message, remote) => {
      if (message.toString('utf8') !== DISCOVERY_MAGIC || !this.server) return;
      const reply = JSON.stringify({ app: 'DLSGM', protocol: PROTOCOL_VERSION, name: os.hostname(), port: this.port });
      socket.send(reply, remote.port, remote.address);
    });
    // Sans découverte, la saisie manuelle de l'adresse fonctionne toujours.
    socket.on('error', error => {
      console.warn('Découverte LAN indisponible:', error.message);
      socket.close();
      if (this.discovery === socket) this.discovery = null;
    });
    socket.bind(DISCOVERY_PORT);
    this.discovery = socket;
  }

  private checkAuth(req: http.IncomingMessage): void {
    const given = req.headers['x-dlsgm-code'];
    if (this.code && typeof given === 'string' && codesMatch(given, this.code)) return;

    this.authFailures++;
    if (this.authFailures >= MAX_AUTH_FAILURES) {
      const reason = 'Trop de codes erronés reçus : la réception a été fermée par sécurité.';
      // Différé : on répond d'abord à cette requête.
      setImmediate(() => {
        this.stopReceiver(reason)
          .then(status => this.deps.emitReceiverStatus(status))
          .catch(error => console.error('Arrêt de la réception LAN:', error));
      });
    }
    throw new HttpError(401, 'Code incorrect.');
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.checkAuth(req);
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/dlsgm/hello') {
      sendJson(res, 200, { app: 'DLSGM', protocol: PROTOCOL_VERSION, name: os.hostname() });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/dlsgm/offer') {
      sendJson(res, 200, await this.handleOffer(req));
      return;
    }
    if (parts.length >= 3 && parts[0] === 'dlsgm' && parts[1] === 'transfer') {
      const transfer = this.transfers.get(parts[2]);
      if (!transfer) throw new HttpError(404, 'Transfert inconnu ou expiré.');
      transfer.lastActivity = Date.now();

      if (req.method === 'PUT' && parts[3] === 'file') {
        sendJson(res, 200, await this.handleFile(transfer, url.searchParams.get('path'), req));
        return;
      }
      if (req.method === 'POST' && parts[3] === 'complete') {
        await this.handleComplete(transfer);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === 'DELETE' && parts.length === 3) {
        await this.cancelTransfer(transfer, "Annulé par l'envoyeur.");
        sendJson(res, 200, { ok: true });
        return;
      }
    }
    throw new HttpError(404, 'Route inconnue.');
  }

  private async handleOffer(req: http.IncomingMessage): Promise<{ transferId: string }> {
    const body = await readJsonBody(req, MAX_OFFER_BYTES) as Record<string, unknown>;
    const gameId = body?.gameId;
    if (typeof gameId !== 'string' || !GAME_ID_REGEX.test(gameId)) throw new HttpError(400, 'ID de jeu invalide.');
    if (!Array.isArray(body.files) || body.files.length === 0 || body.files.length > MAX_FILES) {
      throw new HttpError(400, 'Liste de fichiers invalide.');
    }
    if (this.transfers.size >= MAX_ACTIVE_TRANSFERS) throw new HttpError(503, 'Trop de transferts en cours, réessaie plus tard.');
    if ([...this.transfers.values()].some(t => t.gameId === gameId)) throw new HttpError(409, `${gameId} est déjà en cours de réception.`);

    const destinationFolder = await this.deps.getDestinationFolder();
    if (!destinationFolder || !fs.existsSync(destinationFolder)) throw new HttpError(503, 'Dossier de jeux du receveur introuvable.');
    if (fs.existsSync(path.join(destinationFolder, gameId))) throw new HttpError(409, `${gameId} est déjà présent sur ce PC.`);

    const files = new Map<string, IncomingFile>();
    const lowerCaseKeys = new Set<string>();
    let totalBytes = 0;
    for (const file of body.files as unknown[]) {
      const { path: key, size } = (file ?? {}) as { path?: unknown; size?: unknown };
      if (typeof key !== 'string' || typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) {
        throw new HttpError(400, 'Entrée de fichier invalide.');
      }
      const [namespace, ...rest] = key.split('/');
      const valid =
        (namespace === 'game' && safeSegments(rest.join('/'))) ||
        (namespace === 'images' && rest.length === 1 && IMAGE_FILE_REGEX.test(rest[0]));
      if (!valid) throw new HttpError(400, `Chemin refusé : ${key}`);
      // Windows ne distingue pas la casse : deux chemins "égaux" s'y écraseraient.
      if (lowerCaseKeys.has(key.toLowerCase())) throw new HttpError(400, `Fichier en double : ${key}`);
      lowerCaseKeys.add(key.toLowerCase());
      files.set(key, { size, received: false });
      totalBytes += size;
    }
    if (![...files.keys()].some(k => k.startsWith('game/'))) throw new HttpError(400, 'Aucun fichier de jeu.');

    const dirs: string[][] = [];
    for (const dir of Array.isArray(body.dirs) ? body.dirs as unknown[] : []) {
      const segments = safeSegments(dir);
      if (!segments) throw new HttpError(400, `Dossier refusé : ${String(dir)}`);
      dirs.push(segments);
    }

    const { bavail, bsize } = await fs.promises.statfs(destinationFolder);
    if (totalBytes > bavail * bsize) {
      throw new HttpError(507, `Espace disque insuffisant sur le receveur (${(totalBytes / 1e9).toFixed(1)} Go nécessaires).`);
    }

    const id = crypto.randomUUID();
    const stagingDir = path.join(destinationFolder, INCOMING_DIR, id);
    await fs.promises.mkdir(path.join(stagingDir, 'game'), { recursive: true });

    const transfer: IncomingTransfer = {
      id,
      gameId,
      peer: typeof body.senderName === 'string' && body.senderName
        ? body.senderName.slice(0, 64)
        : req.socket.remoteAddress?.replace(/^::ffff:/, '') ?? '?',
      destinationFolder,
      stagingDir,
      files,
      dirs,
      metadata: sanitizeMetadata(body.metadata),
      totalBytes,
      receivedBytes: 0,
      doneFiles: 0,
      lastActivity: Date.now(),
      uploads: new Set(),
      writing: new Set(),
      completing: false,
      report: throttle(() => this.deps.emitProgress(this.progressOf(transfer, 'active')), PROGRESS_THROTTLE_MS)
    };
    this.transfers.set(id, transfer);
    transfer.report.flush();
    return { transferId: id };
  }

  private progressOf(t: IncomingTransfer, state: LanTransferProgress['state'], error?: string): LanTransferProgress {
    return {
      key: `receive:${t.id}`,
      direction: 'receive',
      gameId: t.gameId,
      peer: t.peer,
      totalBytes: t.totalBytes,
      transferredBytes: t.receivedBytes,
      totalFiles: t.files.size,
      doneFiles: t.doneFiles,
      state,
      ...(error ? { error } : {})
    };
  }

  private async handleFile(t: IncomingTransfer, key: string | null, req: http.IncomingMessage): Promise<{ sha256: string }> {
    const entry = key ? t.files.get(key) : undefined;
    if (!key || !entry) throw new HttpError(400, `Fichier non annoncé : ${key}`);
    if (entry.received || t.writing.has(key) || t.completing) throw new HttpError(409, `Fichier déjà reçu : ${key}`);

    const target = path.join(t.stagingDir, ...key.split('/'));
    if (!isInside(t.stagingDir, target)) throw new HttpError(400, `Chemin refusé : ${key}`);

    t.writing.add(key);
    t.uploads.add(req);
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    try {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      const counter = new Transform({
        transform: (chunk: Buffer, _encoding, callback) => {
          bytes += chunk.length;
          if (bytes > entry.size) {
            callback(new HttpError(400, `Fichier plus gros qu'annoncé : ${key}`));
            return;
          }
          hash.update(chunk);
          t.receivedBytes += chunk.length;
          t.lastActivity = Date.now();
          t.report.call();
          callback(null, chunk);
        }
      });
      // 'wx' : jamais d'écriture à travers un fichier (ou lien) déjà présent.
      await pipeline(req, counter, fs.createWriteStream(target, { flags: 'wx' }));
      if (bytes !== entry.size) throw new HttpError(400, `Fichier incomplet : ${key}`);
      entry.received = true;
      t.doneFiles++;
      t.report.call();
      return { sha256: hash.digest('hex') };
    } catch (error) {
      t.receivedBytes -= bytes;
      await fs.promises.rm(target, { force: true }).catch(() => undefined);
      // Upload coupé (annulation, envoyeur fermé) : pas une erreur serveur.
      if ((error as NodeJS.ErrnoException).code === 'ERR_STREAM_PREMATURE_CLOSE') throw new HttpError(400, `Envoi interrompu : ${key}`);
      throw error;
    } finally {
      t.writing.delete(key);
      t.uploads.delete(req);
    }
  }

  private async handleComplete(t: IncomingTransfer): Promise<void> {
    if (t.completing) throw new HttpError(409, 'Finalisation déjà en cours.');
    const missing = [...t.files.entries()].find(([, f]) => !f.received);
    if (missing || t.writing.size > 0) throw new HttpError(409, `Fichier manquant : ${missing?.[0] ?? '(en cours)'}`);
    t.completing = true;

    try {
      const finalDir = path.join(t.destinationFolder, t.gameId);
      if (fs.existsSync(finalDir)) throw new HttpError(409, `${t.gameId} est apparu sur ce PC entre-temps.`);

      const stagedGame = path.join(t.stagingDir, 'game');
      for (const segments of t.dirs) await fs.promises.mkdir(path.join(stagedGame, ...segments), { recursive: true });

      // Fiche créée avant que le dossier n'apparaisse : un scan qui le
      // verrait ne relancerait pas de fetch DLsite par-dessus. Une fiche déjà
      // présente sur ce PC (jeu supprimé puis renvoyé) est gardée telle
      // quelle, avec ses propres images.
      if (t.metadata && await this.deps.insertCacheEntry(t.gameId, t.metadata)) {
        const stagedImages = path.join(t.stagingDir, 'images');
        if (fs.existsSync(stagedImages)) {
          await fs.promises.cp(stagedImages, path.join(this.deps.getImgCacheDir(), t.gameId), { recursive: true, force: true });
        }
      }

      await renameWithRetry(stagedGame, finalDir);
      this.transfers.delete(t.id);
      await fs.promises.rm(t.stagingDir, { recursive: true, force: true }).catch(() => undefined);
      this.deps.emitProgress(this.progressOf(t, 'done'));
    } catch (error) {
      t.completing = false;
      throw error;
    }
  }

  private async cancelTransfer(t: IncomingTransfer, reason: string): Promise<void> {
    if (!this.transfers.delete(t.id)) return;
    for (const upload of t.uploads) upload.destroy();
    // Laisse les flux coupés se refermer avant de supprimer leurs fichiers.
    await new Promise(resolve => setTimeout(resolve, 100));
    await fs.promises.rm(t.stagingDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      .catch(error => console.error(`Nettoyage de ${t.stagingDir} impossible:`, error));
    this.deps.emitProgress(this.progressOf(t, 'cancelled', reason));
  }

  private cancelIdleTransfers(): void {
    const now = Date.now();
    for (const t of this.transfers.values()) {
      if (!t.completing && t.writing.size === 0 && now - t.lastActivity > TRANSFER_IDLE_TIMEOUT_MS) {
        this.cancelTransfer(t, "Plus de nouvelles de l'envoyeur.").catch(() => undefined);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Découverte
  // ---------------------------------------------------------------------

  discoverPeers(): Promise<LanPeer[]> {
    return new Promise((resolve) => {
      const own = new Set(localIPv4Addresses(true));
      const peers = new Map<string, LanPeer>();
      const socket = dgram.createSocket('udp4');
      const finish = () => {
        try {
          socket.close();
        } catch {
          // déjà fermée
        }
        resolve([...peers.values()]);
      };

      socket.on('message', (message, remote) => {
        try {
          const reply = JSON.parse(message.toString('utf8')) as Record<string, unknown>;
          if (reply.app !== 'DLSGM' || typeof reply.port !== 'number') return;
          // Ce PC lui-même (sa propre réception ouverte) n'est pas une cible.
          if (own.has(remote.address)) return;
          const name = typeof reply.name === 'string' ? reply.name.slice(0, 64) : remote.address;
          peers.set(`${remote.address}:${reply.port}`, { name, host: remote.address, port: reply.port });
        } catch {
          // réponse étrangère : ignorée
        }
      });
      socket.on('error', error => {
        console.warn('Découverte LAN:', error.message);
        finish();
      });
      socket.bind(0, () => {
        socket.setBroadcast(true);
        for (const address of broadcastAddresses()) {
          socket.send(DISCOVERY_MAGIC, DISCOVERY_PORT, address, error => {
            if (error) console.warn(`Broadcast vers ${address}:`, error.message);
          });
        }
        setTimeout(finish, DISCOVERY_WINDOW_MS);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Envoi
  // ---------------------------------------------------------------------

  cancelSend(): void {
    this.sendAbort?.abort();
  }

  async sendGames(request: LanSendRequest, getGameDir: (gameId: string) => Promise<string>): Promise<LanSendResult> {
    const { host, port, code, gameIds } = request ?? {};
    if (typeof host !== 'string' || !/^[a-zA-Z0-9.\-]{1,253}$/.test(host)) throw new Error('Adresse invalide.');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port invalide.');
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new Error('Le code doit comporter 6 chiffres.');
    if (!Array.isArray(gameIds) || gameIds.length === 0 || gameIds.some(id => typeof id !== 'string' || !GAME_ID_REGEX.test(id))) {
      throw new Error('Sélection de jeux invalide.');
    }
    if (this.sendAbort) throw new Error('Un envoi est déjà en cours.');

    const abort = new AbortController();
    this.sendAbort = abort;
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const client = new LanClient(host, port, code, agent, abort.signal);
    const result: LanSendResult = { sent: [], failed: [], cancelled: false };

    try {
      const hello = await client.json('GET', '/dlsgm/hello');
      if (hello.protocol !== PROTOCOL_VERSION) {
        throw new Error("Version de DLSGM différente sur l'autre PC : mets les deux à jour.");
      }
      const peer = typeof hello.name === 'string' ? hello.name : host;

      for (const gameId of gameIds) {
        if (abort.signal.aborted) break;
        try {
          await this.sendGame(client, gameId, await getGameDir(gameId), peer);
          result.sent.push(gameId);
        } catch (error) {
          if (abort.signal.aborted) break;
          result.failed.push({ gameId, error: (error as Error).message });
        }
      }
      result.cancelled = abort.signal.aborted;
      return result;
    } finally {
      this.sendAbort = null;
      agent.destroy();
    }
  }

  private async sendGame(client: LanClient, gameId: string, gameDir: string, peer: string): Promise<void> {
    const progress: LanTransferProgress = {
      key: `send:${gameId}:${Date.now()}`,
      direction: 'send',
      gameId,
      peer,
      totalBytes: 0,
      transferredBytes: 0,
      totalFiles: 0,
      doneFiles: 0,
      state: 'active'
    };
    const report = throttle(() => this.deps.emitProgress({ ...progress }), PROGRESS_THROTTLE_MS);
    let transferId: string | null = null;

    try {
      if (!fs.existsSync(gameDir)) throw new Error('Dossier du jeu introuvable.');
      const { files, dirs } = await collectGameFiles(gameDir);
      const imgDir = path.join(this.deps.getImgCacheDir(), gameId);
      if (fs.existsSync(imgDir)) {
        for (const name of await fs.promises.readdir(imgDir)) {
          if (!IMAGE_FILE_REGEX.test(name)) continue;
          const abs = path.join(imgDir, name);
          const stat = await fs.promises.stat(abs);
          if (stat.isFile()) files.push({ key: `images/${name}`, abs, size: stat.size });
        }
      }
      progress.totalFiles = files.length;
      progress.totalBytes = files.reduce((sum, f) => sum + f.size, 0);
      report.flush();

      const offer = await client.json('POST', '/dlsgm/offer', {
        gameId,
        senderName: os.hostname(),
        files: files.map(f => ({ path: f.key, size: f.size })),
        dirs,
        metadata: shareableMetadata(await this.deps.getCacheEntry(gameId))
      });
      if (typeof offer.transferId !== 'string') throw new Error('Réponse inattendue du receveur.');
      transferId = offer.transferId;

      for (const file of files) {
        const hash = crypto.createHash('sha256');
        let sent = 0;
        const counter = new Transform({
          transform: (chunk: Buffer, _encoding, callback) => {
            sent += chunk.length;
            hash.update(chunk);
            progress.transferredBytes += chunk.length;
            report.call();
            callback(null, chunk);
          }
        });
        const source = fs.createReadStream(file.abs);
        source.on('error', error => counter.destroy(error));
        const body = source.pipe(counter);
        try {
          const reply = await client.json(
            'PUT',
            `/dlsgm/transfer/${transferId}/file?path=${encodeURIComponent(file.key)}`,
            body,
            file.size
          );
          if (sent !== file.size) throw new Error(`${file.key} a changé pendant l'envoi.`);
          if (reply.sha256 !== hash.digest('hex')) throw new Error(`Somme de contrôle différente pour ${file.key}.`);
        } catch (error) {
          progress.transferredBytes -= sent;
          throw error;
        } finally {
          // Sinon le fichier du jeu reste ouvert (et verrouillé sous Windows)
          // après une annulation ou une erreur en plein envoi.
          source.destroy();
        }
        progress.doneFiles++;
        report.call();
      }

      await client.json('POST', `/dlsgm/transfer/${transferId}/complete`, {});
      transferId = null;
      progress.state = 'done';
      report.flush();
    } catch (error) {
      const cancelled = client.signal.aborted;
      progress.state = cancelled ? 'cancelled' : 'failed';
      if (!cancelled) progress.error = (error as Error).message;
      report.flush();
      // Libère au plus vite le dossier temporaire du receveur.
      if (transferId) await client.abandon(`/dlsgm/transfer/${transferId}`);
      throw error;
    }
  }
}

/**
 * Renommage du dossier reçu vers la bibliothèque. Sous Windows, un antivirus
 * qui analyse les fichiers fraîchement écrits peut le refuser (EPERM/EBUSY)
 * quelques instants.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.promises.rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 10 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

/**
 * Fichiers ordinaires et dossiers d'un jeu, chemins relatifs en '/'. Les
 * liens symboliques sont ignorés : ils pointeraient ailleurs sur l'autre PC.
 */
async function collectGameFiles(gameDir: string): Promise<{ files: FileToSend[]; dirs: string[] }> {
  const files: FileToSend[] = [];
  const dirs: string[] = [];
  const walk = async (dir: string, rel: string[]): Promise<void> => {
    for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const entryRel = [...rel, entry.name];
      if (entry.isDirectory()) {
        dirs.push(entryRel.join('/'));
        await walk(abs, entryRel);
      } else if (entry.isFile()) {
        const { size } = await fs.promises.stat(abs);
        files.push({ key: `game/${entryRel.join('/')}`, abs, size });
      }
    }
  };
  await walk(gameDir, []);
  if (files.length === 0) throw new Error('Le dossier du jeu est vide.');
  return { files, dirs };
}

/** Client HTTP minimal vers le receveur (connexion gardée ouverte entre fichiers). */
class LanClient {
  constructor(
    private host: string,
    private port: number,
    private code: string,
    private agent: http.Agent,
    public signal: AbortSignal
  ) {}

  json(method: string, pathname: string, body?: unknown, contentLength?: number): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const isStream = body !== undefined && typeof (body as Readable).pipe === 'function';
      const payload = body !== undefined && !isStream ? Buffer.from(JSON.stringify(body)) : null;
      const req = http.request({
        host: this.host,
        port: this.port,
        method,
        path: pathname,
        agent: this.agent,
        signal: this.signal,
        timeout: SOCKET_IDLE_TIMEOUT_MS,
        headers: {
          'x-dlsgm-code': this.code,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
          ...(isStream ? { 'Content-Type': 'application/octet-stream', 'Content-Length': contentLength ?? 0 } : {})
        }
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          // Réponse anticipée (erreur) pendant l'upload : inutile de continuer à lire le fichier.
          if (isStream) (body as Readable).destroy();
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            // corps non JSON : traité via le statut
          }
          if (res.statusCode === 200) resolve(data);
          else reject(new Error(typeof data.error === 'string' ? data.error : `Erreur HTTP ${res.statusCode}`));
        });
      });
      req.on('timeout', () => req.destroy(new Error("L'autre PC ne répond plus.")));
      req.on('error', (error: NodeJS.ErrnoException) => {
        if (this.signal.aborted) reject(new Error('Envoi annulé.'));
        else if (error.code === 'ECONNREFUSED') reject(new Error(`Connexion refusée par ${this.host}:${this.port} (réception fermée ?).`));
        else if (error.code === 'EHOSTUNREACH' || error.code === 'ETIMEDOUT') reject(new Error(`${this.host} injoignable.`));
        else reject(error);
      });
      if (isStream) {
        const stream = body as Readable;
        stream.on('error', error => req.destroy(error));
        stream.pipe(req);
      } else {
        req.end(payload ?? undefined);
      }
    });
  }

  /** Annule un transfert côté receveur, même après un abandon local. */
  async abandon(pathname: string): Promise<void> {
    await new Promise<void>((resolve) => {
      const req = http.request({
        host: this.host,
        port: this.port,
        method: 'DELETE',
        path: pathname,
        timeout: 5000,
        headers: { 'x-dlsgm-code': this.code }
      }, (res) => {
        res.resume();
        res.on('end', () => resolve());
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => resolve());
      req.end();
    });
  }
}
