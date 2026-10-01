import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import OverlayApp from './components/Overlay/OverlayApp';
import ClickerHudApp from './components/ClickerHud/ClickerHudApp';
import TriggerHudApp from './components/ClickerHud/TriggerHudApp';
import TriggerZonesApp from './components/ClickerHud/TriggerZonesApp';
import MacroHudApp from './components/ClickerHud/MacroHudApp';
import OcrViewApp from './components/OcrView/OcrViewApp';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Élément racine #root introuvable dans index.html');
}

// Même renderer pour la fenêtre principale, l'overlay en jeu (Maj+Tab, route
// #overlay, src/main/overlay.ts) et le témoin de l'auto-clicker (route
// #clicker-hud, src/main/clicker-hud.ts) celui du détecteur de rythme (#trigger-hud) et ses zones (#trigger-zones).
const route = window.location.hash;
const Root = route === '#overlay' ? OverlayApp : route === '#clicker-hud' ? ClickerHudApp : route === '#trigger-hud' ? TriggerHudApp : route === '#trigger-zones' ? TriggerZonesApp : route === '#macro-hud' ? MacroHudApp : route === '#ocr-view' ? OcrViewApp : App;

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
