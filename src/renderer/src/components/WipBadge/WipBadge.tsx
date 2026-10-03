import { t } from '../../lib/i18n.js';

/** Pastille « WIP » : fonction en cours de développement, utilisable mais pas encore fiable. */
export default function WipBadge() {
  return (
    <span
      className="ml-1.5 inline-block rounded-sm bg-amber-400/15 px-1.5 py-0.5 align-middle text-[10px] font-bold tracking-wider text-amber-300"
      title={t('En cours de développement')}
    >
      WIP
    </span>
  );
}
