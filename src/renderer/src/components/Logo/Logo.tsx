import { LOGO_HORIZONTAL, LOGO_SQUARE } from '../../../../shared/logo';
import { ICON_CORNER_RADIUS } from '../../../../shared/themes';

export interface LogoProps {
  /** `horizontal` pour les espaces larges, `square` pour l'icône ou les espaces étroits. */
  variant: 'horizontal' | 'square';
  /** Hauteur en px (la largeur suit les proportions). */
  height: number;
  /** Couleurs explicites (aperçus) ; par défaut celles du thème actif (variables CSS). */
  colors?: { dls: string; gm: string; background?: string; rounded?: boolean };
  className?: string;
}

/**
 * Logo DLSGM. Sans `colors.background`, lettres seules (le rectangle des SVG
 * d'origine n'est qu'un cadre) : c'est la forme pour l'interface sombre.
 */
export default function Logo({ variant, height, colors, className }: LogoProps) {
  const shape = variant === 'horizontal' ? LOGO_HORIZONTAL : LOGO_SQUARE;
  const box = colors?.background ? shape.viewBox : shape.tightViewBox;
  const width = (height * box[2]) / box[3];
  return (
    <svg viewBox={box.join(' ')} width={width} height={height} className={className} role="img" aria-label="DLSGM">
      {colors?.background && <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} rx={colors.rounded ? Math.min(box[2], box[3]) * ICON_CORNER_RADIUS : 0} fill={colors.background} />}
      <g fill={colors?.gm ?? 'var(--color-logo-gm)'}>
        {shape.gm.map(d => <path key={d} d={d} />)}
      </g>
      <g fill={colors?.dls ?? 'var(--color-logo-dls)'}>
        {shape.dls.map(d => <path key={d} d={d} />)}
      </g>
    </svg>
  );
}
