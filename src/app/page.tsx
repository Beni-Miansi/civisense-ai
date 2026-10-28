import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Alerte } from '@/components/formulaire';
import { IconeCategorie } from '@/components/IconeCategorie';
import { BoutonDeconnexionTexte } from '@/components/navigation/BoutonDeconnexion';
import { getUtilisateur } from '@/lib/auth';
import { creerClientServeur } from '@/lib/supabase/server';
import { ACCUEIL_PAR_ROLE, CATEGORIES, ORDRE_CATEGORIES } from '@/lib/domaine';

// Utilisateur connecté : direction sa page d'accueil selon son rôle.
async function RedirectionSelonRole() {
  const utilisateur = await getUtilisateur();
  if (utilisateur) redirect(ACCUEIL_PAR_ROLE[utilisateur.role]);

  // Session valide mais aucun profil lisible : base non initialisée ou compte désactivé.
  const supabase = await creerClientServeur();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return null;
  return (
    <div className="mt-4 space-y-2">
      <Alerte>
        Vous êtes connecté, mais votre profil est introuvable : la base de données n&apos;est pas initialisée
        (migrations SQL non appliquées) ou votre compte est désactivé.
      </Alerte>
      <BoutonDeconnexionTexte />
    </div>
  );
}

export default function Accueil() {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={null}>
        <RedirectionSelonRole />
      </Suspense>

      <section className="space-y-5 py-6">
        <p className="text-sm font-semibold tracking-wide text-marque-600 uppercase">Ville de Dakar · Pilote</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Un problème dans votre quartier&nbsp;? Signalez-le, suivez sa résolution.
        </h1>
        <p className="text-lg text-slate-600">
          Déchets, voirie, caniveaux, éclairage : votre signalement arrive directement aux services municipaux,
          et vous êtes informé à chaque étape jusqu&apos;à la preuve de l&apos;intervention.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signalements/nouveau"
            className="rounded-xl bg-marque-600 px-5 py-3 text-center font-semibold text-white hover:bg-marque-700"
          >
            Signaler un problème
          </Link>
          <Link
            href="/carte"
            className="rounded-xl bg-white px-5 py-3 text-center font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            Voir la carte
          </Link>
        </div>
        <p className="text-sm text-slate-600">
          Déjà inscrit&nbsp;?{' '}
          <Link href="/connexion" className="font-semibold text-marque-700 underline">Se connecter</Link>
          {' · '}
          <Link href="/inscription" className="font-semibold text-marque-700 underline">Créer un compte</Link>
        </p>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {ORDRE_CATEGORIES.map((c) => (
          <div key={c} className="flex flex-col items-center gap-2 rounded-xl bg-white p-4 text-center ring-1 ring-slate-200">
            <IconeCategorie categorie={c} taille={40} />
            <span className="text-sm font-semibold">{CATEGORIES[c].libelle}</span>
            <span className="text-xs text-slate-500">{CATEGORIES[c].exemple}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
