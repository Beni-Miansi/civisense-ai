import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { creerClientServeur } from '@/lib/supabase/server';
import { ACCUEIL_PAR_ROLE, type Role } from '@/lib/domaine';

export type Utilisateur = { id: string; nom: string; role: Role };

// Utilisateur connecté et son rôle (lu une seule fois par requête).
export const getUtilisateur = cache(async (): Promise<Utilisateur | null> => {
  const supabase = await creerClientServeur();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;

  const { data: profil } = await supabase
    .from('profils')
    .select('id, nom_complet, role, actif')
    .eq('id', id)
    .maybeSingle();
  if (!profil || !profil.actif) return null;
  return { id: profil.id, nom: profil.nom_complet, role: profil.role as Role };
});

// Exige une session (et éventuellement un rôle) ; sinon redirige.
export async function exigerUtilisateur(roles?: Role[]): Promise<Utilisateur> {
  const utilisateur = await getUtilisateur();
  if (!utilisateur) redirect('/connexion');
  if (roles && !roles.includes(utilisateur.role)) redirect(ACCUEIL_PAR_ROLE[utilisateur.role]);
  return utilisateur;
}
