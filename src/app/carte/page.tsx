import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CarteSignalements, ChargementCarte } from '@/components/carte';
import { Alerte } from '@/components/formulaire';
import { getUtilisateur } from '@/lib/auth';
import { CATEGORIES, ORDRE_CATEGORIES, estGestionnaire, type Categorie, type PointCarte, type Statut } from '@/lib/domaine';
import { creerClientServeur } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Carte des signalements' };

type Ligne = { id: string; titre: string; categorie: Categorie; statut: Statut; latitude: number; longitude: number };

async function ContenuCarte() {
  const utilisateur = await getUtilisateur();
  const supabase = await creerClientServeur();
  const colonnes = 'id, titre, categorie, statut, latitude, longitude';
  let points: PointCarte[];

  if (utilisateur && estGestionnaire(utilisateur.role)) {
    // Responsable / admin : positions exactes, tous les signalements actifs.
    const { data, error } = await supabase
      .from('signalements').select(colonnes).not('statut', 'in', '(rejete,doublon)').returns<Ligne[]>();
    if (error) return <Alerte>Impossible de charger la carte. Rechargez la page.</Alerte>;
    points = data.map((s) => ({
      id: s.id, lat: s.latitude, lng: s.longitude, titre: s.titre, categorie: s.categorie, statut: s.statut,
      lien: `/signalements/${s.id}`, approximatif: false,
    }));
  } else {
    // Vue publique : positions arrondies à ~100 m (vue SQL signalements_publics).
    // Lien vers le détail seulement pour les signalements que l'utilisateur peut ouvrir (les siens, ses interventions).
    const [publics, visibles] = await Promise.all([
      supabase.from('signalements_publics').select(colonnes).returns<Ligne[]>(),
      utilisateur ? supabase.from('signalements').select('id') : Promise.resolve({ data: [] as { id: string }[] }),
    ]);
    if (publics.error) return <Alerte>Impossible de charger la carte. Rechargez la page.</Alerte>;
    const ouvrables = new Set((visibles.data ?? []).map((v) => v.id));
    points = publics.data.map((s) => ({
      id: s.id, lat: s.latitude, lng: s.longitude, titre: s.titre, categorie: s.categorie, statut: s.statut,
      lien: ouvrables.has(s.id) ? `/signalements/${s.id}` : null, approximatif: true,
    }));
  }

  const enCours = points.filter((p) => p.statut !== 'resolu' && p.statut !== 'cloture').length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {points.length} signalements · {enCours} en attente ou en traitement
        {points[0]?.approximatif && ' · positions arrondies à ~100 m'}
      </p>
      <CarteSignalements points={points} />
    </div>
  );
}

export default function PageCarte() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Carte des signalements</h1>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Légende">
        {ORDRE_CATEGORIES.map((c) => (
          <li key={c} className="flex items-center gap-1.5 text-sm text-slate-700">
            <span className="size-3 rounded-full ring-2 ring-white" style={{ backgroundColor: CATEGORIES[c].couleur }} />
            {CATEGORIES[c].libelle}
          </li>
        ))}
        <li className="text-sm text-slate-500">Pâle&nbsp;: résolu</li>
      </ul>
      <Suspense fallback={<ChargementCarte />}>
        <ContenuCarte />
      </Suspense>
    </div>
  );
}
