'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alerte, classeChamp } from '@/components/formulaire';
import { NIVEAUX, type Niveau } from '@/lib/filtres';
import { messageErreur } from '@/lib/format';
import { creerClientNavigateur } from '@/lib/supabase/client';

const ORDRE: Niveau[] = ['haute', 'moyenne', 'basse'];

// Validation humaine de la priorité suggérée : motif obligatoire, tracé dans l'historique (public.valider_priorite).
export function ValidationPriorite({
  signalementId, suggeree, validee,
}: { signalementId: string; suggeree: Niveau | null; validee: Niveau | null }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [niveau, setNiveau] = useState<Niveau>(validee ?? suggeree ?? 'moyenne');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (motif.trim().length < 3) return setErreur('Indiquez le motif de votre décision : il est conservé dans l\'historique.');
    setErreur(null);
    setEnCours(true);
    const { error } = await creerClientNavigateur()
      .rpc('valider_priorite', { p_signalement: signalementId, p_niveau: niveau, p_motif: motif.trim() });
    setEnCours(false);
    if (error) {
      return setErreur(error.code === 'P0001' || error.code === '42501'
        ? error.message
        : messageErreur(error, 'La priorité n\'a pas pu être enregistrée. Réessayez.'));
    }
    setOuvert(false);
    setMotif('');
    setSucces(`Priorité « ${NIVEAUX[niveau].libelle} » validée.`);
    router.refresh();
  }

  if (!ouvert) {
    return (
      <div className="space-y-2">
        {succes && <Alerte type="succes">{succes}</Alerte>}
        <button
          type="button" onClick={() => { setOuvert(true); setSucces(null); }}
          className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          {validee ? 'Modifier la priorité' : 'Valider ou modifier la priorité'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={valider} className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
      {erreur && <Alerte>{erreur}</Alerte>}
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-semibold">Priorité retenue</legend>
        <div className="flex flex-wrap gap-2">
          {ORDRE.map((n) => (
            <label key={n} className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${niveau === n ? `${NIVEAUX[n].classes} ring-2` : 'bg-white text-slate-700 ring-slate-300'}`}>
              <input type="radio" name="niveau" value={n} checked={niveau === n} onChange={() => setNiveau(n)} className="sr-only" />
              {NIVEAUX[n].libelle}
              {n === suggeree && <span className="text-xs font-normal">(suggérée)</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold">Motif (obligatoire, visible du personnel uniquement)</span>
        <textarea
          rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} className={classeChamp}
          placeholder={niveau === suggeree ? 'Ex. : vérifié sur place, la suggestion est juste' : 'Ex. : danger immédiat pour les écoliers'}
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={enCours} className="rounded-xl bg-marque-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-60">
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button type="button" onClick={() => setOuvert(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
          Annuler
        </button>
      </div>
    </form>
  );
}
