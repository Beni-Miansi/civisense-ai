import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Alerte } from '@/components/formulaire';
import { SqueletteListe } from '@/components/Squelette';
import { exigerUtilisateur } from '@/lib/auth';
import { dateHeure } from '@/lib/format';
import { creerClientServeur } from '@/lib/supabase/server';
import { MarquerCommeLues } from './MarquerCommeLues';

export const metadata: Metadata = { title: 'Notifications' };

type Notification = { id: string; signalement_id: string | null; titre: string; message: string; lue: boolean; created_at: string };

async function ListeNotifications() {
  await exigerUtilisateur();
  const supabase = await creerClientServeur();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, signalement_id, titre, message, lue, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<Notification[]>();

  if (error) return <Alerte>Impossible de charger vos notifications. Rechargez la page.</Alerte>;
  if (!data.length) {
    return <p className="rounded-xl bg-white p-6 text-center text-slate-600 ring-1 ring-slate-200">Aucune notification pour l&apos;instant.</p>;
  }

  const nonLues = data.filter((n) => !n.lue).length;
  return (
    <>
      {nonLues > 0 && <MarquerCommeLues />}
      <ul className="space-y-2">
        {data.map((n) => {
          const contenu = (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold leading-snug text-slate-900">{n.titre}</p>
                {!n.lue && <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-red-600" aria-label="Non lue" />}
              </div>
              <p className="text-sm text-slate-700">{n.message}</p>
              <p className="text-xs text-slate-500">{dateHeure(n.created_at)}</p>
            </>
          );
          const classes = `block space-y-1 rounded-xl p-4 ring-1 ${n.lue ? 'bg-white ring-slate-200' : 'bg-marque-50 ring-marque-100'}`;
          return (
            <li key={n.id}>
              {n.signalement_id ? (
                <Link href={`/signalements/${n.signalement_id}`} className={`${classes} hover:ring-marque-500`}>{contenu}</Link>
              ) : (
                <div className={classes}>{contenu}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function PageNotifications() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
      <Suspense fallback={<SqueletteListe />}>
        <ListeNotifications />
      </Suspense>
    </div>
  );
}
