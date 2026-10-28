'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icone, type NomIcone } from '@/components/Icone';

export type Lien = { href: string; libelle: string; icone: NomIcone };

// Barre d'onglets fixée en bas sur mobile, liens dans l'en-tête à partir de md.
export function LiensNavigation({ liens }: { liens: Lien[] }) {
  const chemin = usePathname();
  // Lien actif = le plus long préfixe correspondant (« /signalements/nouveau » ne surligne pas « /signalements »).
  const actif = liens
    .filter((l) => chemin === l.href || chemin.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-[1000] border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:static md:border-0 md:bg-transparent md:pb-0"
    >
      <ul className="mx-auto flex max-w-3xl md:gap-1">
        {liens.map((l) => {
          const estActif = l.href === actif;
          return (
            <li key={l.href} className="flex-1 md:flex-none">
              <Link
                href={l.href}
                aria-current={estActif ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium md:flex-row md:gap-1.5 md:rounded-lg md:px-3 md:text-sm ${
                  estActif ? 'text-marque-700 md:bg-marque-50' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icone nom={l.icone} taille={22} className="md:size-[18px]" />
                {l.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
