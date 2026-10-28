// Éléments de formulaire partagés (styles cohérents, cibles tactiles confortables).

export const classeChamp =
  'block w-full rounded-xl border-0 bg-white px-3.5 py-3 text-base text-slate-900 ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-marque-600 focus:outline-none aria-[invalid=true]:ring-red-500';

export const classeBoutonPrincipal =
  'flex w-full items-center justify-center gap-2 rounded-xl bg-marque-600 px-5 py-3 font-semibold text-white hover:bg-marque-700 disabled:cursor-not-allowed disabled:opacity-60';

export function Champ({
  id, libelle, erreur, aide, children,
}: { id: string; libelle: string; erreur?: string; aide?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">{libelle}</label>
      {children}
      {erreur ? (
        <p id={`${id}-erreur`} className="text-sm text-red-700">{erreur}</p>
      ) : aide ? (
        <p className="text-sm text-slate-500">{aide}</p>
      ) : null}
    </div>
  );
}

export function Alerte({ type = 'erreur', children }: { type?: 'erreur' | 'info' | 'succes'; children: React.ReactNode }) {
  const styles = {
    erreur: 'bg-red-50 text-red-800 ring-red-200',
    info: 'bg-sky-50 text-sky-900 ring-sky-200',
    succes: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  }[type];
  return (
    <div role={type === 'erreur' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ring-1 ${styles}`}>
      {children}
    </div>
  );
}
