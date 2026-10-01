import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import { readPeArch } from './game-tools';
import type { TextractorThread, TextractorView } from '../shared/ipc-types';

/**
 * Lancement avec Textractor (Windows) : extraction du texte des visual
 * novels, RPG Maker et autres moteurs que XUnity ne couvre pas. DLSGM pilote
 * `TextractorCLI.exe` (fourni avec Textractor, x86 et x64) : il s'attache
 * aux processus du jeu (`attach -P<pid>`) et écrit chaque texte capté sur sa
 * sortie, en UTF-16 : `[handle:pid:adresse:ctx:ctx2:nom:hookcode] texte`.
 * Son entrée est en UTF-16 aussi.
 *
 * Les processus du jeu sont ceux dont l'exécutable est dans son dossier
 * (cherchés pendant la première minute : un lanceur peut démarrer le vrai
 * jeu après coup). Chacun reçoit le TextractorCLI de son architecture.
 *
 * Attention : TextractorCLI quitte sur toute commande qu'il ne comprend
 * pas — on ne lui envoie que `attach -P<pid>`.
 */

/** TextractorCLI de l'architecture voulue dans le dossier de Textractor (sous-dossiers x86 / x64, ou à la racine). */
export function findTextractorCli(dir: string, arch: 'x86' | 'x64'): string | null {
  if (!dir) return null;
  const candidates = [path.join(dir, arch, 'TextractorCLI.exe'), path.join(dir, 'TextractorCLI.exe')];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    // Exécutable à la racine : seulement s'il a la bonne architecture.
    if (path.dirname(candidate) === dir && readPeArch(candidate) !== arch) continue;
    return candidate;
  }
  return null;
}

/** `attach -P<pid>` encodé comme TextractorCLI le lit (UTF-16LE). */
export function attachCommand(pid: number): Buffer {
  return Buffer.from(`attach -P${Math.trunc(pid)}\n`, 'utf16le');
}

export interface TextractorLine {
  handle: number;
  pid: number;
  /** Identité du fil de texte (processus, adresse, contextes). */
  key: string;
  name: string;
  hookcode: string;
  text: string;
}

const LINE = /^\[([0-9A-Fa-f]+):([0-9A-Fa-f]+):([0-9A-Fa-f]+):([0-9A-Fa-f]+):([0-9A-Fa-f]+):([^:\]]*):([^\]]*)\] ?(.*)$/s;

/** Ligne de TextractorCLI → fil et texte (null : pas une ligne de texte). */
export function parseTextractorLine(line: string): TextractorLine | null {
  const m = LINE.exec(line);
  if (!m) return null;
  return {
    handle: parseInt(m[1], 16),
    pid: parseInt(m[2], 16),
    key: `${m[2]}:${m[3]}:${m[4]}:${m[5]}`.toUpperCase(),
    name: m[6],
    hookcode: m[7],
    text: m[8]
  };
}

/** Fils internes de Textractor (messages, presse-papiers) : pas du texte de jeu. */
export function isInternalThread(line: TextractorLine): boolean {
  return line.handle <= 1 || line.name === 'Console' || line.name === 'Clipboard';
}

/**
 * Décodeur de la sortie : UTF-16LE (mode `_O_U16TEXT` de TextractorCLI)
 * reconnu à son BOM ou à ses octets nuls, sinon UTF-8. Garde les octets
 * d'un caractère coupé entre deux morceaux.
 */
export class CliOutputDecoder {
  private decoder: TextDecoder | null = null;

  push(chunk: Buffer): string {
    if (!this.decoder) {
      const utf16 = (chunk[0] === 0xff && chunk[1] === 0xfe) || (chunk.length >= 4 && chunk[1] === 0 && chunk[3] === 0);
      this.decoder = new TextDecoder(utf16 ? 'utf-16le' : 'utf-8');
    }
    return this.decoder.decode(chunk, { stream: true }).replace(/^﻿/, '');
  }
}

/**
 * Regroupe la sortie en entrées : un texte peut contenir des retours à la
 * ligne, donc une ligne qui ne commence pas par `[…]` complète l'entrée
 * précédente. Une entrée est rendue à l'arrivée de la suivante, ou après un
 * court silence (`flush`).
 */
export class TextractorLineReader {
  private buffer = '';
  private pending: TextractorLine | null = null;

  constructor(private readonly onLine: (line: TextractorLine) => void) {}

  push(text: string): void {
    this.buffer += text;
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const raw = this.buffer.slice(0, newline).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newline + 1);
      const parsed = parseTextractorLine(raw);
      if (parsed) {
        this.flush();
        this.pending = parsed;
      } else if (this.pending) {
        this.pending.text += `\n${raw}`;
      }
    }
  }

  flush(): void {
    if (this.pending) this.onLine(this.pending);
    this.pending = null;
  }
}

/** Texte qui vaut la peine d'être gardé (ni vide, ni répété à l'identique juste avant). */
export function cleanText(text: string): string {
  return text.replace(/\r/g, '').trim();
}

const MAX_THREADS = 40;
const DUPLICATE_WINDOW_MS = 1000;

export interface TextractorSessionOptions {
  /** Dossier d'installation de Textractor. */
  textractorDir: string;
  gameDir: string;
  /** Texte d'un fil du jeu (déjà nettoyé, jamais vide). */
  onText: (thread: TextractorThread, text: string) => void;
  /** État affiché (fils, processus suivis, erreur). */
  onChange: (view: TextractorView) => void;
  /** Hookcode du fil choisi la dernière fois pour ce jeu (presse-papiers / fichier). */
  selectedHook: string | null;
  /** Processus du jeu (pid → exécutable) ; par défaut via PowerShell. */
  listProcesses?: (gameDir: string) => Promise<Map<number, string>>;
}

