'use client';

// Leaflet a besoin de `window` : les cartes sont chargées uniquement dans le navigateur.
import dynamic from 'next/dynamic';

function ChargementCarte({ hauteur = 'h-[60vh]' }: { hauteur?: string }) {
  return (
    <div className={`flex ${hauteur} items-center justify-center rounded-xl bg-slate-200/70 text-sm text-slate-500`}>
      Chargement de la carte…
    </div>
  );
}

export const CarteSignalements = dynamic(() => import('./CarteSignalements'), {
  ssr: false,
  loading: () => <ChargementCarte />,
});

export const SelecteurPosition = dynamic(() => import('./SelecteurPosition'), {
  ssr: false,
  loading: () => <ChargementCarte hauteur="h-72 sm:h-80" />,
});

export { ChargementCarte };
