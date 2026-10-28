// Dates affichées à l'heure de Dakar (identique sur le serveur et le navigateur).
const FUSEAU = 'Africa/Dakar';

const formatDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: FUSEAU });
const formatDateHeure = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: FUSEAU,
});

export const date = (iso: string) => formatDate.format(new Date(iso));
export const dateHeure = (iso: string) => formatDateHeure.format(new Date(iso));

// Message d'erreur Supabase/réseau compréhensible par un citoyen.
export function messageErreur(erreur: { message?: string } | null | undefined, defaut: string): string {
  const message = erreur?.message ?? '';
  if (/fetch|network|Failed to fetch|NetworkError/i.test(message)) {
    return 'Pas de connexion internet. Vérifiez votre réseau puis réessayez : votre saisie est conservée.';
  }
  return defaut;
}
