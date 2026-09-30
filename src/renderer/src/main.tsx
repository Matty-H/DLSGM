import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import OverlayApp from './components/Overlay/OverlayApp';
import ClickerHudApp from './components/ClickerHud/ClickerHudApp';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Élément racine #root introuvable dans index.html');
}

// Même renderer pour la fenêtre principale, l'overlay en jeu (Maj+Tab, route
// #overlay, src/main/overlay.ts) et le témoin de l'auto-clicker (route
// #clicker-hud, src/main/clicker-hud.ts).
const route = window.location.hash;
const Root = route === '#overlay' ? OverlayApp : route === '#clicker-hud' ? ClickerHudApp : App;

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
