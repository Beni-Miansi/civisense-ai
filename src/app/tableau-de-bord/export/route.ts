import type { NextRequest } from 'next/server';
import type { DetailPriorite } from '@/components/ExplicationPriorite';
import { getUtilisateur } from '@/lib/auth';
import { CATEGORIES, STATUTS, estGestionnaire, type Categorie, type Statut } from '@/lib/domaine';
import { NIVEAUX, appliquerFiltres, lireFiltres, type Niveau } from '@/lib/filtres';
import { creerClientServeur } from '@/lib/supabase/server';

type Ligne = {
  id: string; created_at: string; titre: string; categorie: Categorie; zone_nom: string | null; statut: Statut;
  priorite: Niveau | null; priorite_validee: Niveau | null; score_priorite: number | null; nb_soutiens: number;
  detail_score: DetailPriorite; doublon_possible: boolean;
  adresse: string | null; latitude: number; longitude: number; resolu_le: string | null; cloture_le: string | null;
};

// Cellule CSV : guillemets doublés, et neutralisation des formules (=, +, -, @) à l'ouverture dans un tableur.
function cellule(valeur: unknown): string {
  let texte = valeur === null || valeur === undefined ? '' : String(valeur);
  if (/^[=+\-@]/.test(texte)) texte = `'${texte}`;
  return `"${texte.replaceAll('"', '""')}"`;
}

// Export de la liste filtrée (mêmes filtres que le tableau de bord), séparateur « ; » pour Excel en français.
export async function GET(request: NextRequest) {
  const utilisateur = await getUtilisateur();
  if (!utilisateur || !estGestionnaire(utilisateur.role)) {
    return new Response('Accès réservé aux responsables.', { status: 403 });
  }

  const filtres = lireFiltres(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await creerClientServeur();
  const { data, error } = await appliquerFiltres(
    supabase
      .from('signalements_gestion')
      .select('id, created_at, titre, categorie, zone_nom, statut, priorite, priorite_validee, score_priorite, detail_score, doublon_possible, nb_soutiens, adresse, latitude, longitude, resolu_le, cloture_le'),
    filtres,
  )
    .limit(5000)
    .returns<Ligne[]>();

  if (error) return new Response('Export impossible pour le moment.', { status: 500 });

  const entetes = [
    'Identifiant', 'Créé le', 'Titre', 'Catégorie', 'Zone', 'Statut', 'Priorité', 'Priorité validée', 'Score',
    'Détail du score', 'Doublon possible', 'Soutiens', 'Adresse', 'Latitude', 'Longitude', 'Résolu le', 'Clôturé le',
  ];
  const lignes = data.map((s) => [
    s.id, s.created_at, s.titre, CATEGORIES[s.categorie].libelle, s.zone_nom ?? 'Hors zone', STATUTS[s.statut].libelle,
    s.priorite ? NIVEAUX[s.priorite].libelle : '', s.priorite_validee ? 'oui' : 'non', s.score_priorite,
    (s.detail_score?.criteres ?? []).map((c) => `${c.critere ?? c.libelle} +${c.points}`).join(' | '),
    s.doublon_possible ? 'oui' : 'non', s.nb_soutiens,
    s.adresse, s.latitude, s.longitude, s.resolu_le, s.cloture_le,
  ]);
  const csv = [entetes, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n');
  const jour = new Date().toISOString().slice(0, 10);

  return new Response(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="civisense-signalements-${jour}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
