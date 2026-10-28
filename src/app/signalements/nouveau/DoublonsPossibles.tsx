'use client';

import { STATUTS, type Statut } from '@/lib/domaine';
import { date } from '@/lib/format';

export type Doublon = {
  id: string; titre: string; statut: Statut; created_at: string;
  distance_m: number; similarite: number; nb_soutiens: number; deja_soutenu: boolean; est_auteur: boolean;
};

// « Ce problème a peut-être déjà été signalé » : soutenir l'existant ou envoyer quand même.
export function DoublonsPossibles({
  doublons, soutienEnCours, onSoutenir,
}: {
  doublons: Doublon[];
  soutienEnCours: string | null;
  onSoutenir: (d: Doublon) => void;
}) {
  return (
    <section className="space-y-3 rounded-xl bg-violet-50 p-4 ring-1 ring-violet-200" aria-live="polite">
      <div className="space-y-1">
        <h2 className="font-semibold text-violet-950">Ce problème a peut-être déjà été signalé</h2>
        <p className="text-sm text-violet-900">
          {doublons.length > 1 ? 'Ces signalements' : 'Ce signalement'} de même catégorie, à moins de 50 m, date{doublons.length > 1 ? 'nt' : ''} de
          moins de 72 h. S&apos;il s&apos;agit du même problème, soutenez-le : il gagnera en priorité.
        </p>
      </div>
      <ul className="space-y-2">
        {doublons.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-violet-200">
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">{d.titre}</p>
              <p className="text-xs text-slate-500">
                {STATUTS[d.statut].libelle} · à {d.distance_m} m · le {date(d.created_at)}
                {d.nb_soutiens > 0 && ` · ${d.nb_soutiens} « Moi aussi »`}
              </p>
            </div>
            {d.est_auteur ? (
              <span className="text-sm text-slate-600">C&apos;est votre signalement</span>
            ) : d.deja_soutenu ? (
              <span className="text-sm font-semibold text-emerald-700">✓ Déjà soutenu</span>
            ) : (
              <button
                type="button" disabled={soutienEnCours !== null} onClick={() => onSoutenir(d)}
                className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
              >
                {soutienEnCours === d.id ? 'Envoi…' : 'Moi aussi'}
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="submit"
        className="w-full rounded-xl bg-white px-5 py-3 font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
      >
        Non, c&apos;est différent : envoyer mon signalement
      </button>
    </section>
  );
}
