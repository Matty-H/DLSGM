/**
 * Flou des contenus adultes : une image d'œuvre est floutée si l'œuvre est
 * R18, que le flou est activé (Paramètres › Affichage) et qu'elle n'a pas été
 * révélée d'un clic pendant cette session. Même règle partout où une
 * jaquette ou une image d'exemple s'affiche (grille, accueil, page du jeu,
 * statistiques, liste de souhaits).
 */
export function isAdultBlurred(ageCategory: unknown, blurAdultContent: boolean, revealed: boolean): boolean {
  return ageCategory === 'R18' && blurAdultContent && !revealed;
}
