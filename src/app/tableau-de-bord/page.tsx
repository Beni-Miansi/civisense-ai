import type { Metadata } from 'next';
import Form from 'next/form';
import Link from 'next/link';
import { Suspense } from 'react';
import { BadgeDoublon } from '@/components/BadgeDoublon';
import { BadgeStatut } from '@/components/BadgeStatut';
import { BarresHorizontales } from '@/components/BarresHorizontales';
import { CarteSignalements } from '@/components/carte';
import { ExplicationPriorite, type DetailPriorite } from '@/components/ExplicationPriorite';
import { Alerte } from '@/components/formulaire';
import { IconeCategorie } from '@/components/IconeCategorie';
import { SqueletteBloc, SqueletteListe } from '@/components/Squelette';
import { exigerUtilisateur } from '@/lib/auth';
import { CATEGORIES, ORDRE_CATEGORIES, STATUTS, type Categorie, type PointCarte, type Statut } from '@/lib/domaine';
import { NIVEAUX, PAR_PAGE, appliquerFiltres, lireFiltres, versRecherche, type Filtres, type Niveau } from '@/lib/filtres';
import { date } from '@/lib/format';
import { creerClientServeur } from '@/lib/supabase/server';
import { AssistanceIA } from './AssistanceIA';

export const metadata: Metadata = { title: 'Tableau de bord' };

const GESTION = ['responsable', 'admin'] as const;

type Statistiques = {
  total: number; en_attente: number; a_affecter: number; en_cours: number; resolus: number; rejetes: number;
  delai_median_heures: number | null;
  par_categorie: { categorie: Categorie; nb: number }[];
  par_zone: { zone: string; nb: number }[];
};

type Ligne = {
  id: string; titre: string; categorie: Categorie; statut: Statut; zone_nom: string | null; adresse: string | null;
  priorite: Niveau | null; priorite_suggeree: Niveau | null; priorite_validee: Niveau | null; score_priorite: number | null;
  detail_score: DetailPriorite; doublon_possible: boolean; nb_soutiens: number;
  created_at: string; latitude: number; longitude: number;
};

const formatDelai = (h: number | null) =>
  h === null ? '—' : h < 48 ? `${Math.round(h)} h` : `${(h / 24).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`;

// ----------------------------------------------------------------------------- Synthèse

