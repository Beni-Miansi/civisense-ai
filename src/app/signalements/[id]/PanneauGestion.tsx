'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alerte, classeChamp } from '@/components/formulaire';
import { STATUTS, type Statut } from '@/lib/domaine';
import { date, messageErreur } from '@/lib/format';
import { creerClientNavigateur } from '@/lib/supabase/client';

export type Agent = { id: string; nom_complet: string; nb_en_cours: number };
export type Candidat = {
  id: string; titre: string; statut: Statut; created_at: string; distance_m: number;
  similarite: number;   // similarité de texte (pg_trgm), 0–1
  suggere: boolean;     // respecte la règle doublon : < 50 m, < 72 h, non clos
};

type Mode = null | 'rejeter' | 'doublon' | 'affecter' | 'rouvrir';

// Les règles (transitions, justification) sont imposées par la base ; l'interface ne fait que proposer
// les actions pertinentes et relaie le message d'erreur si la base refuse.
function messageAction(erreur: { message?: string; code?: string }) {
  if (erreur.code === '23514') return 'Une justification est obligatoire pour cette décision.';
  if (erreur.code === '42501' || erreur.code === 'P0001') return `Action refusée : ${erreur.message}`;
  return messageErreur(erreur, 'L\'action n\'a pas pu être enregistrée. Réessayez.');
}

const bouton = 'rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60';
const principal = `${bouton} bg-marque-600 text-white hover:bg-marque-700`;
const secondaire = `${bouton} bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50`;
const danger = `${bouton} bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50`;

