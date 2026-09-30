import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import { FOREGROUND_GUARD_CS, dirsCommand } from './auto-clicker';
import type { ClickerButton, PixelTarget, PixelTrigger, PixelTriggerSettings, PixelTriggerStatus } from '../shared/ipc-types';

/**
 * Détecteur de rythme (Windows), pour les jeux de rythme façon Guitar Hero :
 * chaque zone surveillée (une piste) déclenche un clic à un point fixe, ou
 * l'appui d'une touche, quand ses pixels bougent (mode `motion`, écart avec
 * l'image précédente) ou prennent la couleur visée (mode `color`).
 *
 * Même modèle que l'auto-clicker (auto-clicker.ts) : un worker PowerShell
 * (Add-Type d'une classe C#) piloté par stdin, une boucle dans un thread
 * du worker — capture BitBlt de chaque zone depuis l'écran, environ une
 * fois par milliseconde —, marche / arrêt par un raccourci global (F7 par
 * défaut) sans aucun await, et rien n'est envoyé si la fenêtre au premier
 * plan n'est pas celle d'un jeu en cours (pause, touches relâchées).
 *
 * Déclenchement sur front montant : la zone passe de « ne correspond pas »
 * à « correspond », au plus une fois par `cooldownMs`. L'action part après
 * `delayMs` (zone placée en amont de la ligne de frappe) ; `hold` garde le
 * bouton / la touche enfoncé tant que la zone correspond (notes longues).
 *
 * Limites : BitBlt ne voit pas un jeu en plein écran exclusif (image noire) ;
 * une capture d'écran coûte d'une fraction de ms à quelques ms selon la
 * carte graphique (mesuré et affiché : `frameMs`) ; UIPI bloque les entrées
 * envoyées à un jeu lancé en administrateur.
 */

export const MAX_TRIGGERS = 12;
// Côté d'une zone en pixels physiques : au-delà, la capture ralentit la boucle.
export const MAX_ZONE_SIZE = 200;
// Durée d'un appui (clic ou touche) hors maintien : assez pour les jeux qui lisent l'état du clavier par image.
export const PRESS_MS = 35;

export const DEFAULT_PIXEL_TRIGGER: PixelTriggerSettings = { enabled: false, hotkey: 'F7' };

// mouse_event : drapeaux appui / relâchement par bouton.
const BUTTON_FLAGS: Record<ClickerButton, [down: number, up: number]> = {
  left: [0x0002, 0x0004],
  right: [0x0008, 0x0010],
  middle: [0x0020, 0x0040]
};

/**
 * Touches proposées (nom → code de touche virtuelle, touche étendue).
 * Les noms sont ceux de lib/pixelTrigger.ts (KEY_OPTIONS) côté renderer.
 */
export const KEY_CODES: Record<string, [vk: number, extended: boolean]> = {
  ...Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(letter => [letter, [letter.charCodeAt(0), false]])),
  ...Object.fromEntries([...'0123456789'].map(digit => [digit, [digit.charCodeAt(0), false]])),
  Space: [0x20, false],
  Enter: [0x0d, false],
  Shift: [0x10, false],
  Ctrl: [0x11, false],
  Left: [0x25, true],
  Up: [0x26, true],
  Right: [0x27, true],
  Down: [0x28, true],
  Numpad0: [0x60, false],
  Numpad1: [0x61, false],
  Numpad2: [0x62, false],
  Numpad3: [0x63, false],
  Numpad4: [0x64, false],
  Numpad5: [0x65, false],
  Numpad6: [0x66, false],
  Numpad7: [0x67, false],
  Numpad8: [0x68, false],
  Numpad9: [0x69, false]
};

const intOr = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

const pointOr = (value: unknown): { x: number; y: number } | null => {
  const p = value as { x?: unknown; y?: unknown } | null | undefined;
  return p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)
    ? { x: Math.round(p.x), y: Math.round(p.y) }
    : null;
};

export function sanitizePixelTriggerSettings(value: Partial<PixelTriggerSettings> | undefined): PixelTriggerSettings {
  const v = value ?? {};
  return {
    enabled: Boolean(v.enabled),
    hotkey: typeof v.hotkey === 'string' && v.hotkey.trim() ? v.hotkey.trim() : DEFAULT_PIXEL_TRIGGER.hotkey
  };
}

