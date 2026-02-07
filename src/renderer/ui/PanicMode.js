// src/renderer/ui/PanicMode.js

const { ipcRenderer } = require('electron');

/**
 * Composant pour gérer le mode panique (Alt+Space)
 * Affiche une page Wikipedia aléatoire pour masquer rapidement l'application
 */
class PanicMode {
  constructor() {
    this.isActive = false;
    this.originalTitle = document.title;
    this.lastPressTime = 0;

    this.createUI();
    this.setupEventListeners();
  }

  /**
   * Crée les éléments UI pour le mode panique
   */
  createUI() {
    // Overlay blanc avec animation de chargement
    this.panicOverlay = document.createElement('div');
    Object.assign(this.panicOverlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'white',
      zIndex: '9998',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column'
    });

    this.panicOverlay.innerHTML = `
      <div style="text-align: center;">
        <div style="display: inline-block; width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <p style="margin-top: 15px; font-family: Arial, sans-serif; color: #333; font-size: 16px;"><b>Loading, please wait...</b></p>
        <p style="margin-top: 15px; font-family: Arial, sans-serif; color: #333; font-size: 10px;"><i>(Alt+Space to close)</i></p>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;

    document.body.appendChild(this.panicOverlay);

    // Iframe pour afficher Wikipedia
    this.panicIframe = document.createElement('iframe');
    Object.assign(this.panicIframe.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      border: 'none',
      zIndex: '9999',
      display: 'none'
    });

    document.body.appendChild(this.panicIframe);

    // Masquer l'overlay au démarrage
    this.panicOverlay.style.display = 'none';
  }

  /**
   * Configure les écouteurs d'événements
   */
  setupEventListeners() {
    // Écouter le raccourci global via IPC
    ipcRenderer.on('panic-button-triggered', () => {
      this.toggle();
    });

    // Écouter le double appui sur espace (fallback pour navigateur)
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space') {
        const currentTime = new Date().getTime();
        if (currentTime - this.lastPressTime < 300) {
          this.toggle();
        }
        this.lastPressTime = currentTime;
      }
    });
  }

  /**
   * Active le mode panique
   */
  activate() {
    this.isActive = true;
    const delay = 500;

    // Changer le titre
    document.title = 'Wikipedia - The Free Encyclopedia';
    document.body.classList.add('panic-mode');

    // Afficher l'overlay
    this.panicOverlay.style.display = 'flex';

    // Charger Wikipedia après un délai
    setTimeout(() => {
      this.panicIframe.style.display = 'block';
      this.panicIframe.src = 'https://fr.wikipedia.org/wiki/Special:Random';

      this.panicIframe.onload = () => {
        this.panicOverlay.style.display = 'none';
      };
    }, delay);
  }

  /**
   * Désactive le mode panique
   */
  deactivate() {
    this.isActive = false;
    const delay = 500;

    document.body.classList.remove('panic-mode');
    this.panicOverlay.style.display = 'flex';

    setTimeout(() => {
      this.panicIframe.src = 'about:blank';
      this.panicIframe.style.display = 'none';
      document.title = this.originalTitle;
      this.panicOverlay.style.display = 'none';
    }, delay);
  }

  /**
   * Bascule le mode panique
   */
  toggle() {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }
}

module.exports = PanicMode;
