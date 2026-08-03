import { categoryMap } from '../../lib/metadataManager.js';

const GAME_CATEGORIES = ['RPG', 'ADV', 'PZL', 'STG', 'SLN', 'TBL', 'TYP', 'ACN', 'QIZ', 'ETC'];
const MANGA_CATEGORIES = ['MNG', 'SCM', 'WBT'];
const VOICE_CATEGORIES = ['SOU', 'VCM'];
const VIDEO_CATEGORIES = ['MOV'];
const MUSIC_CATEGORIES = ['MUS', 'AMT'];
const IMAGE_CATEGORIES = ['ICG', 'IMT'];
const NOVEL_CATEGORIES = ['NRE', 'DNV'];
const TOOL_CATEGORIES = ['TOL'];

/** Couleurs de badge par famille de catégorie DLsite, reprises de l'ancien modern.css. */
function getCategoryStyle(category: string | undefined): string {
  if (category && GAME_CATEGORIES.includes(category)) return 'bg-[#00a1e9] border-[#0081bb] text-white';
  if (category && MANGA_CATEGORIES.includes(category)) return 'bg-[#f00078] border-[#c00060] text-white';
  if (category && VOICE_CATEGORIES.includes(category)) return 'bg-[#f39800] border-[#c27a00] text-white';
  if (category && VIDEO_CATEGORIES.includes(category)) return 'bg-[#a165a7] border-[#815185] text-white';
  if (category && MUSIC_CATEGORIES.includes(category)) return 'bg-[#ffc000] border-[#cc9a00] text-black';
  if (category && IMAGE_CATEGORIES.includes(category)) return 'bg-[#00b0f0] border-[#008cc0] text-white';
  if (category && NOVEL_CATEGORIES.includes(category)) return 'bg-[#5b9bd5] border-[#497cab] text-white';
  if (category && TOOL_CATEGORIES.includes(category)) return 'bg-[#70ad47] border-[#5a8a39] text-white';
  return 'bg-[#a5a5a5] border-[#848484] text-white';
}

export interface CategoryBadgeProps {
  category?: string;
}

export default function CategoryBadge({ category }: CategoryBadgeProps) {
  const label = category ? (categoryMap as Record<string, string>)[category] || 'Inconnu' : 'Inconnu';

  return (
    <div
      className={`rounded-xl border px-2.5 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide shadow-sm backdrop-blur-sm ${getCategoryStyle(
        category
      )}`}
    >
      {label}
    </div>
  );
}
