'use client';

import { useEffect } from 'react';

export default function Erreur({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-4 rounded-xl bg-white p-6 text-center ring-1 ring-slate-200">
      <h1 className="text-lg font-bold">Un problème est survenu</h1>
      <p className="text-slate-600">La page n&apos;a pas pu se charger. Vérifiez votre connexion puis réessayez.</p>
      <button
        type="button" onClick={() => retry()}
        className="rounded-xl bg-marque-600 px-5 py-2.5 font-semibold text-white hover:bg-marque-700"
      >
        Réessayer
      </button>
    </div>
  );
}
