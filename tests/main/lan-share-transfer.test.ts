import fs from 'fs';
import http from 'http';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '' } }));

import { LanShare, type LanShareDeps } from '../../src/main/lan-share';
import type { GameMetadata, LanTransferProgress } from '../../src/shared/ipc-types';
import { listTree, makeTempDir, removeTempDir, writeTree } from '../helpers';

// Bugs observés en test réel Windows <-> macOS : noms NFD, fichiers du
// Finder, compteur négatif, chemins du receveur dans les erreurs.

const NFC = 'ゲーム';
const NFD = NFC.normalize('NFD');

let root: string;
let receiverDir: string;
let senderDir: string;
let progress: LanTransferProgress[];
let receiver: LanShare;
let port: number;
let code: string;
let insertCacheEntry: LanShareDeps['insertCacheEntry'];

function deps(destination: string, imgDir: string): LanShareDeps {
  return {
    getDestinationFolder: async () => destination,
    getImgCacheDir: () => imgDir,
    getCacheEntry: async () => undefined,
    insertCacheEntry: (id, entry) => insertCacheEntry(id, entry),
    emitProgress: p => progress.push(p),
    emitReceiverStatus: () => undefined
  };
}

function request(method: string, pathname: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1', port, method, path: pathname,
      headers: { 'x-dlsgm-code': code, ...(payload ? { 'Content-Length': payload.length } : {}) }
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject);
    req.end(payload ?? undefined);
  });
}

const putFile = (transferId: string, key: string, content: string | Buffer) =>
  request('PUT', `/dlsgm/transfer/${transferId}/file?path=${encodeURIComponent(key)}`, Buffer.from(content));

beforeEach(async () => {
  root = makeTempDir('dlsgm-lan-');
  receiverDir = path.join(root, 'receiver');
  senderDir = path.join(root, 'sender');
  fs.mkdirSync(receiverDir);
  fs.mkdirSync(senderDir);
  progress = [];
  insertCacheEntry = async () => true;
  receiver = new LanShare(deps(receiverDir, path.join(root, 'img-receiver')));
  // Port pseudo-aléatoire : plusieurs fichiers de tests tournent en parallèle.
  for (let attempt = 0; ; attempt++) {
    port = 20000 + Math.floor(Math.random() * 20000);
    try {
      code = (await receiver.startReceiver(port)).code as string;
      break;
    } catch (error) {
      if (attempt > 5) throw error;
    }
  }
});

afterEach(async () => {
  await receiver.stopReceiver();
  removeTempDir(root);
});

describe('LanShare — envoi réel vers un receveur local', () => {
  it('envoie les noms en NFC et sans les fichiers du Finder', async () => {
    const gameDir = path.join(senderDir, 'RJ01000001');
    // Noms tels qu'un Mac peut les avoir : NFD, .DS_Store, AppleDouble.
    writeTree(gameDir, {
      [`${NFD}.exe`]: 'exe',
      [`${NFD}/save.dat`]: 'save',
      '.DS_Store': 'finder',
      [`._${NFD}.exe`]: 'appledouble',
      'www/._img.png': 'appledouble'
    });
    fs.mkdirSync(path.join(gameDir, 'vide'));

    const sender = new LanShare(deps(senderDir, path.join(root, 'img-sender')));
    const result = await sender.sendGames({ host: '127.0.0.1', port, code, gameIds: ['RJ01000001'] }, async () => gameDir);

    expect(result).toEqual({ sent: ['RJ01000001'], failed: [], cancelled: false });
    const received = path.join(receiverDir, 'RJ01000001');
    expect(listTree(received)).toEqual([`${NFC}.exe`, `${NFC}/save.dat`].sort());
    // Octets du nom sur disque : forme NFC, pas seulement égale à l'affichage.
    expect(fs.readdirSync(received).map(n => Buffer.from(n).toString('hex')).sort())
      .toEqual([`${NFC}.exe`, NFC, 'vide', 'www'].map(n => Buffer.from(n).toString('hex')).sort());
  });
});

