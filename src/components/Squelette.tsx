// États de chargement affichés pendant que les données arrivent.

export function SqueletteListe({ lignes = 4 }: { lignes?: number }) {
  return (
    <ul className="space-y-3" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: lignes }, (_, i) => (
        <li key={i} className="h-20 animate-pulse rounded-xl bg-white ring-1 ring-slate-200" />
      ))}
    </ul>
  );
}

export function SqueletteBloc({ hauteur = 'h-64' }: { hauteur?: string }) {
  return <div className={`${hauteur} animate-pulse rounded-xl bg-slate-200/70`} aria-busy="true" aria-label="Chargement" />;
}
