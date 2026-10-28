// Barres horizontales pour une répartition (une barre par entité, valeur affichée en bout de barre).
// Couleur = identité de l'entité (catégorie) ou teinte unique ; textes toujours en encre neutre.

export type Barre = { cle: string; libelle: string; valeur: number; couleur: string };

export function BarresHorizontales({ titre, barres, total }: { titre: string; barres: Barre[]; total: number }) {
  const max = Math.max(1, ...barres.map((b) => b.valeur));
  return (
    <figure className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <figcaption className="text-sm font-semibold text-slate-800">{titre}</figcaption>
      {barres.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune donnée.</p>
      ) : (
        <ul className="space-y-2">
          {barres.map((b) => {
            const part = total ? Math.round((b.valeur / total) * 100) : 0;
            return (
              <li
                key={b.cle}
                className="group grid grid-cols-[7.5rem_1fr] items-center gap-3"
                title={`${b.libelle} : ${b.valeur} signalement${b.valeur > 1 ? 's' : ''} (${part} %)`}
              >
                <span className="truncate text-sm text-slate-700">{b.libelle}</span>
                <span className="flex items-center gap-2">
                  <span
                    className="h-4 min-w-0.5 rounded-r group-hover:opacity-80"
                    style={{ width: `${(b.valeur / max) * 85}%`, backgroundColor: b.couleur }}
                  />
                  <span className="text-sm font-medium text-slate-800 tabular-nums">{b.valeur}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}
