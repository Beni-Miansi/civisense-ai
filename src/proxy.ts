import { NextResponse, type NextRequest } from 'next/server';
import { mettreAJourSession } from '@/lib/supabase/proxy';

// Pages réservées aux utilisateurs connectés (le contrôle du rôle se fait dans les pages, la RLS protège les données).
const PROTEGEES = ['/signalements', '/interventions', '/tableau-de-bord', '/notifications'];
const INVITES = ['/connexion', '/inscription'];

export async function proxy(request: NextRequest) {
  const { reponse, connecte } = await mettreAJourSession(request);
  const chemin = request.nextUrl.pathname;

  const rediriger = (vers: string, suivant?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = vers;
    url.search = suivant ? `?suivant=${encodeURIComponent(suivant)}` : '';
    const redirection = NextResponse.redirect(url);
    reponse.cookies.getAll().forEach((cookie) => redirection.cookies.set(cookie));
    return redirection;
  };

  if (!connecte && PROTEGEES.some((p) => chemin === p || chemin.startsWith(`${p}/`))) {
    return rediriger('/connexion', chemin);
  }
  if (connecte && INVITES.includes(chemin)) {
    return rediriger('/');
  }
  return reponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