/** Zones d'un jeu venues du renderer : bornées, les invalides écartées. */
export function sanitizePixelTriggers(value: unknown): PixelTrigger[] {
  if (!Array.isArray(value)) return [];
  const result: PixelTrigger[] = [];
  for (const raw of value.slice(0, MAX_TRIGGERS)) {
    if (!raw || typeof raw !== 'object') continue;
    const t = raw as Partial<PixelTrigger>;
    const zoneRaw = t.zone as Partial<NonNullable<PixelTrigger['zone']>> | null | undefined;
    const origin = pointOr(zoneRaw);
    const zone =
      origin && zoneRaw
        ? { ...origin, width: intOr(zoneRaw.width, 10, 1, MAX_ZONE_SIZE), height: intOr(zoneRaw.height, 10, 1, MAX_ZONE_SIZE) }
        : null;
    result.push({
      id: typeof t.id === 'string' && /^[\w-]{1,40}$/.test(t.id) ? t.id : Math.random().toString(36).slice(2, 10),
      name: typeof t.name === 'string' ? t.name.slice(0, 40) : '',
      enabled: t.enabled !== false,
      mode: t.mode === 'color' ? 'color' : 'motion',
      zone,
      color: typeof t.color === 'string' && /^#[0-9a-f]{6}$/i.test(t.color) ? t.color.toLowerCase() : '#ffffff',
      tolerance: intOr(t.tolerance, 40, 0, 255),
      minPercent: intOr(t.minPercent, 30, 1, 100),
      action: t.action === 'key' ? 'key' : 'click',
      button: t.button === 'right' || t.button === 'middle' ? t.button : 'left',
      clickPoint: pointOr(t.clickPoint),
      key: typeof t.key === 'string' && t.key in KEY_CODES ? t.key : 'Space',
      delayMs: intOr(t.delayMs, 0, 0, 2000),
      hold: Boolean(t.hold),
      cooldownMs: intOr(t.cooldownMs, 80, 10, 5000)
    });
  }
  return result;
}

/**
 * Témoin affiché (`shown`) dès que le détecteur est activé et qu'un jeu lancé
 * depuis DLSGM tourne, même sans zone : on voit qu'il est là et où le régler.
 * Armé (raccourci pris, worker prêt) seulement avec au moins une zone active :
 * sinon le raccourci reste au jeu.
 */
export function triggerVisibility(state: { enabled: boolean; available: boolean; runningGames: number; zones: number }) {
  const shown = state.enabled && state.available && state.runningGames > 0;
  return { shown, armed: shown && state.zones > 0 };
}

/** Zones utilisables : actives et visées. */
export function activeTriggers(triggers: PixelTrigger[]): PixelTrigger[] {
  return triggers.filter(t => t.enabled && t.zone !== null);
}

type ToScreen = (point: { x: number; y: number }) => { x: number; y: number };

// Champs d'une zone dans la commande `start`, dans l'ordre lu par le worker.
export const TRIGGER_STRIDE = 19;

/** Entiers transmis au worker pour une zone (coordonnées converties en pixels physiques). */
export function triggerFields(trigger: PixelTrigger, toScreen: ToScreen): number[] {
  const zone = trigger.zone!;
  const topLeft = toScreen({ x: zone.x, y: zone.y });
  const bottomRight = toScreen({ x: zone.x + zone.width, y: zone.y + zone.height });
  const width = Math.min(MAX_ZONE_SIZE, Math.max(1, bottomRight.x - topLeft.x));
  const height = Math.min(MAX_ZONE_SIZE, Math.max(1, bottomRight.y - topLeft.y));
  const minCount = Math.max(1, Math.ceil((width * height * trigger.minPercent) / 100));
  const rgb = parseInt(trigger.color.slice(1), 16);
  const click = toScreen(trigger.clickPoint ?? { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 });
  const [down, up] = BUTTON_FLAGS[trigger.button];
  const [vk, extended] = KEY_CODES[trigger.key] ?? KEY_CODES.Space;
  return [
    trigger.mode === 'color' ? 1 : 0,
    topLeft.x,
    topLeft.y,
    width,
    height,
    (rgb >> 16) & 0xff,
    (rgb >> 8) & 0xff,
    rgb & 0xff,
    trigger.tolerance,
    minCount,
    trigger.action === 'key' ? 1 : 0,
    down,
    up,
    vk,
    extended ? 1 : 0,
    Math.round(click.x),
    Math.round(click.y),
    trigger.delayMs,
    trigger.hold ? 1 : 0
  ].map(Math.round);
}

