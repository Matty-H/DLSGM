/**
 * Option « Animations » (Paramètres › Affichage) : `data-animations="off"` sur
 * :root coupe les animations et transitions (fin de animations.css). Posé avant
 * le premier rendu de chaque fenêtre (main.tsx), puis par App à chaque
 * enregistrement des paramètres.
 */
export function applyAnimationsSetting(enabled: boolean): void {
  if (enabled) delete document.documentElement.dataset.animations;
  else document.documentElement.dataset.animations = 'off';
}

/** Pour ce que le CSS ne peut pas couper : défilement doux, boucles pilotées par script. */
export function animationsEnabled(): boolean {
  return document.documentElement.dataset.animations !== 'off';
}
