import { useEffect, useRef, useState } from 'react';
import { detectPadType, type PadType } from '../lib/gamepadLayout.js';

/** Boutons de la disposition "standard" de l'API Gamepad (positionnels : A = bouton du bas). */
const BUTTON = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  MENU: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15
} as const;

type Direction = 'up' | 'down' | 'left' | 'right';

const STICK_DEADZONE = 0.5;
const SCROLL_DEADZONE = 0.2;
const SCROLL_SPEED_PX = 22;
// Répétition d'une direction maintenue, comme dans les menus SteamOS.
const REPEAT_DELAY_MS = 380;
const REPEAT_INTERVAL_MS = 110;

const FOCUSABLE = [
  'button:not(:disabled)',
  'a[href]',
  'input:not([type="hidden"]):not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export interface GamepadNavigationOptions {
  /** Désactive la manette (ex: mode panique actif). */
  enabled: boolean;
  onBack: () => void;
  /** LB / RB. */
  onShoulder: (delta: -1 | 1) => void;
  /** LT / RT. */
  onTrigger: (delta: -1 | 1) => void;
  onSearch: () => void;
  onToggleFullscreen: () => void;
}

export interface GamepadState {
  /** Famille de la dernière manette utilisée, `null` si le dernier périphérique utilisé est la souris. */
  padType: PadType | null;
  /** Le focus est dans une liste déroulante ouverte (haut/bas = option, A = choisir, B = fermer). */
  inPopup: boolean;
}

/**
 * Racine de navigation courante : la page de jeu superposée si elle est
 * ouverte (`data-nav-scope`), sinon tout le document — la manette ne doit
 * pas pouvoir atteindre la grille cachée sous la page de jeu.
 */
function navScope(): HTMLElement {
  const scopes = document.querySelectorAll<HTMLElement>('[data-nav-scope]');
  return scopes.length > 0 ? scopes[scopes.length - 1] : document.body;
}

function focusableIn(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => {
    if (el.closest('[inert]')) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

function focusElement(el: HTMLElement) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

/** Élément par défaut d'une racine : `data-nav-default` (bouton Jouer, jaquette ciblée), sinon le premier. */
function focusDefault(scope: HTMLElement) {
  const preferred = scope.querySelector<HTMLElement>('[data-nav-default]');
  const target = preferred ?? focusableIn(scope)[0];
  if (target) focusElement(target);
}

/** Écart entre deux intervalles (0 s'ils se chevauchent). */
const gap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => Math.max(0, bStart - aEnd, aStart - bEnd);

/**
 * Navigation spatiale : l'élément focalisable le plus proche dans la
 * direction demandée, en favorisant ceux alignés avec l'élément courant.
 */
export function moveFocus(direction: Direction) {
  const scope = navScope();
  const current = document.activeElement as HTMLElement | null;
  if (!current || current === document.body || !scope.contains(current)) {
    focusDefault(scope);
    return;
  }

  const from = current.getBoundingClientRect();
  const fromX = from.left + from.width / 2;
  const fromY = from.top + from.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const candidate of focusableIn(scope)) {
    if (candidate === current || candidate.contains(current) || current.contains(candidate)) continue;
    const to = candidate.getBoundingClientRect();
    const toX = to.left + to.width / 2;
    const toY = to.top + to.height / 2;

    let primary: number;
    let orthogonal: number;
    let centerOffset: number;
    if (direction === 'left' || direction === 'right') {
      const valid = direction === 'right' ? toX > fromX + 1 && to.right > from.right : toX < fromX - 1 && to.left < from.left;
      if (!valid) continue;
      primary = direction === 'right' ? Math.max(0, to.left - from.right) : Math.max(0, from.left - to.right);
      orthogonal = gap(from.top, from.bottom, to.top, to.bottom);
      centerOffset = Math.abs(toY - fromY);
    } else {
      const valid = direction === 'down' ? toY > fromY + 1 && to.bottom > from.bottom : toY < fromY - 1 && to.top < from.top;
      if (!valid) continue;
      primary = direction === 'down' ? Math.max(0, to.top - from.bottom) : Math.max(0, from.top - to.bottom);
      orthogonal = gap(from.left, from.right, to.left, to.right);
      centerOffset = Math.abs(toX - fromX);
    }

    const score = primary + orthogonal * 3 + centerOffset * 0.1;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (best) focusElement(best);
}

/**
 * Liste déroulante ouverte (composant Select, `data-nav-popup`) contenant
 * le focus. Les <select> natifs ne sont pas utilisés : Chromium ne laisse
 * pas ouvrir leur liste depuis la manette.
 */
function focusedPopup(): HTMLElement | null {
  return (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-nav-popup]') ?? null;
}

/** Bouton A : active l'élément focalisé (ou place le focus s'il n'y en a pas). */
function activate() {
  const scope = navScope();
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body || !scope.contains(el)) {
    focusDefault(scope);
    return;
  }
  if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'file'].includes(el.type))) {
    return; // champ texte : la saisie se fait au clavier
  }
  // Jaquette floutée : le premier appui révèle, le suivant ouvre.
  const reveal = el.querySelector<HTMLElement>(':scope > [data-reveal]');
  (reveal ?? el).click();
}

