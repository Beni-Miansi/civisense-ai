import 'server-only';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Client serveur (Server Components, Server Actions) : agit avec la session de l'utilisateur, donc sous RLS.
// À appeler dans un composant placé sous <Suspense>.
export async function creerClientServeur() {
  // Avec le Partial Prefetching, un contenu qui lit seulement cookies() peut être pré-rendu ;
  // or Supabase lit l'heure courante (expiration du jeton) : on force le rendu à la requête.
  await connection();
  const magasin = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => magasin.getAll(),
        setAll: (aEcrire) => {
          try {
            aEcrire.forEach(({ name, value, options }) => magasin.set(name, value, options));
          } catch {
            // Appel depuis un Server Component : écriture impossible, le proxy rafraîchit la session.
          }
        },
      },
    },
  );
}
