import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { PiaStatus } from '../shared/ipc-types';

/**
 * Pilotage de Private Internet Access (PIA) par sa ligne de commande
 * `piactl`, pour refaire à travers un serveur japonais les fetchs DLsite qui
 * échouent — une œuvre à restriction régionale ne répond pas hors du Japon
 * (endpoint ajax vide), ce qui ressemble à un ID inexistant.
 *
 * `piactl` agit sur le VPN de toute la machine, pas seulement DLSGM : la
 * session est courte (le temps des fetchs) et l'état d'avant (région,
 * connecté ou non) est toujours restauré à la fin, y compris en cas d'erreur
 * ou si l'application quitte pendant la session.
 *
 * Commandes utilisées (piactl --help, PIA 3.x) : get connectionstate|region|
 * regions|pubip, set region <id>, connect, disconnect. `connect` exige que
 * l'interface de PIA tourne, ou le mode `piactl background enable`.
 */

const PIACTL_TIMEOUT_MS = 20000;
const CONNECT_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 1000;
// Routes et DNS du tunnel à peine monté : petite marge avant les requêtes.
const SETTLE_MS = 1500;

export type Runner = (args: string[]) => Promise<string>;

export function findPiactl(): string | null {
  if (process.platform !== 'win32') return null;
  const programFiles = [process.env.ProgramW6432, process.env.ProgramFiles, 'C:\\Program Files'].filter(Boolean) as string[];
  for (const dir of programFiles) {
    const candidate = path.join(dir, 'Private Internet Access', 'piactl.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function execRunner(piactl: string): Runner {
  return args =>
    new Promise((resolve, reject) => {
      execFile(piactl, args, { windowsHide: true, timeout: PIACTL_TIMEOUT_MS }, (error, stdout, stderr) => {
        if (error) reject(new Error(`piactl ${args.join(' ')} : ${String(stderr).trim() || error.message}`));
        else resolve(String(stdout).trim());
      });
    });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class Pia {
  private session: { depth: number; previousRegion: string; wasConnected: boolean; region: string } | null = null;
  private opening: Promise<void> | null = null;

  /** `runner` injectable pour les tests ; par défaut le vrai piactl (null s'il est introuvable). */
  constructor(private runner: Runner | null = (() => {
    const piactl = findPiactl();
    return piactl ? execRunner(piactl) : null;
  })(), private delays = { poll: POLL_INTERVAL_MS, settle: SETTLE_MS, connectTimeout: CONNECT_TIMEOUT_MS }) {}

  private run(args: string[]): Promise<string> {
    if (!this.runner) throw new Error("Private Internet Access (piactl) est introuvable sur ce PC.");
    return this.runner(args);
  }

  async status(): Promise<PiaStatus> {
    if (!this.runner) return { available: false, connectionState: null, region: null, regions: [] };
    try {
      const [connectionState, region, regions] = await Promise.all([
        this.run(['get', 'connectionstate']),
        this.run(['get', 'region']),
        this.run(['get', 'regions'])
      ]);
      return { available: true, connectionState, region, regions: regions.split(/\s+/).filter(Boolean) };
    } catch (error) {
      return { available: true, connectionState: null, region: null, regions: [], error: (error as Error).message };
    }
  }

  private async waitForState(wanted: string): Promise<void> {
    const deadline = Date.now() + this.delays.connectTimeout;
    for (;;) {
      const state = await this.run(['get', 'connectionstate']);
      if (state === wanted) return;
      if (Date.now() > deadline) throw new Error(`PIA n'est pas passé à l'état ${wanted} (état actuel : ${state}).`);
      await sleep(this.delays.poll);
    }
  }

  /**
   * Ouvre (ou rejoint) une session connectée à `region`. Chaque `begin`
   * réussi doit être suivi d'un `end`.
   */
  async begin(region: string): Promise<void> {
    if (!/^[a-z0-9-]+$/.test(region)) throw new Error(`Région PIA invalide : ${region}`);
    if (this.opening) await this.opening.catch(() => undefined);
    if (this.session) {
      if (this.session.region !== region) throw new Error(`Une session PIA est déjà ouverte sur ${this.session.region}.`);
      this.session.depth++;
      return;
    }
    this.opening = (async () => {
      const previousRegion = await this.run(['get', 'region']);
      const wasConnected = (await this.run(['get', 'connectionstate'])) === 'Connected';
      this.session = { depth: 1, previousRegion, wasConnected, region };
      try {
        if (previousRegion !== region) await this.run(['set', 'region', region]);
        // `connect` connecte, ou reconnecte pour appliquer la nouvelle région.
        if (!wasConnected || previousRegion !== region) await this.run(['connect']);
        await this.waitForState('Connected');
        await sleep(this.delays.settle);
      } catch (error) {
        await this.restore().catch(() => undefined);
        throw new Error(
          `Connexion PIA impossible : ${(error as Error).message} — l'application PIA doit être ouverte (ou "piactl background enable").`
        );
      }
    })();
    try {
      await this.opening;
    } finally {
      this.opening = null;
    }
  }

  async end(): Promise<void> {
    if (!this.session) return;
    if (--this.session.depth > 0) return;
    await this.restore();
  }

  /** Remet PIA dans l'état d'avant la session (région, connecté ou non). */
  async restore(): Promise<void> {
    const session = this.session;
    this.session = null;
    if (!session) return;
    if (session.previousRegion !== session.region) await this.run(['set', 'region', session.previousRegion]);
    if (!session.wasConnected) await this.run(['disconnect']);
    else if (session.previousRegion !== session.region) await this.run(['connect']);
  }

  get active(): boolean {
    return this.session !== null;
  }
}
