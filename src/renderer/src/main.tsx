import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import OverlayApp from './components/Overlay/OverlayApp';
import ClickerHudApp from './components/ClickerHud/ClickerHudApp';
import TriggerHudApp from './components/ClickerHud/TriggerHudApp';
import TriggerZonesApp from './components/ClickerHud/TriggerZonesApp';
import MacroHudApp from './components/ClickerHud/MacroHudApp';
import OcrViewApp from './components/OcrView/OcrViewApp';
import LockScreen from './components/LockScreen/LockScreen';
import { getUiLanguage, resolveUiLanguage, setUiLanguage } from './lib/i18n.js';
import { initActiveTheme } from './hooks/activeTheme';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Élément racine #root introuvable dans index.html');
}

// Même renderer pour la fenêtre principale, l'overlay en jeu (Maj+Tab, route
// #overlay, src/main/overlay.ts) et le témoin de l'auto-clicker (route
// #clicker-hud, src/main/clicker-hud.ts) celui du détecteur de rythme (#trigger-hud) et ses zones (#trigger-zones).
const route = window.location.hash;
const Root = route === '#overlay' ? OverlayApp : route === '#clicker-hud' ? ClickerHudApp : route === '#trigger-hud' ? TriggerHudApp : route === '#trigger-zones' ? TriggerZonesApp : route === '#macro-hud' ? MacroHudApp : route === '#ocr-view' ? OcrViewApp : route === '#lock' ? LockScreen : App;

// Langue de l'interface fixée avant le premier rendu, dans chaque fenêtre.
async function initLanguage(): Promise<void> {
  try {
    // Écran de verrouillage : les réglages ne sont pas encore ouverts (src/main/app-lock.ts).
    if (Root === LockScreen) {
      const info = await window.electronAPI.getLockScreen();
      setUiLanguage(resolveUiLanguage(info.uiLanguage, info.systemLanguages));
      document.documentElement.lang = getUiLanguage();
      return;
    }
    const [settings, systemLanguages] = await Promise.all([
      window.electronAPI.getSettings(),
      window.electronAPI.getSystemLanguages()
    ]);
    setUiLanguage(resolveUiLanguage(settings?.uiLanguage, systemLanguages));
  } catch {
    setUiLanguage(resolveUiLanguage(undefined, navigator.languages));
  }
  document.documentElement.lang = getUiLanguage();
}

// Thème de couleur (le même dans toutes les fenêtres, tiré par main) ; seule
// la fenêtre principale dessine l'icône de l'application à ses couleurs.
Promise.allSettled([initLanguage(), initActiveTheme(Root === App)]).finally(() => {
  createRoot(container).render(
    <StrictMode>
      <Root />
    </StrictMode>
  );
});
