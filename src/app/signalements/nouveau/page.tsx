import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SqueletteBloc } from '@/components/Squelette';
import { exigerUtilisateur } from '@/lib/auth';
import { FormulaireSignalement } from './FormulaireSignalement';

export const metadata: Metadata = { title: 'Nouveau signalement' };

async function Formulaire() {
  const utilisateur = await exigerUtilisateur(['citoyen', 'agent']);
  return <FormulaireSignalement utilisateurId={utilisateur.id} />;
}

export default function PageNouveauSignalement() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Nouveau signalement</h1>
        <p className="text-slate-600">Décrivez le problème et indiquez où il se trouve.</p>
      </div>
      <Suspense fallback={<SqueletteBloc hauteur="h-[70vh]" />}>
        <Formulaire />
      </Suspense>
    </div>
  );
}
