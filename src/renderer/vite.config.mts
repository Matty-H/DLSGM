import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * CSP du build (pas en dev : le rechargement à chaud de Vite injecte des
 * scripts en ligne). Aucun script hors des fichiers de l'app : même si du
 * contenu extérieur (fiche DLsite, nom de fichier) finissait interprété
 * comme du HTML, il ne pourrait rien exécuter ni appeler l'IPC. Images :
 * cache local (atom:), aperçus (blob:, data:) ; seule page externe :
 * Wikipédia, en iframe, pour le bouton panique.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' atom: data: blob:",
  "media-src 'self' atom: blob:",
  "connect-src 'self' atom:",
  'frame-src https://*.wikipedia.org',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'dlsgm-csp',
    apply: 'build',
    transformIndexHtml: html => html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
  };
}

export default defineConfig({
  root: __dirname,
  // Chemins d'assets relatifs : le build de production est chargé via
  // `loadFile` (protocole file://), où des chemins absolus ("/assets/...")
  // ne se résolvent pas vers le dossier dist et échouent silencieusement.
  base: './',
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
