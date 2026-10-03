import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import { DPI_AWARE_CS } from './auto-clicker';
import type { OcrBlock, OcrLine, OcrTranslateSettings } from '../shared/ipc-types';
import { tm } from './i18n';

/**
 * Lecture du texte affiché par le jeu avec l'OCR intégré de Windows
 * (`Windows.Media.Ocr`, aucune dépendance) : un worker PowerShell capture
 * un rectangle de l'écran (pixels physiques : la fenêtre du jeu), l'enregistre
 * en PNG et le passe à l'OCR de la langue demandée. Le pack de langue OCR
 * doit être installé dans Windows (japonais : « Language.OCR~~~ja-JP »).
 *
 * L'image ne quitte jamais la machine ; seul le texte reconnu peut partir
 * vers un service de traduction (translator.ts).
 */

export const OCR_WORKER_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
${DPI_AWARE_CS}
'@
[DlsgmDpi]::Enable()
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${'`'}1'
})[0]
function Await($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}
function Reply($object) {
  $json = ConvertTo-Json -InputObject $object -Depth 6 -Compress
  [Console]::Out.WriteLine([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)))
  [Console]::Out.Flush()
}
$langs = @([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | ForEach-Object { $_.LanguageTag })
Reply @{ ready = $true; languages = $langs }
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $p = $line.Split(' ')
  if ($p[0] -ne 'ocr') { continue }
  try {
    $id = $p[1]; $tag = $p[2]; $x = [int]$p[3]; $y = [int]$p[4]; $w = [int]$p[5]; $h = [int]$p[6]; $file = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[7]))
    $bitmap = New-Object System.Drawing.Bitmap $w, $h
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($x, $y, 0, 0, $bitmap.Size)
    $graphics.Dispose()
    # L'OCR lit mieux un texte petit agrandi : x2 sous 1600 px de large.
    $scale = 1
    if ($w -lt 1600 -and $w * 2 -le [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -and $h * 2 -le [Windows.Media.Ocr.OcrEngine]::MaxImageDimension) {
      $scale = 2
      $big = New-Object System.Drawing.Bitmap ($w * 2), ($h * 2)
      $g2 = [System.Drawing.Graphics]::FromImage($big)
      $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g2.DrawImage($bitmap, 0, 0, $w * 2, $h * 2)
      $g2.Dispose()
      $bitmap.Dispose()
      $bitmap = $big
    }
    $bitmap.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language $tag))
    if ($engine -eq $null) { Reply @{ id = $id; error = "nolang" }; continue }
    $storage = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($file)) ([Windows.Storage.StorageFile])
    $stream = Await ($storage.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $soft = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($soft)) ([Windows.Media.Ocr.OcrResult])
    $stream.Dispose()
    $lines = @()
    foreach ($l in $result.Lines) {
      $words = @($l.Words)
      if ($words.Count -eq 0) { continue }
      $left = ($words | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
      $top = ($words | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
      $right = ($words | ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width } | Measure-Object -Maximum).Maximum
      $bottom = ($words | ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height } | Measure-Object -Maximum).Maximum
      $lines += @{ text = $l.Text; x = [int]($left / $scale); y = [int]($top / $scale); width = [int](($right - $left) / $scale); height = [int](($bottom - $top) / $scale) }
    }
    Reply @{ id = $id; lines = $lines }
  } catch {
    Reply @{ id = $p[1]; error = $_.Exception.Message }
  }
}
`;

const CJK = '\\u3000-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uff00-\\uffef';
const SPACE_BETWEEN_CJK = new RegExp(`(?<=[${CJK}])\\s+(?=[${CJK}])`, 'g');

/** L'OCR sépare chaque caractère japonais par une espace : on les retire entre deux caractères CJK. */
export function joinCjk(text: string): string {
  return text.replace(SPACE_BETWEEN_CJK, '').trim();
}

/**
 * Lignes → blocs (une bulle de dialogue, un menu…) : une ligne rejoint le
 * bloc précédent si elle commence juste en dessous (écart < 1,2 hauteur de
 * ligne) et le chevauche horizontalement. Coordonnées relatives à la capture.
 */
export function groupOcrLines(lines: OcrLine[]): OcrBlock[] {
  const sorted = lines
    .map(line => ({ ...line, text: joinCjk(line.text) }))
    .filter(line => line.text)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const blocks: (OcrBlock & { lastBottom: number; lineHeight: number })[] = [];
  for (const line of sorted) {
    const block = blocks.find(b => {
      const gap = line.y - b.lastBottom;
      const overlaps = line.x < b.x + b.width && line.x + line.width > b.x;
      return overlaps && gap > -line.height / 2 && gap < Math.max(b.lineHeight, line.height) * 1.2;
    });
    if (block) {
      const right = Math.max(block.x + block.width, line.x + line.width);
      const bottom = Math.max(block.y + block.height, line.y + line.height);
      block.x = Math.min(block.x, line.x);
      block.width = right - block.x;
      block.height = bottom - block.y;
      block.lastBottom = line.y + line.height;
      block.lineHeight = Math.max(block.lineHeight, line.height);
      // Japonais : les lignes d'une bulle se suivent sans espace.
      const glue = /[　-鿿]$/.test(block.text) ? '' : ' ';
      block.text += glue + line.text;
    } else {
      blocks.push({ text: line.text, x: line.x, y: line.y, width: line.width, height: line.height, lastBottom: line.y + line.height, lineHeight: line.height });
    }
  }
  return blocks.map(({ lastBottom: _b, lineHeight: _h, ...block }) => block);
}

interface Pending {
  resolve: (lines: OcrLine[]) => void;
  reject: (error: Error) => void;
}

/** Worker OCR (Windows), lancé à la première lecture puis gardé. */
export class OcrReader {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<string[]> | null = null;
  private isReady = false;
  private pending = new Map<string, Pending>();
  private nextId = 1;

  constructor(private readonly scriptDir: string) {}

  /** Langues OCR installées dans Windows (balises : ja, en-US...). */
  languages(): Promise<string[]> {
    return this.start();
  }

  private start(): Promise<string[]> {
    if (process.platform !== 'win32') return Promise.reject(new Error(tm("L'OCR n'est disponible que sous Windows.")));
    if (this.ready) return this.ready;
    const scriptPath = path.join(this.scriptDir, 'ocr.ps1');
    fs.writeFileSync(scriptPath, OCR_WORKER_SCRIPT, 'utf8');
    const worker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true });
    this.worker = worker;
    this.ready = new Promise<string[]>((resolve, reject) => {
      let buffer = '';
      let stderr = '';
      worker.stdout.setEncoding('utf8');
      worker.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        let newline: number;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const raw = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!raw) continue;
          let message: { ready?: boolean; languages?: string[] | string; id?: string; lines?: OcrLine[] | OcrLine; error?: string };
          try {
            message = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
          } catch {
            continue;
          }
          if (message.ready) {
            if (this.worker === worker) this.isReady = true;
            resolve(([] as string[]).concat(message.languages ?? []));
            continue;
          }
          const job = message.id ? this.pending.get(message.id) : undefined;
          if (!job || !message.id) continue;
          this.pending.delete(message.id);
          if (message.error) job.reject(new Error(message.error === 'nolang' ? tm('Langue OCR non installée dans Windows.') : message.error));
          // ConvertTo-Json rend un objet seul (et non un tableau) pour une seule ligne.
          else job.resolve(([] as OcrLine[]).concat(message.lines ?? []));
        }
      });
      worker.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      worker.on('error', reject);
      worker.on('exit', code => {
        const error = new Error(stderr.trim() || tm('OCR arrêté (code {code})', { code: String(code) }));
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

  /** Préchauffe le worker (une à deux secondes la première fois). */
  warmUp(): void {
    this.start().catch(() => undefined);
  }

  /**
   * Lit le texte du rectangle d'écran donné (pixels physiques), dans la
   * langue `tag`. Worker prêt : la commande part pendant l'appel, sans await
   * (appelé depuis un raccourci global : voir AutoClicker.start).
   */
  read(tag: string, rect: { x: number; y: number; width: number; height: number }): Promise<OcrLine[]> {
    if (this.isReady && this.worker) return this.send(tag, rect);
    return this.start().then(() => this.send(tag, rect));
  }

  private send(tag: string, rect: { x: number; y: number; width: number; height: number }): Promise<OcrLine[]> {
    const id = String(this.nextId++);
    const file = path.join(this.scriptDir, `ocr-capture-${id}.png`);
    const safeTag = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(tag) ? tag : 'ja';
    const command = ['ocr', id, safeTag, Math.round(rect.x), Math.round(rect.y), Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)), Buffer.from(file, 'utf8').toString('base64')].join(' ');
    return new Promise<OcrLine[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker?.stdin.write(`${command}\n`);
    }).finally(() => fs.promises.rm(file, { force: true }).catch(() => undefined));
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

export const DEFAULT_OCR: OcrTranslateSettings = {
  enabled: false,
  hotkey: 'F10',
  source: 'ja',
  target: 'fr',
  engine: 'dictionary',
  localUrl: 'http://127.0.0.1:11434/v1',
  localModel: ''
};

/** Réglages venus des paramètres, ramenés à des valeurs sûres. */
export function sanitizeOcrSettings(value: Partial<OcrTranslateSettings> | undefined): OcrTranslateSettings {
  const v = value ?? {};
  const text = (x: unknown, fallback: string, max = 200) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : fallback);
  return {
    enabled: Boolean(v.enabled),
    hotkey: text(v.hotkey, DEFAULT_OCR.hotkey, 40),
    source: /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(String(v.source)) ? String(v.source) : DEFAULT_OCR.source,
    target: /^[a-z]{2}$/.test(String(v.target)) ? String(v.target) : DEFAULT_OCR.target,
    engine: v.engine === 'none' || v.engine === 'local' || v.engine === 'deepl' || v.engine === 'google' ? v.engine : 'dictionary',
    localUrl: text(v.localUrl, DEFAULT_OCR.localUrl),
    localModel: typeof v.localModel === 'string' ? v.localModel.trim().slice(0, 200) : ''
  };
}
