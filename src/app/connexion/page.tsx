import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { FormulaireConnexion } from './FormulaireConnexion';

export const metadata: Metadata = { title: 'Connexion' };

export default function PageConnexion() {
  return (
    <div className="mx-auto max-w-sm space-y-6 py-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Connexion</h1>
        <p className="text-slate-600">Connectez-vous pour signaler un problème et suivre vos demandes.</p>
      </div>
      <Suspense>
        <FormulaireConnexion />
      </Suspense>
      <p className="text-center text-sm text-slate-600">
        Pas encore de compte&nbsp;?{' '}
        <Link href="/inscription" className="font-semibold text-marque-700 underline">Créer un compte</Link>
      </p>
    </div>
  );
}
