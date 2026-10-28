import { BadgePriorite } from '@/components/BadgePriorite';
import { NIVEAUX, type Niveau } from '@/lib/filtres';
import { dateHeure } from '@/lib/format';

// Détail stocké par la base (public.calculer_priorite, version 2).
export type CriterePriorite = {
  code: string; points: number; max?: number;
  critere?: string; explication?: string;
  libelle?: string;   // ancien format (version 1)
};
export type DetailPriorite = {
  version?: number; total?: number; max?: number; niveau?: Niveau;
  criteres?: CriterePriorite[]; calcule_le?: string;
} | null;

// Badge de priorité + « Pourquoi cette priorité ? » : chaque critère, ses points et son explication.
// compact : replié par défaut (listes) ; sinon ouvert (fiche du signalement).
export function ExplicationPriorite({
  detail, suggeree, validee, compact = false,
}: {
  detail: DetailPriorite;
  suggeree: Niveau | null;
  validee: Niveau | null;
  compact?: boolean;
}) {
  const niveau = validee ?? suggeree;
  if (!detail?.criteres?.length) return <BadgePriorite niveau={niveau} validee={Boolean(validee)} />;

  return (
    <details open={!compact} className={`group ${compact ? '' : 'rounded-lg bg-slate-50 p-3'}`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 text-sm [&::-webkit-details-marker]:hidden">
        <BadgePriorite niveau={niveau} validee={Boolean(validee)} />
        {!compact && <span className="text-slate-500">score {detail.total} / {detail.max ?? 9}</span>}
        <span className="text-xs font-semibold text-marque-700 underline decoration-dotted underline-offset-2">
          {compact ? 'Pourquoi ?' : 'Pourquoi cette priorité ?'}
        </span>
      </summary>

      <div className={`space-y-2 ${compact ? 'mt-2 min-w-64 rounded-lg bg-slate-50 p-2.5' : 'mt-3'}`}>
        <ul className="space-y-1.5 text-sm">
          {detail.criteres.map((c) => (
            <li key={c.code} className="flex justify-between gap-3">
              <span className={c.points ? 'text-slate-800' : 'text-slate-500'}>
                <span className="font-medium">{c.critere ?? c.libelle}</span>
                {c.explication && <span className="block text-xs text-slate-500">{c.explication}</span>}
              </span>
              <span className={`shrink-0 font-semibold tabular-nums ${c.points ? 'text-slate-900' : 'text-slate-400'}`}>
                +{c.points}{c.max !== undefined && <span className="font-normal text-slate-400"> / {c.max}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-slate-200 pt-2 text-xs text-slate-600">
          Total {detail.total} pt{(detail.total ?? 0) > 1 ? 's' : ''} → suggérée
          {suggeree ? ` « ${NIVEAUX[suggeree].libelle} »` : ''} (≥ 6 Haute · 4–5 Moyenne · ≤ 3 Basse).
          {validee
            ? ` Validée « ${NIVEAUX[validee].libelle} » par un responsable${validee !== suggeree ? ' (modifiée)' : ''}.`
            : ' Pas encore validée par un responsable.'}
          {detail.calcule_le && <span className="text-slate-400"> Calcul du {dateHeure(detail.calcule_le)}.</span>}
        </p>
      </div>
    </details>
  );
}
