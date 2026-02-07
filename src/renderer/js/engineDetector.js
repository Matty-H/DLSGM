/**
 * Détecte le moteur de jeu utilisé en utilisant le script Python.
 */

/**
 * Détecte le moteur d'un jeu.
 */
export async function detectGameEngine(gameId, gameDir) {
  try {
    if (!gameId || !gameDir) {
      throw new Error('gameId ou gameDir manquant !');
    }

    const gamePath = await window.electronAPI.pathJoin(gameDir, gameId);
    console.log('Analyse du moteur pour :', gamePath);

    const stdout = await window.electronAPI.runPythonScript('engine_detector.py', [gamePath]);

    // Le script affiche les résultats sur plusieurs lignes, on cherche la ligne "DÉTECTÉ: ..."
    const match = stdout.match(/DÉTECTÉ: (.+)/);
    const engineType = match ? match[1].trim() : 'Inconnu';

    return { gameId, engineType };
  } catch (error) {
    console.error('Erreur lors de la détection du moteur:', error);
    return { gameId, engineType: 'Erreur' };
  }
}
