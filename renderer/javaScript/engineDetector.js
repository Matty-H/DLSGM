const { spawn } = require('child_process');
const path = require('path');

export function detectGameEngine(gameId, gameDir = './games') {
  return new Promise((resolve, reject) => {
    console.log('Paramètres reçus ->');
    console.log('gameId:', gameId);
    console.log('gameDir (destinationFolder):', gameDir);

    if (!gameId || !gameDir) {
      console.error('gameId ou gameDir manquant !');
      reject(new Error('gameId ou gameDir manquant !'));
      return;
    }

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    // Dossier complet du jeu à analyser
    const gamePath = path.resolve(path.join(gameDir, gameId));
    console.log('Chemin complet du jeu:', gamePath);

    // Chemin absolu vers le script Python
    const scriptPath = path.resolve(__dirname, 'pythonScript', 'engine_detector.py');
    console.log('Chemin complet du script Python:', scriptPath);

    const args = ['-d', gamePath, '-v']; // On passe le chemin du répertoire et l'option -v pour la sortie détaillée

    console.log(`Exécution: ${pythonCmd} ${args.join(' ')}`);

    const child = spawn(pythonCmd, [scriptPath, ...args]);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      console.log(`Process terminé avec le code ${code}`);

      if (stderr) {
        console.warn(`stderr: ${stderr}`);
      }

      if (code !== 0) {
        reject(new Error(`Le script Python a échoué avec le code ${code}\nStderr: ${stderr}`));
        return;
      }

      const match = stdout.match(/^(.+?) \(([^)]+)\)/);

      if (match) {
        resolve({
          gameId: gameId,
          engineType: match[2].trim(),
        });
      } else {
        resolve({ gameId, engineType: 'Unknown' });
      }
    });

    child.on('error', (err) => {
      console.error('Erreur de spawn:', err);
      reject(err);
    });
  });
}
