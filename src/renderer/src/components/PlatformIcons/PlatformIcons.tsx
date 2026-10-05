import { Apple } from 'lucide-react';
import type { OsPlatform } from '../../../../shared/platforms';
import { PLATFORM_LABELS } from '../../lib/platforms.js';
import { t, tr } from '../../lib/i18n.js';

function PlatformGlyph({ platform, size }: { platform: OsPlatform; size: number }) {
  if (platform === 'mac') return <Apple size={size} strokeWidth={2.25} aria-hidden />;
  if (platform === 'windows') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <rect x="1" y="1" width="6.5" height="6.5" />
        <rect x="8.5" y="1" width="6.5" height="6.5" />
        <rect x="1" y="8.5" width="6.5" height="6.5" />
        <rect x="8.5" y="8.5" width="6.5" height="6.5" />
      </svg>
    );
  }
  // Android : tête du robot (demi-disque, antennes, yeux).
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M1.5 13 A6.5 6.5 0 0 1 14.5 13 Z" fill="currentColor" />
      <path d="M4.2 4.6 L2.8 2.4 M11.8 4.6 L13.2 2.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="5.3" cy="9.6" r="0.9" fill="var(--color-bg, #000)" />
      <circle cx="10.7" cy="9.6" r="0.9" fill="var(--color-bg, #000)" />
    </svg>
  );
}

/**
 * Plateformes dont une version est dans le dossier du jeu (fichiers .exe,
 * .app/.dmg, .apk), à côté du titre sur la page du jeu.
 */
export default function PlatformIcons({ platforms }: { platforms: OsPlatform[] }) {
  if (platforms.length === 0) return null;
  return (
    <>
      {platforms.map(platform => (
        <span
          key={platform}
          className="tag gap-1 bg-black/50"
          title={t('Version {platform} présente dans le dossier du jeu', { platform: tr(PLATFORM_LABELS[platform]) })}
        >
          <PlatformGlyph platform={platform} size={13} />
          {tr(PLATFORM_LABELS[platform])}
        </span>
      ))}
    </>
  );
}
