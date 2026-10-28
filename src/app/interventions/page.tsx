import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { BadgeStatut } from '@/components/BadgeStatut';
import { ExplicationPriorite, type DetailPriorite } from '@/components/ExplicationPriorite';
import { Alerte } from '@/components/formulaire';
import { Icone } from '@/components/Icone';
import { IconeCategorie } from '@/components/IconeCategorie';
import { SqueletteListe } from '@/components/Squelette';
import { exigerUtilisateur } from '@/lib/auth';
import { CATEGORIES, type Categorie, type Statut } from '@/lib/domaine';
import type { Niveau } from '@/lib/filtres';
import { date } from '@/lib/format';
import { creerClientServeur } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Mes interventions' };

type Ligne = {
  id: string; titre: string; categorie: Categorie; statut: Statut; zone_nom: string | null; adresse: string | null;
  priorite_suggeree: Niveau | null; priorite_validee: Niveau | null; detail_score: DetailPriorite;
  created_at: string; latitude: number; longitude: number;
};

const A_FAIRE: Statut[] = ['affecte', 'en_cours'];
const TERMINEES: Statut[] = ['resolu', 'cloture'];

async function Liste({ searchParams }: Pick<PageProps<'/interventions'>, 'searchParams'>) {
  const utilisateur = await exigerUtilisateur(['agent']);
  const terminees = (await searchParams).onglet === 'terminees';
  const supabase = await creerClientServeur();

  // Mes interventions actives (une réaffectation les retire de ma liste).
  const { data: miennes, error: erreurInterventions } = await supabase
    .from('interventions').select('signalement_id').eq('agent_id', utilisateur.id).eq('active', true);
  const ids = (miennes ?? []).map((m) => m.signalement_id as string);

  // À faire : priorité puis ancienneté (le plus ancien d'abord). Terminées : les plus récentes d'abord.
  let requete = supabase
    .from('signalements_gestion')
    .select('id, titre, categorie, statut, zone_nom, adresse, priorite_suggeree, priorite_validee, detail_score, created_at, latitude, longitude')
    .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    .in('statut', terminees ? TERMINEES : A_FAIRE);
  requete = terminees
    ? requete.order('resolu_le', { ascending: false, nullsFirst: false })
    : requete.order('rang_priorite', { ascending: false }).order('created_at', { ascending: true });
  const { data, error } = await requete.returns<Ligne[]>();

  if (erreurInterventions || error) return <Alerte>Impossible de charger vos interventions. Rechargez la page.</Alerte>;

  const onglet = (actif: boolean) =>
    `flex-1 rounded-lg px-3 py-2.5 text-center text-sm font-semibold ${actif ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600'}`;

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 rounded-xl bg-slate-100 p-1" aria-label="Onglets">
        <Link href="/interventions" className={onglet(!terminees)} aria-current={!terminees ? 'page' : undefined}>À faire</Link>
        <Link href="/interventions?onglet=terminees" className={onglet(terminees)} aria-current={terminees ? 'page' : undefined}>Terminées</Link>
      </nav>

      {data.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-slate-600 ring-1 ring-slate-200">
          {terminees ? 'Aucune intervention terminée pour l\'instant.' : 'Aucune intervention à réaliser. Bon travail !'}
        </p>
      ) : (
        <ul className="space-y-3">
          {data.map((s) => (
            <li key={s.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
              <Link href={`/signalements/${s.id}`} className="block space-y-2 p-4 hover:bg-slate-50">
                <div className="flex items-start gap-3">
                  <IconeCategorie categorie={s.categorie} taille={44} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-lg leading-snug font-semibold text-slate-900">{s.titre}</p>
                    <BadgeStatut statut={s.statut} />
                  </div>
                </div>
                <p className="text-sm text-slate-600">
                  {[s.adresse, s.zone_nom].filter(Boolean).join(' · ') || CATEGORIES[s.categorie].libelle}
                </p>
                <p className="text-xs text-slate-500">Signalé le {date(s.created_at)}</p>
              </Link>
              <div className="px-4 pb-3">
                <ExplicationPriorite detail={s.detail_score} suggeree={s.priorite_suggeree} validee={s.priorite_validee} compact />
              </div>
              {!terminees && (
                <div className="grid grid-cols-2 border-t border-slate-100">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 py-3.5 text-sm font-semibold text-marque-700 hover:bg-marque-50"
                  >
                    <Icone nom="carte" taille={18} /> Itinéraire
                  </a>
                  <Link
                    href={`/signalements/${s.id}`}
                    className="flex items-center justify-center border-l border-slate-100 py-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    {s.statut === 'affecte' ? 'Démarrer' : 'Terminer'}
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PageInterventions({ searchParams }: PageProps<'/interventions'>) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Mes interventions</h1>
      <Suspense fallback={<SqueletteListe />}>
        <Liste searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
