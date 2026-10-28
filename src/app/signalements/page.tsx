import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { BadgeStatut } from '@/components/BadgeStatut';
import { Icone } from '@/components/Icone';
import { IconeCategorie } from '@/components/IconeCategorie';
import { Alerte } from '@/components/formulaire';
import { SqueletteListe } from '@/components/Squelette';
import { exigerUtilisateur } from '@/lib/auth';
import { CATEGORIES, type Categorie, type Statut } from '@/lib/domaine';
import { date } from '@/lib/format';
import { creerClientServeur } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Mes signalements' };

type LigneSignalement = {
  id: string;
  titre: string;
  categorie: Categorie;
  statut: Statut;
  created_at: string;
  nb_soutiens: number;
  zone: { nom: string } | null;
};

async function ListeSignalements() {
  const utilisateur = await exigerUtilisateur(['citoyen', 'agent']);
  const supabase = await creerClientServeur();
  const { data, error } = await supabase
    .from('signalements')
    .select('id, titre, categorie, statut, created_at, nb_soutiens, zone:zones(nom)')
    .eq('auteur_id', utilisateur.id)
    .order('created_at', { ascending: false })
    .returns<LigneSignalement[]>();

  if (error) return <Alerte>Impossible de charger vos signalements. Rechargez la page.</Alerte>;

  if (!data.length) {
    return (
      <div className="space-y-3 rounded-xl bg-white p-6 text-center ring-1 ring-slate-200">
        <p className="font-semibold">Vous n&apos;avez encore rien signalé.</p>
        <p className="text-sm text-slate-600">Un dépôt d&apos;ordures, un lampadaire éteint, un caniveau bouché&nbsp;?</p>
        <Link href="/signalements/nouveau" className="inline-block font-semibold text-marque-700 underline">
          Faire mon premier signalement
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {data.map((s) => (
        <li key={s.id}>
          <Link
            href={`/signalements/${s.id}`}
            className="flex items-start gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200 hover:ring-marque-500"
          >
            <IconeCategorie categorie={s.categorie} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold leading-snug text-slate-900">{s.titre}</p>
                <BadgeStatut statut={s.statut} />
              </div>
              <p className="text-sm text-slate-500">
                {CATEGORIES[s.categorie].libelle}
                {s.zone && ` · ${s.zone.nom}`} · {date(s.created_at)}
                {s.nb_soutiens > 0 && ` · ${s.nb_soutiens} « Moi aussi »`}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function PageMesSignalements() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Mes signalements</h1>
        <Link
          href="/signalements/nouveau"
          className="hidden items-center gap-1.5 rounded-xl bg-marque-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-marque-700 sm:flex"
        >
          <Icone nom="plus" taille={18} /> Nouveau signalement
        </Link>
      </div>
      <Suspense fallback={<SqueletteListe />}>
        <ListeSignalements />
      </Suspense>
    </div>
  );
}