function Indicateur({ libelle, valeur, detail }: { libelle: string; valeur: string | number; detail?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-sm text-slate-600">{libelle}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{valeur}</p>
      {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

async function Synthese() {
  await exigerUtilisateur([...GESTION]);
  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc('statistiques_tableau_de_bord');
  if (error || !data) return <Alerte>Impossible de calculer les indicateurs. Rechargez la page.</Alerte>;
  const s = data as Statistiques;
  const actifs = s.total - s.rejetes;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicateur libelle="Signalements" valeur={s.total} detail={`dont ${s.rejetes} rejetés ou doublons`} />
        <Indicateur libelle="En attente" valeur={s.en_attente} detail={`+ ${s.a_affecter} validés à affecter`} />
        <Indicateur libelle="En cours" valeur={s.en_cours} detail="affectés ou en intervention" />
        <Indicateur
          libelle="Résolus / clôturés" valeur={s.resolus}
          detail={actifs ? `${Math.round((s.resolus / actifs) * 100)} % des signalements retenus` : undefined}
        />
        <Indicateur libelle="Délai médian de résolution" valeur={formatDelai(s.delai_median_heures)} detail="du signalement à la résolution" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <BarresHorizontales
          titre="Répartition par catégorie"
          total={actifs}
          barres={s.par_categorie.map((c) => ({
            cle: c.categorie, libelle: CATEGORIES[c.categorie].libelle, valeur: c.nb, couleur: CATEGORIES[c.categorie].couleur,
          }))}
        />
        <BarresHorizontales
          titre="Répartition par zone"
          total={actifs}
          barres={s.par_zone.map((z) => ({ cle: z.zone, libelle: z.zone, valeur: z.nb, couleur: 'var(--color-marque-600)' }))}
        />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------- Filtres

const classeSelect = 'w-full rounded-lg border-0 bg-white px-2.5 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-marque-600';

function BarreFiltres({ f, zones, vue }: { f: Filtres; zones: { id: string; nom: string }[]; vue: string }) {
  return (
    // La clé remonte le formulaire quand les filtres changent (« Réinitialiser » vide bien les champs).
    <div key={versRecherche(f)}>
      <Form action="/tableau-de-bord" className="grid grid-cols-2 gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200 sm:grid-cols-4 lg:grid-cols-8">
        <input type="hidden" name="vue" value={vue} />
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Catégorie
          <select name="categorie" defaultValue={f.categorie ?? ''} className={classeSelect}>
            <option value="">Toutes</option>
            {ORDRE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORIES[c].libelle}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Zone
          <select name="zone" defaultValue={f.zone ?? ''} className={classeSelect}>
            <option value="">Toutes</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Statut
          <select name="statut" defaultValue={f.statut ?? ''} className={classeSelect}>
            <option value="">Tous</option>
            {(Object.keys(STATUTS) as Statut[]).map((s) => <option key={s} value={s}>{STATUTS[s].libelle}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Priorité
          <select name="priorite" defaultValue={f.priorite ?? ''} className={classeSelect}>
            <option value="">Toutes</option>
            {(Object.keys(NIVEAUX) as Niveau[]).map((n) => <option key={n} value={n}>{NIVEAUX[n].libelle}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Du
          <input type="date" name="du" defaultValue={f.du ?? ''} className={classeSelect} />
        </label>
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Au
          <input type="date" name="au" defaultValue={f.au ?? ''} className={classeSelect} />
        </label>
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Tri
          <select name="tri" defaultValue={f.tri} className={classeSelect}>
            <option value="recent">Plus récents</option>
            <option value="ancien">Plus anciens</option>
            <option value="priorite">Priorité</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="flex-1 rounded-lg bg-marque-600 px-3 py-2 text-sm font-semibold text-white hover:bg-marque-700">
            Filtrer
          </button>
          <Link href={`/tableau-de-bord?vue=${vue}`} className="rounded-lg px-2 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100" title="Réinitialiser les filtres">
            ✕
          </Link>
        </div>
      </Form>
    </div>
  );
}

// ----------------------------------------------------------------------------- Liste / carte

function Tableau({ lignes }: { lignes: Ligne[] }) {
  if (!lignes.length) {
    return <p className="rounded-xl bg-white p-6 text-center text-slate-600 ring-1 ring-slate-200">Aucun signalement ne correspond à ces filtres.</p>;
  }
  return (
    <>
      {/* Mobile : cartes */}
      <ul className="space-y-2 md:hidden">
        {lignes.map((s) => (
          <li key={s.id} className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <Link href={`/signalements/${s.id}`} className="flex gap-3">
              <IconeCategorie categorie={s.categorie} taille={32} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold leading-snug">{s.titre}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <BadgeStatut statut={s.statut} />
                  {s.doublon_possible && <BadgeDoublon />}
                </div>
                <p className="text-xs text-slate-500">{s.zone_nom ?? 'Hors zone'} · {date(s.created_at)}</p>
              </div>
            </Link>
            <ExplicationPriorite detail={s.detail_score} suggeree={s.priorite_suggeree} validee={s.priorite_validee} compact />
          </li>
        ))}
      </ul>

      {/* Ordinateur : tableau */}
      <div className="hidden overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600 uppercase">
            <tr>
              <th className="px-3 py-2.5">Signalement</th>
              <th className="px-3 py-2.5">Zone</th>
              <th className="px-3 py-2.5">Statut</th>
              <th className="px-3 py-2.5">Priorité</th>
              <th className="px-3 py-2.5 text-right">Soutiens</th>
              <th className="px-3 py-2.5">Créé le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-3 py-2.5">
                  <Link href={`/signalements/${s.id}`} className="flex items-center gap-2.5 font-medium text-slate-900 hover:text-marque-700">
                    <IconeCategorie categorie={s.categorie} taille={28} />
                    <span className="line-clamp-2">{s.titre}</span>
                  </Link>
                  {s.doublon_possible && <div className="mt-1 pl-[38px]"><BadgeDoublon /></div>}
                </td>
                <td className="px-3 py-2.5 text-slate-600">{s.zone_nom ?? 'Hors zone'}</td>
                <td className="px-3 py-2.5"><BadgeStatut statut={s.statut} /></td>
                <td className="px-3 py-2.5 align-top">
                  <ExplicationPriorite detail={s.detail_score} suggeree={s.priorite_suggeree} validee={s.priorite_validee} compact />
                  {s.score_priorite !== null && <span className="text-xs text-slate-400">{s.score_priorite} pts</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{s.nb_soutiens}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{date(s.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function ListeFiltree({ searchParams }: Pick<PageProps<'/tableau-de-bord'>, 'searchParams'>) {
  await exigerUtilisateur([...GESTION]);
  const parametres = await searchParams;
  const f = lireFiltres(parametres);
  const vue = parametres.vue === 'carte' ? 'carte' : 'liste';
  const supabase = await creerClientServeur();

  // Critère d'ancienneté : remet à jour les scores périmés (ne réécrit que les lignes qui changent).
  await supabase.rpc('recalculer_priorites');

  const colonnes = 'id, titre, categorie, statut, zone_nom, adresse, priorite, priorite_suggeree, priorite_validee, score_priorite, detail_score, doublon_possible, nb_soutiens, created_at, latitude, longitude';
  let requete = appliquerFiltres(supabase.from('signalements_gestion').select(colonnes, { count: 'exact' }), f);
  requete = vue === 'liste' ? requete.range((f.page - 1) * PAR_PAGE, f.page * PAR_PAGE - 1) : requete.limit(1000);

  const [{ data: zones }, { data, count, error }] = await Promise.all([
    supabase.from('zones').select('id, nom').order('nom'),
    requete.returns<Ligne[]>(),
  ]);

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));
  const lien = (extra: Record<string, string | number>) => `/tableau-de-bord?${versRecherche(f, extra)}`;
  const onglet = (actif: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold ${actif ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`;

  return (
    <section className="space-y-3">
      <BarreFiltres f={f} zones={zones ?? []} vue={vue} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          <Link href={lien({ vue: 'liste' })} className={onglet(vue === 'liste')}>Liste</Link>
          <Link href={lien({ vue: 'carte' })} className={onglet(vue === 'carte')}>Carte</Link>
        </div>
        <p className="text-sm text-slate-600">{total} signalement{total > 1 ? 's' : ''}</p>
        <a
          href={`/tableau-de-bord/export?${versRecherche(f)}`}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-marque-700 ring-1 ring-marque-600 hover:bg-marque-50"
        >
          Exporter en CSV
        </a>
      </div>

      {error ? (
        <Alerte>Impossible de charger les signalements. Rechargez la page.</Alerte>
      ) : vue === 'carte' ? (
        <CarteSignalements
          points={(data ?? []).map((s): PointCarte => ({
            id: s.id, lat: s.latitude, lng: s.longitude, titre: s.titre, categorie: s.categorie, statut: s.statut,
            lien: `/signalements/${s.id}`, approximatif: false,
          }))}
        />
      ) : (
        <>
          <Tableau lignes={data ?? []} />
          {pages > 1 && (
            <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
              {f.page > 1 ? <Link href={lien({ page: f.page - 1 })} className="font-semibold text-marque-700">← Précédent</Link> : <span />}
              <span className="text-slate-600">Page {f.page} / {pages}</span>
              {f.page < pages ? <Link href={lien({ page: f.page + 1 })} className="font-semibold text-marque-700">Suivant →</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </section>
  );
}

export default function PageTableauDeBord({ searchParams }: PageProps<'/tableau-de-bord'>) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
      <Suspense fallback={<SqueletteBloc hauteur="h-72" />}>
        <Synthese />
      </Suspense>
      <Suspense fallback={<SqueletteBloc hauteur="h-56" />}>
        <AssistanceIA />
      </Suspense>
      <Suspense fallback={<SqueletteListe lignes={6} />}>
        <ListeFiltree searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
