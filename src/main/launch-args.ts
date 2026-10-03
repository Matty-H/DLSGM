/**
 * Arguments de lancement d'un jeu (`-dx11`, `-screen-fullscreen 0`...),
 * saisis sur sa page (`launchArguments` dans la fiche) et passés à
 * l'exécutable quel que soit le mode de lancement (direct, Sandboxie,
 * Locale Emulator).
 */

export const MAX_LAUNCH_ARGUMENTS_LENGTH = 1024;

/**
 * Découpe une ligne d'arguments comme un shell Windows simple : les espaces
 * séparent, les guillemets doubles regroupent (`"C:\Mes jeux\x"`), `\"` est
 * un guillemet littéral. Rien d'autre n'est interprété : chaque argument est
 * ensuite passé tel quel au processus (jamais à un shell). Une valeur qui
 * n'est pas une chaîne raisonnable (trop longue, saut de ligne, NUL) ne
 * donne aucun argument.
 */
export function parseLaunchArguments(text: unknown): string[] {
  if (typeof text !== 'string' || text.length > MAX_LAUNCH_ARGUMENTS_LENGTH || /[\r\n\0]/.test(text)) return [];
  const args: string[] = [];
  let current = '';
  let started = false;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\\' && text[i + 1] === '"') {
      current += '"';
      started = true;
      i++;
    } else if (char === '"') {
      quoted = !quoted;
      started = true;
    } else if (/\s/.test(char) && !quoted) {
      if (started) args.push(current);
      current = '';
      started = false;
    } else {
      current += char;
      started = true;
    }
  }
  if (started) args.push(current);
  return args;
}

/**
 * Ligne de commande PowerShell (pour `-EncodedCommand`) qui lance un
 * exécutable en administrateur avec ses arguments : repli quand le jeu exige
 * l'élévation (l'invite UAC s'affiche). Chaque valeur est une chaîne
 * PowerShell entre apostrophes (apostrophes doublées), jamais interpolée.
 */
export function elevatedStartCommand(executablePath: string, workingDirectory: string, args: string[]): string {
  const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const argumentList = args.length > 0 ? ` -ArgumentList @(${args.map(a => literal(/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(', ')})` : '';
  return `Start-Process -FilePath ${literal(executablePath)} -WorkingDirectory ${literal(workingDirectory)}${argumentList} -Verb RunAs`;
}
