/**
 * Version et DLC lus dans les noms d'archives ou de dossiers (voir
 * src/main/release-names.ts), en libellé court : « v1.2 · DLC inclus ».
 */
export function releaseLabel(release: { version?: string | null; dlc?: boolean }): string {
  const parts: string[] = [];
  if (release.version) parts.push(`v${release.version}`);
  if (release.dlc) parts.push('DLC inclus');
  return parts.join(' · ');
}
