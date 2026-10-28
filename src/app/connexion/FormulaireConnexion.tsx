'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alerte, Champ, classeBoutonPrincipal, classeChamp } from '@/components/formulaire';
import { messageErreur } from '@/lib/format';
import { creerClientNavigateur } from '@/lib/supabase/client';

function messageConnexion(erreur: { message?: string; code?: string }) {
  if (erreur.code === 'invalid_credentials') return 'Email ou mot de passe incorrect.';
  if (erreur.code === 'email_not_confirmed') {
    return 'Votre adresse email n\'est pas encore confirmée : cliquez sur le lien reçu par email.';
  }
  return messageErreur(erreur, 'Connexion impossible pour le moment. Réessayez dans quelques instants.');
}

export function FormulaireConnexion() {
  const router = useRouter();
  const suivant = useSearchParams().get('suivant');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function connecter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErreur(null);
    setEnCours(true);
    const { error } = await creerClientNavigateur().auth.signInWithPassword({
      email: String(formData.get('email')).trim(),
      password: String(formData.get('mot_de_passe')),
    });
    if (error) {
      setErreur(messageConnexion(error));
      setEnCours(false);
      return;
    }
    // « / » redirige vers la page d'accueil du rôle ; on n'accepte que des chemins internes.
    router.replace(suivant?.startsWith('/') && !suivant.startsWith('//') ? suivant : '/');
    router.refresh();
  }

  return (
    <form onSubmit={connecter} className="space-y-4">
      {erreur && <Alerte>{erreur}</Alerte>}
      <Champ id="email" libelle="Adresse email">
        <input id="email" name="email" type="email" autoComplete="email" required className={classeChamp} />
      </Champ>
      <Champ id="mot_de_passe" libelle="Mot de passe">
        <input
          id="mot_de_passe" name="mot_de_passe" type="password" autoComplete="current-password" required
          className={classeChamp}
        />
      </Champ>
      <button type="submit" disabled={enCours} className={classeBoutonPrincipal}>
        {enCours ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