/** `start <run> <nombre> <champs…> <attente…>` : les attentes (cooldown) suivent les champs, une par zone. */
export function startTriggerCommand(run: number, triggers: PixelTrigger[], toScreen: ToScreen): string {
  const fields = triggers.flatMap(t => triggerFields(t, toScreen));
  return ['start', run, triggers.length, ...fields, ...triggers.map(t => t.cooldownMs)].join(' ');
}

export const TRIGGER_WORKER_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
${FOREGROUND_GUARD_CS}
public static class DlsgmTrigger {
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window, IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
  [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dest, int x, int y, int w, int h, IntPtr src, int sx, int sy, uint rop);
  [DllImport("gdi32.dll")] static extern IntPtr CreateDIBSection(IntPtr dc, ref BITMAPINFOHEADER info, uint usage, out IntPtr bits, IntPtr section, uint offset);
  [DllImport("gdi32.dll")] static extern uint GetPixel(IntPtr dc, int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("winmm.dll")] static extern uint timeBeginPeriod(uint period);
  [DllImport("winmm.dll")] static extern uint timeEndPeriod(uint period);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] static extern bool SetProcessInformation(IntPtr process, int infoClass, ref PowerThrottlingState info, uint size);

  [StructLayout(LayoutKind.Sequential)]
  struct PowerThrottlingState { public uint Version; public uint ControlMask; public uint StateMask; }

  [StructLayout(LayoutKind.Sequential)]
  struct BITMAPINFOHEADER {
    public uint Size; public int Width; public int Height; public ushort Planes; public ushort BitCount;
    public uint Compression; public uint SizeImage; public int XPels; public int YPels; public uint ClrUsed; public uint ClrImportant;
  }

  public static void DisableThrottling() {
    PowerThrottlingState state = new PowerThrottlingState();
    state.Version = 1;
    state.ControlMask = 0x1 | 0x4; // EXECUTION_SPEED | IGNORE_TIMER_RESOLUTION
    state.StateMask = 0;
    try { SetProcessInformation(GetCurrentProcess(), 4, ref state, (uint)Marshal.SizeOf(state)); } catch { }
  }

  const uint SRCCOPY = 0x00CC0020;
  const uint KEYUP = 0x0002;
  const uint EXTENDED = 0x0001;

  class Zone {
    public int Mode, Left, Top, Width, Height, R, G, B, Tolerance, MinCount, Action;
    public uint Down, Up; public byte Vk, Scan; public uint KeyFlags;
    public int ClickX, ClickY, Delay; public bool Hold; public int Cooldown;
    public int[] Previous; public bool HasPrevious;
    public bool Matching, Pressed; public long LastFire = long.MinValue / 2;
  }

  // Action programmée : appui ou relâchement d'une zone à un instant donné.
  struct Scheduled { public long At; public Zone Zone; public bool Down; }

  static readonly ManualResetEvent stopSignal = new ManualResetEvent(false);
  static readonly List<Scheduled> pending = new List<Scheduled>();
  static readonly Stopwatch clock = Stopwatch.StartNew();
  static Thread worker, actions;

  static void Emit(string line) {
    lock (stopSignal) {
      Console.Out.WriteLine(line);
      Console.Out.Flush();
    }
  }

  static void Schedule(long at, Zone z, bool down) {
    Scheduled item = new Scheduled();
    item.At = at; item.Zone = z; item.Down = down;
    lock (pending) pending.Add(item);
  }

  static void Press(Zone z, bool down) {
    if (down == z.Pressed) return;
    z.Pressed = down;
    if (z.Action == 1) {
      keybd_event(z.Vk, z.Scan, z.KeyFlags | (down ? 0 : KEYUP), UIntPtr.Zero);
    } else {
      if (down) SetCursorPos(z.ClickX, z.ClickY);
      mouse_event(down ? z.Down : z.Up, 0, 0, 0, UIntPtr.Zero);
    }
  }

  // Part des pixels de la zone (dans l'image de toutes les zones, de largeur boxWidth) qui
  // ont la couleur visée (mode 1) ou ont changé depuis l'image précédente (mode 0).
  static bool Matches(Zone z, int[] box, int boxWidth, int offsetX, int offsetY) {
    int count = 0, k = 0;
    int[] prev = z.Previous;
    for (int y = 0; y < z.Height; y++) {
      int row = (offsetY + y) * boxWidth + offsetX;
      for (int x = 0; x < z.Width; x++, k++) {
        int p = box[row + x];
        int r = (p >> 16) & 0xff, g = (p >> 8) & 0xff, b = p & 0xff;
        if (z.Mode == 1) {
          if (Math.Abs(r - z.R) <= z.Tolerance && Math.Abs(g - z.G) <= z.Tolerance && Math.Abs(b - z.B) <= z.Tolerance) count++;
        } else {
          int q = prev[k];
          if (z.HasPrevious && (Math.Abs(r - ((q >> 16) & 0xff)) > z.Tolerance || Math.Abs(g - ((q >> 8) & 0xff)) > z.Tolerance || Math.Abs(b - (q & 0xff)) > z.Tolerance)) count++;
          prev[k] = p;
        }
      }
    }
    if (z.Mode == 1) return count >= z.MinCount;
    bool had = z.HasPrevious;
    z.HasPrevious = true;
    return had && count >= z.MinCount;
  }

  public static string Sample(int x, int y) {
    IntPtr screen = GetDC(IntPtr.Zero);
    try {
      uint c = GetPixel(screen, x, y); // 0x00BBGGRR
      return string.Format("#{0:x2}{1:x2}{2:x2}", c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff);
    } finally {
      ReleaseDC(IntPtr.Zero, screen);
    }
  }

  // v : champs des zones (${TRIGGER_STRIDE} par zone) puis un cooldown par zone.
  public static void Start(int run, int count, int[] v) {
    Stop();
    stopSignal.Reset();
    lock (pending) pending.Clear();
    Zone[] zones = new Zone[count];
    for (int i = 0; i < count; i++) {
      int o = i * ${TRIGGER_STRIDE};
      Zone z = new Zone();
      z.Mode = v[o]; z.Left = v[o + 1]; z.Top = v[o + 2]; z.Width = v[o + 3]; z.Height = v[o + 4];
      z.R = v[o + 5]; z.G = v[o + 6]; z.B = v[o + 7]; z.Tolerance = v[o + 8]; z.MinCount = v[o + 9];
      z.Action = v[o + 10]; z.Down = (uint)v[o + 11]; z.Up = (uint)v[o + 12];
      z.Vk = (byte)v[o + 13]; z.Scan = (byte)MapVirtualKey((uint)v[o + 13], 0); z.KeyFlags = v[o + 14] == 1 ? EXTENDED : 0;
      z.ClickX = v[o + 15]; z.ClickY = v[o + 16]; z.Delay = v[o + 17]; z.Hold = v[o + 18] == 1;
      z.Cooldown = v[count * ${TRIGGER_STRIDE} + i];
      z.Previous = new int[z.Width * z.Height];
      zones[i] = z;
    }
    actions = new Thread(() => ActionLoop(zones));
    actions.IsBackground = true;
    actions.Priority = ThreadPriority.Highest;
    actions.Start();
    worker = new Thread(() => CaptureLoop(run, zones));
    worker.IsBackground = true;
    worker.Priority = ThreadPriority.AboveNormal;
    worker.Start();
  }

  // Thread des actions, à la milliseconde : la capture, elle, attend l'image suivante de l'écran.
  static void ActionLoop(Zone[] zones) {
    timeBeginPeriod(1);
    List<Scheduled> due = new List<Scheduled>();
    try {
      while (!stopSignal.WaitOne(1)) {
        long now = clock.ElapsedMilliseconds;
        due.Clear();
        lock (pending) {
          // Dans l'ordre de programmation : un appui passe avant son relâchement.
          foreach (Scheduled item in pending) if (item.At <= now) due.Add(item);
          pending.RemoveAll(item => item.At <= now);
        }
        foreach (Scheduled item in due) Press(item.Zone, item.Down);
      }
    } finally {
      // Jamais de bouton ni de touche laissé enfoncé.
      foreach (Zone z in zones) Press(z, false);
      timeEndPeriod(1);
    }
  }

  // Une seule capture par tour, du rectangle qui englobe toutes les zones : une lecture de
  // l'écran (BitBlt) attend le rafraîchissement suivant (~16,7 ms à 60 Hz) quelle que soit
  // sa taille — une capture par zone diviserait d'autant la fréquence.
  static void CaptureLoop(int run, Zone[] zones) {
    int left = int.MaxValue, top = int.MaxValue, right = int.MinValue, bottom = int.MinValue;
    foreach (Zone z in zones) {
      left = Math.Min(left, z.Left); top = Math.Min(top, z.Top);
      right = Math.Max(right, z.Left + z.Width); bottom = Math.Max(bottom, z.Top + z.Height);
    }
    int width = right - left, height = bottom - top;
    IntPtr screen = GetDC(IntPtr.Zero);
    IntPtr dc = CreateCompatibleDC(screen);
    BITMAPINFOHEADER info = new BITMAPINFOHEADER();
    info.Size = (uint)Marshal.SizeOf(info);
    info.Width = width; info.Height = -height; info.Planes = 1; info.BitCount = 32;
    IntPtr bits;
    IntPtr bitmap = CreateDIBSection(screen, ref info, 0, out bits, IntPtr.Zero, 0);
    SelectObject(dc, bitmap);
    int[] box = new int[width * height];
    bool paused = false;
    long lastGuard = -1000, lastReport = clock.ElapsedMilliseconds, frames = 0;
    Emit("started " + run);
    try {
      while (!stopSignal.WaitOne(0)) {
        long now = clock.ElapsedMilliseconds;
        // Premier plan vérifié toutes les 50 ms (pas à chaque image).
        if (now - lastGuard >= 50) {
          lastGuard = now;
          bool inGame = DlsgmForeground.IsGame();
          if (inGame == paused) {
            paused = !inGame;
            if (paused) {
              lock (pending) {
                pending.Clear();
                foreach (Zone z in zones) { Schedule(0, z, false); z.Matching = false; z.HasPrevious = false; }
              }
            }
            Emit((paused ? "paused " : "resumed ") + run);
          }
        }
        if (paused) { stopSignal.WaitOne(50); continue; }

        BitBlt(dc, 0, 0, width, height, screen, left, top, SRCCOPY);
        Marshal.Copy(bits, box, 0, box.Length);
        now = clock.ElapsedMilliseconds;
        for (int i = 0; i < zones.Length; i++) {
          Zone z = zones[i];
          bool match = Matches(z, box, width, z.Left - left, z.Top - top);
          if (match && !z.Matching && now - z.LastFire >= z.Cooldown) {
            z.LastFire = now;
            Schedule(now + z.Delay, z, true);
            if (!z.Hold) Schedule(now + z.Delay + ${PRESS_MS}, z, false);
            Emit("hit " + run + " " + i);
          } else if (!match && z.Matching && z.Hold) {
            Schedule(now + z.Delay, z, false);
          }
          z.Matching = match;
        }
        frames++;
        if (now - lastReport >= 1000) {
          // Intervalle moyen entre deux captures, en µs.
          Emit("frame " + run + " " + ((now - lastReport) * 1000 / frames));
          lastReport = now; frames = 0;
        }
      }
    } finally {
      DeleteDC(dc);
      DeleteObject(bitmap);
      ReleaseDC(IntPtr.Zero, screen);
      Emit("stopped " + run);
    }
  }

  public static void Stop() {
    stopSignal.Set();
    if (worker != null) { worker.Join(5000); worker = null; }
    if (actions != null) { actions.Join(5000); actions = null; }
  }
}
'@
[DlsgmTrigger]::DisableThrottling()
try { [Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'AboveNormal' } catch { }
[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { [DlsgmTrigger]::Stop(); break }
  $p = $line.Split(' ')
  if ($p[0] -eq 'start') {
    $count = [int]$p[2]
    [int[]]$values = @($p[3..($p.Length - 1)] | ForEach-Object { [int]$_ })
    [DlsgmTrigger]::Start([int]$p[1], $count, $values)
  } elseif ($p[0] -eq 'stop') {
    [DlsgmTrigger]::Stop()
  } elseif ($p[0] -eq 'dirs') {
    $text = ''
    if ($p.Length -gt 1) { $text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[1])) }
    [DlsgmForeground]::SetDirs([string[]]@($text.Split([char]10) | Where-Object { $_ -ne '' }))
  } elseif ($p[0] -eq 'sample') {
    $color = [DlsgmTrigger]::Sample([int]$p[2], [int]$p[3])
    [Console]::Out.WriteLine('sample ' + $p[1] + ' ' + $color)
    [Console]::Out.Flush()
  }
}
`;

export interface PixelTriggerOptions {
  /** Dossier où écrire le script du worker (userData). */
  scriptDir: string;
  /** Pixels physiques d'un point en coordonnées Electron (screen.dipToScreenPoint). */
  toScreenPoint: ToScreen;
  onStatus: (status: PixelTriggerStatus) => void;
}

export class PixelTriggerDetector {
  private worker: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private isReady = false;
  private run = 0;
  private samples = 0;
  private readonly pendingSamples = new Map<number, (color: string) => void>();
  // Zones du tour en cours, dans l'ordre transmis (le worker renvoie leur index).
  private runTriggers: PixelTrigger[] = [];
  private status: PixelTriggerStatus = {
    available: process.platform === 'win32',
    running: false,
    paused: false,
    inGame: false,
    hotkeyActive: false,
    zoneCount: 0,
    hits: {},
    frameMs: null,
    error: null
  };

  constructor(private readonly options: PixelTriggerOptions) {}

  getStatus(): PixelTriggerStatus {
    return { ...this.status, hits: { ...this.status.hits } };
  }

  setHotkeyActive(active: boolean): void {
    if (this.status.hotkeyActive !== active) this.update({ hotkeyActive: active });
  }

  setInGame(inGame: boolean, zoneCount: number): void {
    if (this.status.inGame !== inGame || this.status.zoneCount !== zoneCount) this.update({ inGame, zoneCount });
  }

  private update(patch: Partial<PixelTriggerStatus>): void {
    this.status = { ...this.status, ...patch };
    this.options.onStatus(this.getStatus());
  }

  /** Lance le worker (compilation C# : une à deux secondes la première fois). */
  warmUp(): Promise<void> {
    if (!this.status.available) return Promise.reject(new Error("Le détecteur de rythme n'est disponible que sous Windows."));
    if (this.ready) return this.ready;
    const scriptPath = path.join(this.options.scriptDir, 'pixel-trigger.ps1');
    fs.writeFileSync(scriptPath, TRIGGER_WORKER_SCRIPT, 'utf8');
    const worker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      windowsHide: true
    });
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
          const sample = /^sample (\d+) (#[0-9a-f]{6})$/.exec(line);
          if (sample) {
            this.pendingSamples.get(Number(sample[1]))?.(sample[2]);
            this.pendingSamples.delete(Number(sample[1]));
            continue;
          }
          const event = /^(started|stopped|paused|resumed|hit|frame) (\d+)(?: (\d+))?$/.exec(line);
          // Un ancien tour qui s'arrête (redémarrage) ne doit pas toucher au nouveau.
          if (event && Number(event[2]) === this.run) this.onWorkerEvent(event[1], Number(event[3]));
        }
      });
      worker.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      worker.on('error', error => {
        reject(error);
        if (this.worker === worker) this.reset(`Démarrage du détecteur impossible : ${error.message}`);
      });
      worker.on('exit', code => {
        const message = stderr.trim() || `le worker s'est arrêté (code ${code})`;
        reject(new Error(message));
        if (this.worker === worker) this.reset(`Détecteur arrêté : ${message}`);
      });
    });
    return this.ready;
  }

  private onWorkerEvent(kind: string, value: number): void {
    switch (kind) {
      case 'paused':
      case 'resumed':
        this.update({ paused: kind === 'paused' });
        break;
      case 'hit': {
        const trigger = this.runTriggers[value];
        if (trigger) this.update({ hits: { ...this.status.hits, [trigger.id]: (this.status.hits[trigger.id] ?? 0) + 1 } });
        break;
      }
      case 'frame':
        // Microsecondes → ms, une décimale.
        this.update({ frameMs: Math.round(value / 100) / 10 });
        break;
      case 'stopped':
        this.update({ running: false, paused: false });
        break;
    }
  }

  private reset(error: string | null): void {
    this.worker = null;
    this.ready = null;
    this.isReady = false;
    for (const resolve of this.pendingSamples.values()) resolve('');
    this.pendingSamples.clear();
    this.update({ running: false, paused: false, error });
  }

  /**
   * Worker prêt : la commande part de façon synchrone, sans aucun await
   * (voir AutoClicker.start — depuis un raccourci global, Electron ne
   * reprend une suite d'await qu'au prochain réveil de sa boucle).
   */
  start(triggers: PixelTrigger[]): Promise<void> {
    const usable = activeTriggers(triggers);
    if (usable.length === 0) return Promise.reject(new Error('Aucune zone active pour ce jeu (page du jeu › Détecteur de rythme).'));
    if (this.isReady) {
      this.sendStart(usable);
      return Promise.resolve();
    }
    return this.warmUp().then(() => this.sendStart(usable));
  }

  private sendStart(triggers: PixelTrigger[]): void {
    this.run++;
    this.runTriggers = triggers;
    this.worker?.stdin.write(`${startTriggerCommand(this.run, triggers, this.options.toScreenPoint)}\n`);
    this.update({ running: true, paused: false, error: null, hits: {}, frameMs: null });
  }

  stop(): void {
    if (!this.status.running) return;
    this.worker?.stdin.write('stop\n');
    this.update({ running: false, paused: false });
  }

  /** Synchrone quand le worker est prêt (voir start). */
  toggle(triggers: PixelTrigger[]): Promise<void> {
    if (this.status.running) {
      this.stop();
      return Promise.resolve();
    }
    return this.start(triggers);
  }

  /** Zones modifiées pendant la surveillance : on repart avec les nouvelles. */
  restartIfRunning(triggers: PixelTrigger[]): void {
    if (!this.status.running || !this.isReady) return;
    const usable = activeTriggers(triggers);
    if (usable.length === 0) this.stop();
    else this.sendStart(usable);
  }

  setGameDirs(dirs: string[]): void {
    if (this.worker) this.worker.stdin.write(`${dirsCommand(dirs)}\n`);
  }

  /** Couleur (#rrggbb) du pixel sous un point en coordonnées Electron. */
  async sampleColor(point: { x: number; y: number }): Promise<string> {
    await this.warmUp();
    const physical = this.options.toScreenPoint(point);
    const id = ++this.samples;
    const color = await new Promise<string>(resolve => {
      this.pendingSamples.set(id, resolve);
      this.worker?.stdin.write(`sample ${id} ${Math.round(physical.x)} ${Math.round(physical.y)}\n`);
    });
    if (!color) throw new Error('Lecture de la couleur impossible.');
    return color;
  }

  async captureTarget(point: { x: number; y: number }): Promise<PixelTarget> {
    return { x: Math.round(point.x), y: Math.round(point.y), color: await this.sampleColor(point) };
  }

  dispose(): void {
    const worker = this.worker;
    this.worker = null;
    this.ready = null;
    this.isReady = false;
    for (const resolve of this.pendingSamples.values()) resolve('');
    this.pendingSamples.clear();
    if (worker) {
      worker.stdin.end();
      setTimeout(() => worker.kill(), 1000).unref();
    }
    if (this.status.running) this.update({ running: false, paused: false });
  }
}
