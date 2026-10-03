import { utilityProcess, type UtilityProcess } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { DictionaryStatus, DictToken } from '../shared/ipc-types';
import { tm } from './i18n';

/**
 * Installation et utilisation du dictionnaire hors ligne (voir
 * dictionary.ts) : trois archives jmdict-simplified épinglées (version et
 * SHA-256, comme BepInEx), téléchargées une fois sur demande dans
 * `userData/dict/`, réduites en `index.json` (~30 Mo) par le processus
 * utilitaire, qui sert ensuite les recherches.
 */

export const DICT_VERSION = '3.6.2+20260928191014';
const BASE = 'https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20260928191014';

export const DICT_FILES = {
  eng: { url: `${BASE}/jmdict-eng-3.6.2%2B20260928191014.json.zip`, sha256: '39d57329e4e17cba037072f3189ccd23b2a6bd5d98b563fbe3feef040f1dcdb3', size: 11526073 },
  fre: { url: `${BASE}/jmdict-fre-3.6.2%2B20260928191014.json.zip`, sha256: '397b58440b734a36162271af2c163406a22ff6763a3610c5e8a3f8a050e4f78b', size: 650716 },
  kanji: { url: `${BASE}/kanjidic2-all-3.6.2%2B20260928191014.json.zip`, sha256: '95b216935eeee1bb17bcb1a6396f14c9ca92a15971458d59d0f731dc1a89860d', size: 1552881 }
} as const;

export type DictFetch = (url: string) => Promise<{ ok: boolean; status: number; body: ReadableStream<Uint8Array> | null }>;

export const sha256 = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

/** Télécharge un fichier en suivant la progression, et vérifie son SHA-256. */
export async function downloadVerified(fetch: DictFetch, url: string, expected: string, onBytes: (n: number) => void): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(tm('Téléchargement impossible (HTTP {status}).', { status: response.status }));
  const chunks: Buffer[] = [];
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    onBytes(value.byteLength);
  }
  const buffer = Buffer.concat(chunks);
  const actual = sha256(buffer);
  if (actual !== expected) throw new Error(tm('Somme de contrôle invalide (attendu {expected}, obtenu {actual}).', { expected, actual }));
  return buffer;
}

export class DictionaryStore {
  private worker: UtilityProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private progress: DictionaryStatus['progress'] = null;
  private error: string | null = null;
  private installing: Promise<void> | null = null;

  constructor(
    private readonly dir: string,
    private readonly fetch: DictFetch,
    private readonly onStatus: (status: DictionaryStatus) => void
  ) {}

  private get indexPath(): string {
    return path.join(this.dir, 'index.json');
  }

  private get metaPath(): string {
    return path.join(this.dir, 'version.txt');
  }

  installedVersion(): string | null {
    try {
      return fs.existsSync(this.indexPath) ? fs.readFileSync(this.metaPath, 'utf8').trim() || null : null;
    } catch {
      return null;
    }
  }

  status(): DictionaryStatus {
    const version = this.installedVersion();
    return { installed: version !== null, version, progress: this.progress, error: this.error };
  }

  private changed(): void {
    this.onStatus(this.status());
  }

  private call<T>(message: Record<string, unknown>): Promise<T> {
    if (!this.worker) {
      const worker = utilityProcess.fork(path.join(__dirname, 'dictionary-worker.js'), [], { serviceName: 'DLSGM dictionnaire' });
      worker.on('message', ({ id, result, error }: { id: number; result?: unknown; error?: string }) => {
        const job = this.pending.get(id);
        if (!job) return;
        this.pending.delete(id);
        if (error) job.reject(new Error(error));
        else job.resolve(result);
      });
      worker.on('exit', code => {
        for (const job of this.pending.values()) job.reject(new Error(tm("Le dictionnaire s'est arrêté (code {code}).", { code: String(code) })));
        this.pending.clear();
        if (this.worker === worker) this.worker = null;
      });
      this.worker = worker;
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker!.postMessage({ ...message, id });
    });
  }

  /** Télécharge (≈14 Mo) puis prépare l'index ; une seule installation à la fois. */
  install(): Promise<void> {
    if (this.installing) return this.installing;
    if (this.installedVersion() === DICT_VERSION) return Promise.resolve();
    this.installing = (async () => {
      this.error = null;
      const total = Object.values(DICT_FILES).reduce((sum, f) => sum + f.size, 0);
      let received = 0;
      this.progress = { step: 'download', received, total };
      this.changed();
      try {
        const downloads = path.join(this.dir, 'downloads');
        fs.mkdirSync(downloads, { recursive: true });
        const paths: Record<string, string> = {};
        for (const [key, file] of Object.entries(DICT_FILES)) {
          const target = path.join(downloads, `${key}.zip`);
          paths[key] = target;
          if (fs.existsSync(target) && sha256(fs.readFileSync(target)) === file.sha256) {
            received += file.size;
            continue;
          }
          let lastNotify = 0;
          const buffer = await downloadVerified(this.fetch, file.url, file.sha256, n => {
            received += n;
            if (Date.now() - lastNotify > 250) {
              lastNotify = Date.now();
              this.progress = { step: 'download', received, total };
              this.changed();
            }
          });
          fs.writeFileSync(target, buffer);
        }
        this.progress = { step: 'build', received: total, total };
        this.changed();
        await this.call({ type: 'build', eng: paths.eng, fre: paths.fre, kanji: paths.kanji, version: DICT_VERSION, out: this.indexPath });
        fs.writeFileSync(this.metaPath, DICT_VERSION);
        // Les archives ne servent plus : l'index suffit (un échec ici n'annule pas l'installation).
        try {
          fs.rmSync(downloads, { recursive: true, force: true });
        } catch (error) {
          console.error('Archives du dictionnaire non supprimées :', error);
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        this.progress = null;
        this.installing = null;
        this.changed();
      }
    })();
    return this.installing;
  }

  /** Mots et sens de chaque texte (un tableau de mots par texte). */
  lookup(texts: string[], lang: 'fr' | 'en'): Promise<DictToken[][]> {
    if (!this.installedVersion()) return Promise.reject(new Error(tm('Dictionnaire non installé (Paramètres › Outils en jeu › Traduction à l’écran).')));
    return this.call<DictToken[][]>({ type: 'lookup', index: this.indexPath, texts, lang });
  }

  /** Préchargement (l'index met ~1 s à se charger) : une recherche vide. */
  warmUp(): void {
    if (this.installedVersion()) this.lookup([], 'fr').catch(() => undefined);
  }

  /** Libère la mémoire (≈200 Mo) quand plus aucune partie n'en a besoin. */
  dispose(): void {
    this.worker?.kill();
    this.worker = null;
  }

  remove(): void {
    this.dispose();
    fs.rmSync(this.dir, { recursive: true, force: true });
    this.changed();
  }
}