/** Processus dont l'exécutable est dans `gameDir` (PowerShell ; chemin en base64 pour les noms japonais). */
export function listGameProcesses(gameDir: string): Promise<Map<number, string>> {
  const dir = gameDir.endsWith(path.sep) ? gameDir : gameDir + path.sep;
  const b64 = Buffer.from(dir, 'utf8').toString('base64');
  const script =
    `$d = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'));` +
    `[Console]::OutputEncoding = [Text.Encoding]::UTF8;` +
    `Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($d, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { "$($_.Id)|$($_.Path)" }`;
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, encoding: 'utf8' }, (error, stdout) => {
      const result = new Map<number, string>();
      if (!error) {
        for (const line of stdout.split(/\r?\n/)) {
          const [pid, ...image] = line.trim().split('|');
          if (/^\d+$/.test(pid) && image.length > 0) result.set(Number(pid), image.join('|'));
        }
      }
      resolve(result);
    });
  });
}

/** Une session par partie lancée avec Textractor. */
export class TextractorSession {
  private clis = new Map<'x86' | 'x64', ChildProcessWithoutNullStreams>();
  private attached = new Set<number>();
  private threads = new Map<string, TextractorThread>();
  private error: string | null = null;
  private stopped = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private selectedHook: string | null;
  private lastByHook = new Map<string, { text: string; at: number }>();

  constructor(private readonly options: TextractorSessionOptions) {
    this.selectedHook = options.selectedHook;
  }

  view(): TextractorView {
    return {
      running: !this.stopped,
      error: this.error,
      attachedPids: [...this.attached],
      threads: [...this.threads.values()].sort((a, b) => b.count - a.count),
      selectedHook: this.selectedHook
    };
  }

  private changed(): void {
    this.options.onChange(this.view());
  }

  setSelectedHook(hookcode: string | null): void {
    this.selectedHook = hookcode;
    this.changed();
  }

  /** Cherche les processus du jeu pendant `durationMs` (le lanceur peut démarrer le vrai jeu plus tard). */
  start(durationMs = 60_000, intervalMs = 2_000): void {
    const list = this.options.listProcesses ?? listGameProcesses;
    const startedAt = Date.now();
    const poll = async () => {
      if (this.stopped) return;
      try {
        const processes = await list(this.options.gameDir);
        for (const [pid, image] of processes) {
          if (!this.attached.has(pid)) this.attach(pid, image);
        }
      } catch (error) {
        this.fail(`Processus du jeu introuvables : ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!this.stopped && Date.now() - startedAt < durationMs) this.pollTimer = setTimeout(poll, intervalMs);
    };
    void poll();
  }

  private fail(message: string): void {
    this.error = message;
    this.changed();
  }

  private cliFor(arch: 'x86' | 'x64'): ChildProcessWithoutNullStreams | null {
    const existing = this.clis.get(arch);
    if (existing) return existing;
    const exe = findTextractorCli(this.options.textractorDir, arch);
    if (!exe) {
      this.fail(`TextractorCLI ${arch} introuvable dans ${this.options.textractorDir} (le jeu est en ${arch}).`);
      return null;
    }
    // Lancé depuis son dossier : il y charge texthook.dll.
    const cli = spawn(exe, [], { cwd: path.dirname(exe), windowsHide: true });
    const decoder = new CliOutputDecoder();
    let idle: NodeJS.Timeout | null = null;
    const reader = new TextractorLineReader(line => this.onLine(line));
    cli.stdout.on('data', (chunk: Buffer) => {
      reader.push(decoder.push(chunk));
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => reader.flush(), 120);
    });
    cli.on('error', error => this.fail(`TextractorCLI n'a pas pu démarrer : ${error.message}`));
    cli.on('exit', code => {
      this.clis.delete(arch);
      if (!this.stopped) this.fail(`TextractorCLI (${arch}) s'est arrêté (code ${code}).`);
    });
    this.clis.set(arch, cli);
    return cli;
  }

  private attach(pid: number, image: string): void {
    const arch = readPeArch(image) ?? 'x86';
    const cli = this.cliFor(arch);
    if (!cli) return;
    this.attached.add(pid);
    // Seule commande envoyée : TextractorCLI quitte sur une commande inconnue.
    // En UTF-16LE : il lit son entrée en _O_U16TEXT, une ligne UTF-8 n'est
    // jamais lue (vérifié avec Textractor 5.2.0).
    cli.stdin.write(attachCommand(pid));
    this.changed();
  }

  private onLine(line: TextractorLine): void {
    if (isInternalThread(line)) return;
    const text = cleanText(line.text);
    if (!text) return;
    let thread = this.threads.get(line.key);
    if (!thread) {
      if (this.threads.size >= MAX_THREADS) return;
      thread = { key: line.key, name: line.name, hookcode: line.hookcode, lastText: '', count: 0 };
      this.threads.set(line.key, thread);
    }
    thread.lastText = text.slice(0, 300);
    thread.count++;
    // Plusieurs fils partagent souvent un hookcode (même fonction, appelants
    // différents) et répètent le même texte : envoyé une fois par seconde au plus.
    const now = Date.now();
    const last = this.lastByHook.get(line.hookcode);
    this.lastByHook.set(line.hookcode, { text, at: now });
    if (!last || last.text !== text || now - last.at > DUPLICATE_WINDOW_MS) this.options.onText({ ...thread }, text);
    this.changed();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    for (const cli of this.clis.values()) {
      cli.stdin.end();
      cli.kill();
    }
    this.clis.clear();
    this.changed();
  }
}