export function PanneauGestion({
  signalementId, statut, agents, candidats, agentActuelId,
}: {
  signalementId: string;
  statut: Statut;
  agents: Agent[];
  candidats: Candidat[];
  agentActuelId: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [justification, setJustification] = useState('');
  const [origine, setOrigine] = useState('');
  const [agent, setAgent] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function executer(action: () => PromiseLike<{ error: { message?: string; code?: string } | null }>, ok: string) {
    setErreur(null);
    setSucces(null);
    setEnCours(true);
    const { error } = await action();
    setEnCours(false);
    if (error) return setErreur(messageAction(error));
    setMode(null);
    setJustification('');
    setSucces(ok);
    router.refresh();
  }

  const supabase = creerClientNavigateur();
  const changerStatut = (nouveau: Statut, champs: Record<string, unknown> = {}, ok = `Statut passé à « ${STATUTS[nouveau].libelle} ».`) =>
    executer(() => supabase.from('signalements').update({ statut: nouveau, ...champs }).eq('id', signalementId), ok);

  function valider(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'rejeter') {
      if (!justification.trim()) return setErreur('Indiquez le motif du rejet : il sera communiqué au citoyen.');
      return changerStatut('rejete', { justification: justification.trim() });
    }
    if (mode === 'doublon') {
      if (!origine) return setErreur('Choisissez le signalement d\'origine.');
      if (!justification.trim()) return setErreur('Indiquez pourquoi il s\'agit d\'un doublon.');
      return changerStatut('doublon', { justification: justification.trim(), doublon_de: origine });
    }
    if (mode === 'affecter') {
      if (!agent) return setErreur('Choisissez un agent.');
      // L'insertion déclenche le passage au statut « affecte », l'historique et la notification de l'agent.
      return executer(
        () => supabase.from('interventions').insert({ signalement_id: signalementId, agent_id: agent }),
        'Intervention affectée. L\'agent est notifié.',
      );
    }
    if (mode === 'rouvrir') {
      if (!justification.trim()) return setErreur('Expliquez pourquoi le signalement est rouvert.');
      return executer(async () => {
        const r = await supabase.from('signalements').update({ statut: 'en_cours' }).eq('id', signalementId);
        if (r.error) return r;
        return supabase.from('commentaires').insert({ signalement_id: signalementId, contenu: `Réouverture : ${justification.trim()}` });
      }, 'Signalement rouvert. L\'agent et le citoyen sont notifiés.');
    }
  }

  const choisir = (m: Mode) => { setMode(m); setErreur(null); setSucces(null); };
  const peutAffecter = statut === 'valide' || statut === 'affecte' || statut === 'en_cours';

  return (
    <div className="space-y-3">
      {succes && <Alerte type="succes">{succes}</Alerte>}
      {erreur && <Alerte>{erreur}</Alerte>}

      <div className="flex flex-wrap gap-2">
        {statut === 'nouveau' && (
          <button type="button" disabled={enCours} className={principal} onClick={() => changerStatut('a_verifier')}>
            Commencer la vérification
          </button>
        )}
        {statut === 'a_verifier' && (
          <button type="button" disabled={enCours} className={principal} onClick={() => changerStatut('valide')}>
            Valider
          </button>
        )}
        {(statut === 'nouveau' || statut === 'a_verifier' || statut === 'valide') && (
          <>
            <button type="button" className={secondaire} onClick={() => choisir('doublon')}>Marquer doublon de…</button>
            <button type="button" className={danger} onClick={() => choisir('rejeter')}>Rejeter</button>
          </>
        )}
        {peutAffecter && (
          <button type="button" className={statut === 'valide' ? principal : secondaire} onClick={() => choisir('affecter')}>
            {statut === 'valide' ? 'Affecter à un agent' : 'Réaffecter'}
          </button>
        )}
        {statut === 'resolu' && (
          <>
            <button type="button" disabled={enCours} className={principal} onClick={() => changerStatut('cloture')}>
              Clôturer
            </button>
            <button type="button" className={secondaire} onClick={() => choisir('rouvrir')}>Rouvrir</button>
          </>
        )}
        {(statut === 'rejete' || statut === 'doublon') && (
          <button type="button" disabled={enCours} className={secondaire} onClick={() => changerStatut('a_verifier', { doublon_de: null })}>
            Remettre en vérification
          </button>
        )}
        {statut === 'cloture' && <p className="text-sm text-slate-600">Signalement clôturé : aucune action restante.</p>}
      </div>

      {mode && (
        <form onSubmit={valider} className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          {mode === 'doublon' && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Signalement d&apos;origine (même catégorie, à moins de 300 m)</legend>
              {candidats.length === 0 && <p className="text-sm text-slate-600">Aucun signalement proche de même catégorie.</p>}
              {candidats.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-start gap-2 rounded-lg bg-white p-2.5 text-sm ring-1 ring-slate-200 has-checked:ring-2 has-checked:ring-marque-600">
                  <input type="radio" name="origine" value={c.id} checked={origine === c.id} onChange={() => setOrigine(c.id)} className="mt-1" />
                  <span>
                    <span className="font-medium">{c.titre}</span>
                    {c.suggere && (
                      <span className="ml-1.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-violet-800 ring-1 ring-violet-300">suggéré</span>
                    )}
                    <span className="block text-xs text-slate-500">
                      {STATUTS[c.statut].libelle} · {c.distance_m} m · {date(c.created_at)} · texte similaire à {Math.round(c.similarite * 100)} %
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {mode === 'affecter' && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Agent (interventions en cours entre parenthèses)</legend>
              {agents.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white p-2.5 text-sm ring-1 ring-slate-200 has-checked:ring-2 has-checked:ring-marque-600">
                  <input type="radio" name="agent" value={a.id} checked={agent === a.id} disabled={a.id === agentActuelId} onChange={() => setAgent(a.id)} />
                  <span className="flex-1 font-medium">{a.nom_complet}</span>
                  <span className="text-xs text-slate-500">
                    {a.id === agentActuelId ? 'affecté actuellement' : `${a.nb_en_cours} en cours`}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {(mode === 'rejeter' || mode === 'doublon' || mode === 'rouvrir') && (
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">
                {mode === 'rejeter' ? 'Motif du rejet (communiqué au citoyen)' : mode === 'doublon' ? 'Justification' : 'Motif de la réouverture (visible du citoyen)'}
              </span>
              <textarea rows={2} value={justification} onChange={(e) => setJustification(e.target.value)} className={classeChamp} />
            </label>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={enCours} className={mode === 'rejeter' ? `${bouton} bg-red-700 text-white hover:bg-red-800` : principal}>
              {enCours ? 'Enregistrement…' : 'Confirmer'}
            </button>
            <button type="button" className={secondaire} onClick={() => choisir(null)}>Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}
