'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alerte, classeBoutonPrincipal, classeChamp } from '@/components/formulaire';
import { messageErreur } from '@/lib/format';
import { creerClientNavigateur } from '@/lib/supabase/client';

// Retour du citoyen sur un signalement résolu : confirmer, ou contester (réouverture côté base).
export function ConfirmationCitoyen({ signalementId }: { signalementId: string }) {
  const router = useRouter();
  const [contestation, setContestation] = useState(false);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function executer(action: () => PromiseLike<{ error: { message?: string; code?: string } | null }>) {
    setErreur(null);
    setEnCours(true);
    const { error } = await action();
    setEnCours(false);
    if (error) {
      return setErreur(error.code === 'P0001' || error.code === '42501'
        ? error.message ?? 'Action refusée.'
        : messageErreur(error, 'Votre réponse n\'a pas pu être enregistrée. Réessayez.'));
    }
    router.refresh();
  }

  const supabase = creerClientNavigateur();
  const confirmer = () =>
    executer(() => supabase.from('signalements').update({ resolution_confirmee: true }).eq('id', signalementId));

  function contester(e: React.FormEvent) {
    e.preventDefault();
    if (motif.trim().length < 3) return setErreur('Expliquez en quelques mots ce qui n\'est pas résolu.');
    executer(() => supabase.rpc('contester_resolution', { p_signalement: signalementId, p_motif: motif.trim() }));
  }

  return (
    <section className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-emerald-200">
      <h2 className="font-semibold">Le problème est-il réglé&nbsp;?</h2>
      {erreur && <Alerte>{erreur}</Alerte>}
      {!contestation ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={enCours} onClick={confirmer} className={classeBoutonPrincipal}>
            Problème bien résolu
          </button>
          <button
            type="button" onClick={() => setContestation(true)}
            className="w-full rounded-xl bg-white px-5 py-3 font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50"
          >
            Pas résolu
          </button>
        </div>
      ) : (
        <form onSubmit={contester} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">Qu&apos;est-ce qui n&apos;est pas réglé&nbsp;?</span>
            <textarea rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} className={classeChamp} />
          </label>
          <p className="text-sm text-slate-600">Le signalement sera rouvert et le responsable prévenu.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="submit" disabled={enCours} className="w-full rounded-xl bg-red-700 px-5 py-3 font-semibold text-white hover:bg-red-800 disabled:opacity-60">
              {enCours ? 'Envoi…' : 'Rouvrir le signalement'}
            </button>
            <button type="button" onClick={() => setContestation(false)} className="rounded-xl px-5 py-3 font-semibold text-slate-600 hover:bg-slate-100">
              Annuler
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
