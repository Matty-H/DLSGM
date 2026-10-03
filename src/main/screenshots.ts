import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import { DPI_AWARE_CS } from './auto-clicker';
import type { CaptureInfo, ScreenshotSettings } from '../shared/ipc-types';
import { tm } from './i18n';

/**
 * Captures d'écran du jeu (raccourci pendant une partie, ou bouton de
 * l'overlay) : seule la zone client de la fenêtre du jeu est capturée, en
 * PNG, dans `<travaux>/<ID>/captures/` — jamais envoyées en LAN, gardées si
 * le jeu est supprimé. Un worker PowerShell (CopyFromScreen, DPI aware) les
 * écrit ; les fenêtres de DLSGM posées sur le jeu sont exclues des captures
 * (`setContentProtection`), l'overlay est caché avant.
 */

export const DEFAULT_SCREENSHOT: ScreenshotSettings = { enabled: true, hotkey: 'Ctrl+F8' };

export function sanitizeScreenshotSettings(value: Partial<ScreenshotSettings> | undefined): ScreenshotSettings {
  const v = value ?? {};
  return {
    enabled: v.enabled !== false,
    hotkey: typeof v.hotkey === 'string' && v.hotkey.trim() ? v.hotkey.trim().slice(0, 40) : DEFAULT_SCREENSHOT.hotkey
  };
}

/** Nom d'une capture : le seul format accepté par les canaux qui en reçoivent un du renderer. */
const CAPTURE_NAME = /^[\w-]{1,80}\.png$/;

export function isCaptureName(name: unknown): name is string {
  return typeof name === 'string' && CAPTURE_NAME.test(name);
}

/** `2026-10-01_12-45-03.png`, suffixé (`_2`...) si une capture porte déjà ce nom. */
export function captureFileName(dir: string, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  let name = `${base}.png`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${base}_${i}.png`;
  return name;
}

/** Captures d'un dossier, de la plus récente à la plus ancienne. */
export function listCaptures(dir: string): CaptureInfo[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter(isCaptureName);
  } catch {
    return [];
  }
  return names
    .map(file => {
      const stat = fs.statSync(path.join(dir, file));
      return { file, size: stat.size, date: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.file.localeCompare(a.file));
}

export const SCREENSHOT_WORKER_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
${DPI_AWARE_CS}
'@
[DlsgmDpi]::Enable()
[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $p = $line.Split(' ')
  if ($p[0] -ne 'shot') { continue }
  try {
    $file = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[6]))
    $bitmap = New-Object System.Drawing.Bitmap ([int]$p[4]), ([int]$p[5])
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen([int]$p[2], [int]$p[3], 0, 0, $bitmap.Size)
    $graphics.Dispose()
    $bitmap.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    [Console]::Out.WriteLine('ok ' + $p[1])
  } catch {
    [Console]::Out.WriteLine('err ' + $p[1] + ' ' + $_.Exception.Message.Replace([char]10, ' '))
  }
  [Console]::Out.Flush()
}
`;

/** Worker de capture (Windows), préchauffé pendant les parties. */
export class ScreenCapturer {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private isReady = false;
  private nextId = 1;
  private pending = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();

  constructor(private readonly scriptDir: string) {}

  warmUp(): void {
    this.start().catch(() => undefined);
  }

  private start(): Promise<void> {
    if (process.platform !== 'win32') return Promise.reject(new Error(tm("Les captures ne sont disponibles que sous Windows.")));
    if (this.ready) return this.ready;
    const scriptPath = path.join(this.scriptDir, 'screenshot.ps1');
    fs.writeFileSync(scriptPath, SCREENSHOT_WORKER_SCRIPT, 'utf8');
    const worker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true });
    this.worker = worker;
    this.ready = new Promise<void>((resolve, reject) => {
      let buffer = '';
      let stderr = '';
      worker.stdout.setEncoding('utf8');
      worker.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        let newline: number;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line === 'ready') {
            if (this.worker === worker) this.isReady = true;
            resolve();
            continue;
          }
          const [kind, id, ...message] = line.split(' ');
          const job = this.pending.get(id);
          if (!job) continue;
          this.pending.delete(id);
          if (kind === 'ok') job.resolve();
          else job.reject(new Error(message.join(' ') || tm('Capture impossible.')));
        }
      });
      worker.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      worker.on('error', reject);
      worker.on('exit', code => {
        const error = new Error(stderr.trim() || tm('Capture arrêtée (code {code})', { code: String(code) }));
        reject(error);
        for (const job of this.pending.values()) job.reject(error);
        this.pending.clear();
        if (this.worker === worker) {
          this.worker = null;
          this.ready = null;
          this.isReady = false;
        }
      });
    });
    return this.ready;
  }

  /**
   * Capture `rect` (pixels physiques) dans `file` (PNG). Worker prêt : la
   * commande part pendant l'appel (raccourci global : voir AutoClicker.start).
   */
  capture(rect: { x: number; y: number; width: number; height: number }, file: string): Promise<void> {
    const send = () =>
      new Promise<void>((resolve, reject) => {
        const id = String(this.nextId++);
        this.pending.set(id, { resolve, reject });
        const command = ['shot', id, Math.round(rect.x), Math.round(rect.y), Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)), Buffer.from(file, 'utf8').toString('base64')];
        this.worker?.stdin.write(`${command.join(' ')}\n`);
      });
    if (this.isReady && this.worker) return send();
    return this.start().then(send);
  }

  dispose(): void {
    const worker = this.worker;
    this.worker = null;
    this.ready = null;
    this.isReady = false;
    if (worker) {
      worker.stdin.end();
      setTimeout(() => worker.kill(), 1000).unref();
    }
  }
}
