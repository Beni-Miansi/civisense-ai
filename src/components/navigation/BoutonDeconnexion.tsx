'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icone } from '@/components/Icone';
import { creerClientNavigateur } from '@/lib/supabase/client';

function useDeconnexion() {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  async function deconnecter() {
    setEnCours(true);
    await creerClientNavigateur().auth.signOut();
    router.replace('/connexion');
    router.refresh();
  }
  return { enCours, deconnecter };
}

// Variante texte (utilisée hors de l'en-tête).
export function BoutonDeconnexionTexte() {
  const { enCours, deconnecter } = useDeconnexion();
  return (
    <button type="button" onClick={deconnecter} disabled={enCours} className="text-sm font-semibold text-marque-700 underline disabled:opacity-50">
      Se déconnecter
    </button>
  );
}

export function BoutonDeconnexion() {
  const { enCours, deconnecter } = useDeconnexion();
  return (
    <button
      type="button"
      onClick={deconnecter}
      disabled={enCours}
      title="Se déconnecter"
      aria-label="Se déconnecter"
      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
    >
      <Icone nom="sortie" />
    </button>
  );
}
