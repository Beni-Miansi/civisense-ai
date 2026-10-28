import Link from 'next/link';
import { Alerte } from '@/components/formulaire';
import { IconeCategorie } from '@/components/IconeCategorie';
import { exigerUtilisateur } from '@/lib/auth';
import { CATEGORIES, type Categorie } from '@/lib/domaine';
import { date } from '@/lib/format';
import { creerClientServeur } from '@/lib/supabase/server';

type StatistiquesIA = {
  classification: { total: number; retenues: number; corrections: { suggeree: Categorie; retenue: Categorie; nb: number }[] };
  doublons: { suggeres: number; confirmes: number; soutiens: number; soutenus: number };
  priorite: { validees: number; confirmees: number; a_valider: number };
  recurrences: { zone: string; zone_id: string | null; categorie: Categorie; nb: number; ouverts: number; dernier: string }[];
};

const pourcentage = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)} %` : '—');

function Carte({ titre, valeur, legende, children }: { titre: string; valeur: string | number; legende: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-sm font-medium text-slate-600">{titre}</p>
      <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{valeur}</p>
      <p className="text-xs text-slate-500">{legende}</p>
      {children}
    </div>
  );
}

// Ce que fait l'IA, mesuré en direct (cahier des charges §4) : elle suggère, l'humain décide.
export async function AssistanceIA() {
  await exigerUtilisateur(['responsable', 'admin']);
  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc('statistiques_ia');
  if (error || !data) return <Alerte>Impossible de calculer les indicateurs de l&apos;assistance IA.</Alerte>;
  const { classification: c, doublons: d, priorite: p, recurrences } = data as StatistiquesIA;

  return (
    <section className="space-y-3 rounded-2xl bg-gradient-to-br from-violet-50 to-marque-50 p-4 ring-1 ring-violet-200 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">✨ Assistance IA</h2>
        <p className="text-sm text-slate-600">L&apos;IA suggère, l&apos;humain décide : chaque suggestion est vérifiée et ses erreurs sont mesurées.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Carte
          titre="Classification des signalements"
          valeur={pourcentage(c.retenues, c.total)}
          legende={`suggestions de catégorie retenues par les citoyens (${c.retenues} sur ${c.total})`}
        >
          {c.corrections.length > 0 && (
            <ul className="pt-1 text-xs text-slate-600">
              {c.corrections.slice(0, 3).map((x) => (
                <li key={`${x.suggeree}-${x.retenue}`}>
                  Corrigé : {CATEGORIES[x.suggeree].libelle} → {CATEGORIES[x.retenue].libelle} ({x.nb})
                </li>
              ))}
            </ul>
          )}
        </Carte>
        <Carte
          titre="Détection des doublons"
          valeur={d.suggeres}
          legende={`doublons possibles à vérifier · ${d.confirmes} confirmé${d.confirmes > 1 ? 's' : ''} par un responsable`}
        >
          <p className="pt-1 text-xs text-slate-600">
            {d.soutiens} « Moi aussi » sur {d.soutenus} signalement{d.soutenus > 1 ? 's' : ''} au lieu de nouveaux doublons
          </p>
        </Carte>
        <Carte
          titre="Priorité explicable"
          valeur={p.validees}
          legende={`priorités validées par un responsable : ${p.confirmees} confirmée${p.confirmees > 1 ? 's' : ''}, ${p.validees - p.confirmees} modifiée${p.validees - p.confirmees > 1 ? 's' : ''}`}
        >
          <Link href="/tableau-de-bord?statut=a_verifier" className="block pt-1 text-xs font-semibold text-marque-700 underline">
            {p.a_valider} suggestion{p.a_valider > 1 ? 's' : ''} en attente de validation
          </Link>
        </Carte>
      </div>

      <div className="space-y-2 rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <h3 className="text-sm font-medium text-slate-600">Problèmes récurrents (30 derniers jours, 3 signalements ou plus)</h3>
        {recurrences.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun problème récurrent détecté.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recurrences.map((r) => (
              <li key={`${r.zone}-${r.categorie}`}>
                <Link
                  href={`/tableau-de-bord?categorie=${r.categorie}${r.zone_id ? `&zone=${r.zone_id}` : ''}`}
                  className="flex items-center gap-3 py-2 hover:bg-slate-50"
                >
                  <IconeCategorie categorie={r.categorie} taille={28} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{r.zone} · {CATEGORIES[r.categorie].libelle}</span>
                    <span className="block text-xs text-slate-500">
                      {r.nb} signalements, dont {r.ouverts} non résolu{r.ouverts > 1 ? 's' : ''} · dernier le {date(r.dernier)}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-violet-800">Action préventive ?</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