/** Conteneur défilable le plus proche de l'élément focalisé, sinon la zone principale visible. */
function scrollTarget(): HTMLElement | null {
  let el = document.activeElement as HTMLElement | null;
  while (el && el !== document.body) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  const roots = document.querySelectorAll<HTMLElement>('[data-nav-scope], [data-scroll-root]');
  return roots.length > 0 ? roots[roots.length - 1] : null;
}

/**
 * Navigation à la manette façon SteamOS, via l'API Gamepad :
 * croix / stick gauche = déplacement du focus (navigation spatiale),
 * A = valider, B = retour, LB/RB et LT/RT = actions contextuelles (voir
 * App.tsx), Y = recherche, View = plein écran, stick droit = défilement.
 * Les boutons sont positionnels (A = bouton du bas, même sur PlayStation
 * ou Switch) ; seuls les libellés affichés changent selon `padType`.
 *
 * Tant que la manette est le dernier périphérique utilisé, l'attribut
 * `data-input="gamepad"` posé sur <html> affiche le focus (Chromium ne
 * considère pas un focus posé par script comme :focus-visible après un
 * clic souris) et `padType` indique quels symboles de boutons afficher.
 */
export function useGamepadNavigation(options: GamepadNavigationOptions): GamepadState {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [padType, setPadType] = useState<PadType | null>(null);
  const [inPopup, setInPopup] = useState(false);

  useEffect(() => {
    const setInput = (type: PadType | null) => {
      if (type) document.documentElement.dataset.input = 'gamepad';
      else delete document.documentElement.dataset.input;
      setPadType(prev => (prev === type ? prev : type));
    };

    const onPointer = () => setInput(null);
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('mousemove', onPointer);

    const previous: boolean[] = [];
    let previousPadIndex = -1;
    const heldSince: Partial<Record<Direction, number>> = {};
    const lastRepeat: Partial<Record<Direction, number>> = {};
    let frame = 0;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (!optionsRef.current.enabled || !document.hasFocus()) return;

      const popup = focusedPopup();
      setInPopup(prev => (prev === (popup !== null) ? prev : popup !== null));

      // Plusieurs manettes (ex: manette réelle + manette virtuelle Steam) :
      // on suit celle dont l'état a changé le plus récemment.
      let pad: Gamepad | null = null;
      for (const candidate of navigator.getGamepads()) {
        if (candidate?.connected && (!pad || candidate.timestamp > pad.timestamp)) pad = candidate;
      }
      if (!pad) return;
      // Changement de manette : ses boutons déjà enfoncés ne comptent pas comme de nouveaux appuis.
      if (pad.index !== previousPadIndex) {
        previousPadIndex = pad.index;
        pad.buttons.forEach((b, i) => (previous[i] = b.pressed));
      }

      const pressed = pad.buttons.map(b => b.pressed);
      const justPressed = (i: number) => pressed[i] && !previous[i];
      const [lx = 0, ly = 0, , ry = 0] = pad.axes;

      const directions: Record<Direction, boolean> = {
        up: pressed[BUTTON.UP] || ly < -STICK_DEADZONE,
        down: pressed[BUTTON.DOWN] || ly > STICK_DEADZONE,
        left: pressed[BUTTON.LEFT] || lx < -STICK_DEADZONE,
        right: pressed[BUTTON.RIGHT] || lx > STICK_DEADZONE
      };

      let used = pressed.some(Boolean) || Math.abs(ry) > SCROLL_DEADZONE;

      for (const direction of Object.keys(directions) as Direction[]) {
        if (!directions[direction]) {
          delete heldSince[direction];
          continue;
        }
        used = true;
        if (heldSince[direction] === undefined) {
          heldSince[direction] = now;
          lastRepeat[direction] = now;
          moveFocus(direction);
        } else if (now - heldSince[direction]! > REPEAT_DELAY_MS && now - lastRepeat[direction]! > REPEAT_INTERVAL_MS) {
          lastRepeat[direction] = now;
          moveFocus(direction);
        }
      }

      const opts = optionsRef.current;
      if (justPressed(BUTTON.A)) activate();
      if (Math.abs(ry) > SCROLL_DEADZONE) scrollTarget()?.scrollBy({ top: ry * SCROLL_SPEED_PX });

      if (popup) {
        // Liste déroulante ouverte : B la ferme (le composant Select gère
        // Échap et rend le focus à son champ) ; les autres raccourcis sont
        // ignorés pour ne pas changer d'onglet ou de catégorie derrière elle.
        if (justPressed(BUTTON.B)) {
          document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        }
      } else {
        if (justPressed(BUTTON.B)) {
          const el = document.activeElement as HTMLElement | null;
          if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.blur();
          else opts.onBack();
        }
        if (justPressed(BUTTON.LB)) opts.onShoulder(-1);
        if (justPressed(BUTTON.RB)) opts.onShoulder(1);
        if (justPressed(BUTTON.LT)) opts.onTrigger(-1);
        if (justPressed(BUTTON.RT)) opts.onTrigger(1);
        if (justPressed(BUTTON.Y)) opts.onSearch();
        if (justPressed(BUTTON.VIEW)) opts.onToggleFullscreen();
      }

      pressed.forEach((value, i) => (previous[i] = value));
      if (used) setInput(detectPadType(pad.id));
    };

    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('mousemove', onPointer);
      delete document.documentElement.dataset.input;
    };
  }, []);

  return { padType, inPopup };
}
