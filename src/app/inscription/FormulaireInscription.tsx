'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alerte, Champ, classeBoutonPrincipal, classeChamp } from '@/components/formulaire';
import { messageErreur } from '@/lib/format';
import { creerClientNavigateur } from '@/lib/supabase/client';

function messageInscription(erreur: { message?: string; code?: string }) {
  if (erreur.code === 'user_already_exists') return 'Un compte existe déjà avec cet email. Connectez-vous.';
  if (erreur.code === 'weak_password') return 'Mot de passe trop faible : 8 caractères minimum, mélangez lettres et chiffres.';
  if (erreur.code === 'over_email_send_rate_limit' || erreur.code === 'over_request_rate_limit') {
    return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';
  }
  if (erreur.code === 'email_address_invalid') return 'Cette adresse email n\'est pas valide.';
  return messageErreur(erreur, 'Inscription impossible pour le moment. Réessayez dans quelques instants.');
}

export function FormulaireInscription() {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [emailEnvoye, setEmailEnvoye] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function inscrire(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErreur(null);
    const nom = String(formData.get('nom_complet')).trim();
    const email = String(formData.get('email')).trim();
    const motDePasse = String(formData.get('mot_de_passe'));
    if (nom.length < 2) return setErreur('Indiquez votre nom (2 caractères minimum).');
    if (motDePasse.length < 8) return setErreur('Le mot de passe doit contenir au moins 8 caractères.');

    setEnCours(true);
    const { data, error } = await creerClientNavigateur().auth.signUp({
      email,
      password: motDePasse,
      // Le profil est créé par un trigger SQL avec le rôle « citoyen » ; seul le nom est repris.
      options: { data: { nom_complet: nom }, emailRedirectTo: `${window.location.origin}/connexion` },
    });
    setEnCours(false);
    if (error) return setErreur(messageInscription(error));

    if (data.session) {
      router.replace('/signalements');
      router.refresh();
    } else {
      setEmailEnvoye(email);   // confirmation par email activée dans Supabase
    }
  }

  if (emailEnvoye) {
    return (
      <Alerte type="succes">
        Compte créé. Un email de confirmation a été envoyé à <strong>{emailEnvoye}</strong> : cliquez sur le lien
        qu&apos;il contient, puis connectez-vous.
      </Alerte>
    );
  }

  return (
    <form onSubmit={inscrire} className="space-y-4">
      {erreur && <Alerte>{erreur}</Alerte>}
      <Champ id="nom_complet" libelle="Nom complet">
        <input id="nom_complet" name="nom_complet" autoComplete="name" required className={classeChamp} />
      </Champ>
      <Champ id="email" libelle="Adresse email">
        <input id="email" name="email" type="email" autoComplete="email" required className={classeChamp} />
      </Champ>
      <Champ id="mot_de_passe" libelle="Mot de passe" aide="8 caractères minimum.">
        <input
          id="mot_de_passe" name="mot_de_passe" type="password" autoComplete="new-password" minLength={8} required
          className={classeChamp}
        />
      </Champ>
      <button type="submit" disabled={enCours} className={classeBoutonPrincipal}>
        {enCours ? 'Création du compte…' : 'Créer mon compte'}
      </button>
      <p className="text-xs text-slate-500">
        Vos données servent uniquement au suivi de vos signalements. Votre position exacte n&apos;est jamais
        publiée : la carte publique l&apos;arrondit à environ 100 m.
      </p>
    </form>
  );
}
