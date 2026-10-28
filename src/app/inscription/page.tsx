import type { Metadata } from 'next';
import Link from 'next/link';
import { FormulaireInscription } from './FormulaireInscription';

export const metadata: Metadata = { title: 'Créer un compte' };

export default function PageInscription() {
  return (
    <div className="mx-auto max-w-sm space-y-6 py-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Créer un compte</h1>
        <p className="text-slate-600">Un compte suffit pour signaler et suivre vos demandes.</p>
      </div>
      <FormulaireInscription />
      <p className="text-center text-sm text-slate-600">
        Déjà inscrit&nbsp;?{' '}
        <Link href="/connexion" className="font-semibold text-marque-700 underline">Se connecter</Link>
      </p>
    </div>
  );
}
