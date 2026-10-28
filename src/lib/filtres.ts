// Filtres du tableau de bord : lus depuis l'URL, validés, puis appliqués à une requête Supabase.
// Partagés par la liste, la carte et l'export CSV pour garantir le même résultat.
import { ORDRE_CATEGORIES, STATUTS, type Categorie, type Statut } from '@/lib/domaine';

export type Niveau = 'basse' | 'moyenne' | 'haute';
export type Tri = 'recent' | 'ancien' | 'priorite';

export type Filtres = {
  categorie?: Categorie;
  zone?: string;
  statut?: Statut;
  priorite?: Niveau;
  du?: string;         // AAAA-MM-JJ, inclus
  au?: string;         // AAAA-MM-JJ, inclus
  tri: Tri;
  page: number;
};

export const PAR_PAGE = 20;
export const NIVEAUX: Record<Niveau, { libelle: string; classes: string }> = {
  haute:   { libelle: 'Haute',   classes: 'bg-red-50 text-red-800 ring-red-300' },
  moyenne: { libelle: 'Moyenne', classes: 'bg-amber-50 text-amber-800 ring-amber-300' },
  basse:   { libelle: 'Basse',   classes: 'bg-slate-100 text-slate-700 ring-slate-300' },
};

type Parametres = Record<string, string | string[] | undefined>;
const lire = (p: Parametres, cle: string) => {
  const v = p[cle];
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
};
const estDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const estUuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

export function lireFiltres(p: Parametres): Filtres {
  const categorie = lire(p, 'categorie');
  const statut = lire(p, 'statut');
  const priorite = lire(p, 'priorite');
  const tri = lire(p, 'tri');
  const page = Number.parseInt(lire(p, 'page') ?? '1', 10);
  return {
    categorie: ORDRE_CATEGORIES.includes(categorie as Categorie) ? (categorie as Categorie) : undefined,
    zone: estUuid(lire(p, 'zone')),
    statut: statut && statut in STATUTS ? (statut as Statut) : undefined,
    priorite: priorite && priorite in NIVEAUX ? (priorite as Niveau) : undefined,
    du: estDate(lire(p, 'du')),
    au: estDate(lire(p, 'au')),
    tri: tri === 'ancien' || tri === 'priorite' ? tri : 'recent',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

// Paramètres d'URL correspondant aux filtres (sans la page), pour les liens et l'export.
export function versRecherche(f: Filtres, extra: Record<string, string | number> = {}) {
  const r = new URLSearchParams();
  for (const cle of ['categorie', 'zone', 'statut', 'priorite', 'du', 'au'] as const) {
    if (f[cle]) r.set(cle, f[cle]!);
  }
  if (f.tri !== 'recent') r.set('tri', f.tri);
  for (const [cle, valeur] of Object.entries(extra)) r.set(cle, String(valeur));
  return r.toString();
}

// Sous-ensemble des méthodes de filtre PostgREST utilisées ici.
type Filtrable = {
  eq(colonne: string, valeur: unknown): Filtrable;
  gte(colonne: string, valeur: unknown): Filtrable;
  lt(colonne: string, valeur: unknown): Filtrable;
  order(colonne: string, options: { ascending: boolean; nullsFirst?: boolean }): Filtrable;
};

// À appliquer sur la vue signalements_gestion (colonne « priorite » = priorité effective).
export function appliquerFiltres<Q>(requete: Q, f: Filtres): Q {
  let q = requete as unknown as Filtrable;
  if (f.categorie) q = q.eq('categorie', f.categorie);
  if (f.zone) q = q.eq('zone_id', f.zone);
  if (f.statut) q = q.eq('statut', f.statut);
  if (f.priorite) q = q.eq('priorite', f.priorite);
  if (f.du) q = q.gte('created_at', `${f.du}T00:00:00Z`);
  if (f.au) {
    const lendemain = new Date(`${f.au}T00:00:00Z`);
    lendemain.setUTCDate(lendemain.getUTCDate() + 1);
    q = q.lt('created_at', lendemain.toISOString());
  }
  if (f.tri === 'priorite') {
    q = q.order('rang_priorite', { ascending: false })
      .order('score_priorite', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
  } else {
    q = q.order('created_at', { ascending: f.tri === 'ancien' });
  }
  return q as unknown as Q;
}
