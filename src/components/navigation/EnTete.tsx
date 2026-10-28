import Link from 'next/link';
import { Icone } from '@/components/Icone';
import { getUtilisateur } from '@/lib/auth';
import { LIBELLES_ROLE, type Role } from '@/lib/domaine';
import { creerClientServeur } from '@/lib/supabase/server';
import { BoutonDeconnexion } from './BoutonDeconnexion';
import { LiensNavigation, type Lien } from './LiensNavigation';

const SIGNALER: Lien = { href: '/signalements/nouveau', libelle: 'Signaler', icone: 'plus' };
const MES_SIGNALEMENTS: Lien = { href: '/signalements', libelle: 'Mes signalements', icone: 'liste' };
const CARTE: Lien = { href: '/carte', libelle: 'Carte', icone: 'carte' };

const LIENS: Record<Role | 'invite', Lien[]> = {
  invite: [CARTE, { href: '/connexion', libelle: 'Connexion', icone: 'connexion' }],
  citoyen: [MES_SIGNALEMENTS, SIGNALER, CARTE],
  agent: [{ href: '/interventions', libelle: 'Interventions', icone: 'outils' }, SIGNALER, MES_SIGNALEMENTS, CARTE],
  responsable: [{ href: '/tableau-de-bord', libelle: 'Tableau de bord', icone: 'tableau' }, CARTE],
  admin: [{ href: '/tableau-de-bord', libelle: 'Tableau de bord', icone: 'tableau' }, CARTE],
};

export function Marque() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold text-marque-700">
      <span className="flex size-8 items-center justify-center rounded-lg bg-marque-600 text-sm text-white">CS</span>
      <span className="text-lg tracking-tight">CiviSense</span>
    </Link>
  );
}

// Cloche des notifications in-app avec le nombre de non lues.
async function Cloche() {
  const supabase = await creerClientServeur();
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('lue', false);
  const nonLues = count ?? 0;
  return (
    <Link
      href="/notifications"
      aria-label={nonLues ? `Notifications : ${nonLues} non lue${nonLues > 1 ? 's' : ''}` : 'Notifications'}
      className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
    >
      <Icone nom="cloche" />
      {nonLues > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] leading-5 font-bold text-white">
          {nonLues > 99 ? '99+' : nonLues}
        </span>
      )}
    </Link>
  );
}

// En-tête dépendant de la session : rendu à la requête, sous <Suspense> dans le layout.
export async function EnTete() {
  const utilisateur = await getUtilisateur();
  return (
    <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
        <Marque />
        <LiensNavigation liens={LIENS[utilisateur?.role ?? 'invite']} />
        {utilisateur && (
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 text-right leading-tight">
              <p className="truncate text-sm font-medium text-slate-900">{utilisateur.nom}</p>
              <p className="text-xs text-slate-500">{LIBELLES_ROLE[utilisateur.role]}</p>
            </div>
            <Cloche />
            <BoutonDeconnexion />
          </div>
        )}
      </div>
    </header>
  );
}

export function EnTeteSquelette() {
  return (
    <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4">
        <Marque />
      </div>
    </header>
  );
}
