import { NIVEAUX, type Niveau } from '@/lib/filtres';

// Priorité effective ; « validée » indique la validation humaine du responsable.
export function BadgePriorite({ niveau, validee = false }: { niveau: Niveau | null; validee?: boolean }) {
  if (!niveau) return <span className="text-xs text-slate-400">—</span>;
  const { libelle, classes } = NIVEAUX[niveau];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${classes}`}>{libelle}</span>
      {validee && <span className="text-xs text-slate-500" title="Priorité validée par un responsable">✓ validée</span>}
    </span>
  );
}
