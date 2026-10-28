import { CATEGORIES, type Categorie } from '@/lib/domaine';

// Pastille ronde colorée avec le pictogramme de la catégorie (mêmes couleurs que les marqueurs de la carte).
export function IconeCategorie({ categorie, taille = 36 }: { categorie: Categorie; taille?: number }) {
  const { couleur, encre, icone, libelle } = CATEGORIES[categorie];
  return (
    <span
      role="img"
      aria-label={libelle}
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: couleur, color: encre ?? '#fff', width: taille, height: taille }}
    >
      <svg
        viewBox="0 0 24 24" width={taille * 0.55} height={taille * 0.55} fill="none" stroke="currentColor"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      >
        {icone.map((d) => <path key={d} d={d} />)}
      </svg>
    </span>
  );
}

export function LibelleCategorie({ categorie }: { categorie: Categorie }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: CATEGORIES[categorie].couleur }} />
      {CATEGORIES[categorie].libelle}
    </span>
  );
}
