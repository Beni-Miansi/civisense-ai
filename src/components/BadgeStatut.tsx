import { STATUTS, type Statut } from '@/lib/domaine';

export function BadgeStatut({ statut, className = '' }: { statut: Statut; className?: string }) {
  const { libelle, classes } = STATUTS[statut];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${classes} ${className}`}
    >
      {libelle}
    </span>
  );
}
