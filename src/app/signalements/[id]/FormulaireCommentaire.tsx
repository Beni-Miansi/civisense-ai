'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { classeChamp } from '@/components/formulaire';
import { messageErreur } from '@/lib/format';
import { creerClientNavigateur } from '@/lib/supabase/client';

export function FormulaireCommentaire({
  signalementId, utilisateurId, noteInternePossible = false,
}: { signalementId: string; utilisateurId: string; noteInternePossible?: boolean }) {
  const router = useRouter();
  const [contenu, setContenu] = useState('');
  const [interne, setInterne] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!contenu.trim()) return setErreur('Écrivez votre commentaire avant de l\'envoyer.');
    setErreur(null);
    setEnvoi(true);
    const { error } = await creerClientNavigateur()
      .from('commentaires')
      .insert({ signalement_id: signalementId, auteur_id: utilisateurId, contenu: contenu.trim(), interne });
    setEnvoi(false);
    if (error) return setErreur(messageErreur(error, 'Le commentaire n\'a pas pu être envoyé. Réessayez.'));
    setContenu('');
    router.refresh();
  }

  return (
    <form onSubmit={envoyer} className="space-y-2">
      <label htmlFor="commentaire" className="sr-only">Ajouter un commentaire</label>
      <textarea
        id="commentaire" rows={2} maxLength={2000} value={contenu} onChange={(e) => setContenu(e.target.value)}
        placeholder="Ajouter une précision, une information…" className={classeChamp}
      />
      {erreur && <p className="text-sm text-red-700">{erreur}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit" disabled={envoi}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-marque-700 ring-1 ring-marque-600 hover:bg-marque-50 disabled:opacity-60"
        >
          {envoi ? 'Envoi…' : 'Commenter'}
        </button>
        {noteInternePossible && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={interne} onChange={(e) => setInterne(e.target.checked)} className="size-4" />
            Note interne (invisible du citoyen)
          </label>
        )}
      </div>
    </form>
  );
}
