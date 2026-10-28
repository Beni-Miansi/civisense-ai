import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Rafraîchit la session Supabase à chaque requête et indique si l'utilisateur est connecté.
export async function mettreAJourSession(request: NextRequest) {
  let reponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (aEcrire, entetes) => {
          aEcrire.forEach(({ name, value }) => request.cookies.set(name, value));
          reponse = NextResponse.next({ request });
          aEcrire.forEach(({ name, value, options }) => reponse.cookies.set(name, value, options));
          Object.entries(entetes).forEach(([cle, valeur]) => reponse.headers.set(cle, valeur));
        },
      },
    },
  );

  // getClaims() vérifie le jeton (ne pas se fier à getSession() côté serveur).
  const { data } = await supabase.auth.getClaims();
  return { reponse, connecte: Boolean(data?.claims?.sub) };
}