describe('LanShare — réception', () => {
  it('refuse deux chemins qui ne diffèrent que par la forme Unicode', async () => {
    const offer = await request('POST', '/dlsgm/offer', {
      gameId: 'RJ01000002',
      files: [{ path: `game/${NFC}.txt`, size: 1 }, { path: `game/${NFD}.txt`, size: 1 }]
    });
    expect(offer.status).toBe(400);
    expect(offer.body.error).toContain('Fichier en double');
  });

  it("range sous le nom NFC un fichier annoncé et envoyé en NFD (DLSGM plus ancien)", async () => {
    const offer = await request('POST', '/dlsgm/offer', {
      gameId: 'RJ01000003',
      files: [{ path: `game/${NFD}.txt`, size: 2 }],
      dirs: [NFD]
    });
    expect(offer.status).toBe(200);
    const id = offer.body.transferId as string;
    expect((await putFile(id, `game/${NFD}.txt`, 'ok')).status).toBe(200);
    expect((await request('POST', `/dlsgm/transfer/${id}/complete`, {})).status).toBe(200);
    const received = path.join(receiverDir, 'RJ01000003');
    expect(fs.readdirSync(received).sort()).toEqual([NFC, `${NFC}.txt`].sort());
  });

  it("retire les fichiers du Finder envoyés par un DLSGM plus ancien", async () => {
    const offer = await request('POST', '/dlsgm/offer', {
      gameId: 'RJ01000004',
      files: [{ path: 'game/Game.exe', size: 3 }, { path: 'game/.DS_Store', size: 1 }, { path: 'game/data/._Game.exe', size: 1 }]
    });
    const id = offer.body.transferId as string;
    await putFile(id, 'game/Game.exe', 'exe');
    await putFile(id, 'game/.DS_Store', 'x');
    await putFile(id, 'game/data/._Game.exe', 'x');
    expect((await request('POST', `/dlsgm/transfer/${id}/complete`, {})).status).toBe(200);
    expect(listTree(path.join(receiverDir, 'RJ01000004'))).toEqual(['Game.exe']);
  });

  it("ne rend jamais le compteur négatif quand un fichier est plus gros qu'annoncé", async () => {
    const offer = await request('POST', '/dlsgm/offer', { gameId: 'RJ01000005', files: [{ path: 'game/a.bin', size: 5 }] });
    const id = offer.body.transferId as string;
    const put = await putFile(id, 'game/a.bin', '0123456789');
    expect(put.status).toBe(400);
    expect(put.body.error).toContain("plus gros qu'annoncé");
    // L'envoyeur abandonne alors le transfert : c'est cet état que l'historique affiche.
    expect((await request('DELETE', `/dlsgm/transfer/${id}`)).status).toBe(200);
    expect(progress.at(-1)?.state).toBe('cancelled');
    for (const p of progress) expect(p.transferredBytes).toBeGreaterThanOrEqual(0);
  });

  it("n'envoie pas à l'envoyeur le détail d'une erreur interne (chemins du receveur)", async () => {
    insertCacheEntry = async () => {
      throw new Error(`EACCES: permission denied, open '${path.join(root, 'secret-user', 'cache.db')}'`);
    };
    const offer = await request('POST', '/dlsgm/offer', {
      gameId: 'RJ01000006',
      files: [{ path: 'game/a.txt', size: 1 }],
      metadata: { work_name: 'Jeu' } as Partial<GameMetadata>
    });
    const id = offer.body.transferId as string;
    await putFile(id, 'game/a.txt', 'a');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const complete = await request('POST', `/dlsgm/transfer/${id}/complete`, {});
    errorSpy.mockRestore();
    expect(complete.status).toBe(500);
    expect(complete.body.error).toBe('Erreur interne du receveur.');
    expect(JSON.stringify(complete.body)).not.toContain('secret-user');
  });
});
