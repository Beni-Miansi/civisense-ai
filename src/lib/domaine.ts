// Vocabulaire métier partagé (serveur et client) : rôles, catégories, statuts.
// Les valeurs correspondent aux enums SQL de la migration initiale.

export type Role = 'citoyen' | 'agent' | 'responsable' | 'admin';
export type Categorie = 'dechets' | 'voirie' | 'assainissement' | 'eclairage' | 'autre';
export type Statut =
  | 'nouveau' | 'a_verifier' | 'valide' | 'affecte' | 'en_cours' | 'resolu' | 'cloture'
  | 'rejete' | 'doublon';

export const ORDRE_CATEGORIES: Categorie[] = ['dechets', 'voirie', 'assainissement', 'eclairage', 'autre'];

// Couleurs validées (palette catégorielle, contrôles CVD) ; `encre` = couleur du pictogramme si le blanc ne ressort pas.
// `icone` : tracés SVG (viewBox 24, trait) réutilisés par les composants React et les marqueurs Leaflet.
export const CATEGORIES: Record<Categorie, { libelle: string; couleur: string; encre?: string; exemple: string; icone: string[] }> = {
  dechets: {
    libelle: 'Déchets', couleur: '#eb6834', exemple: 'Dépôt sauvage, bac plein',
    icone: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  },
  voirie: {
    libelle: 'Voirie', couleur: '#1baf7a', exemple: 'Nid-de-poule, trottoir',
    icone: ['M12 2 4 22h16L12 2z', 'M7.5 15h9', 'M9.5 10h5'],
  },
  assainissement: {
    libelle: 'Assainissement', couleur: '#2a78d6', exemple: 'Caniveau bouché, égout',
    icone: ['M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z'],
  },
  eclairage: {
    libelle: 'Éclairage', couleur: '#eda100', encre: '#3b2a00', exemple: 'Lampadaire éteint',
    icone: [
      'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
      'M9 18h6', 'M10 22h4',
    ],
  },
  autre: {
    libelle: 'Autre', couleur: '#e87ba4', exemple: 'Autre problème urbain',
    icone: ['M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0', 'M7 12h.01', 'M12 12h.01', 'M17 12h.01'],
  },
};

export const STATUTS: Record<Statut, { libelle: string; classes: string; aide: string }> = {
  nouveau:    { libelle: 'Nouveau',    classes: 'bg-slate-100 text-slate-700 ring-slate-300',    aide: 'Reçu, en attente de vérification par la mairie.' },
  a_verifier: { libelle: 'À vérifier', classes: 'bg-amber-50 text-amber-800 ring-amber-300',     aide: 'En cours de vérification par un responsable.' },
  valide:     { libelle: 'Validé',     classes: 'bg-sky-50 text-sky-800 ring-sky-300',           aide: 'Problème confirmé, en attente d\'une équipe.' },
  affecte:    { libelle: 'Affecté',    classes: 'bg-indigo-50 text-indigo-800 ring-indigo-300',  aide: 'Une équipe est chargée de l\'intervention.' },
  en_cours:   { libelle: 'En cours',   classes: 'bg-orange-50 text-orange-800 ring-orange-300',  aide: 'L\'équipe intervient sur place.' },
  resolu:     { libelle: 'Résolu',     classes: 'bg-emerald-50 text-emerald-800 ring-emerald-300', aide: 'Intervention terminée, en attente de clôture.' },
  cloture:    { libelle: 'Clôturé',    classes: 'bg-green-700 text-white ring-green-700',        aide: 'Traitement terminé et validé par la mairie.' },
  rejete:     { libelle: 'Rejeté',     classes: 'bg-red-50 text-red-800 ring-red-300',           aide: 'Non retenu par la mairie (voir la justification).' },
  doublon:    { libelle: 'Doublon',    classes: 'bg-zinc-100 text-zinc-600 ring-zinc-300',       aide: 'Déjà signalé : suivi sur un autre signalement.' },
};

export const LIBELLES_ROLE: Record<Role, string> = {
  citoyen: 'Citoyen', agent: 'Agent municipal', responsable: 'Responsable', admin: 'Administrateur',
};

// Page d'accueil après connexion.
export const ACCUEIL_PAR_ROLE: Record<Role, string> = {
  citoyen: '/signalements',
  agent: '/interventions',
  responsable: '/tableau-de-bord',
  admin: '/tableau-de-bord',
};

export const estGestionnaire = (role: Role) => role === 'responsable' || role === 'admin';

// Commune pilote : Dakar.
export const CENTRE_CARTE = { lat: 14.699, lng: -17.448 };

export type Position = { lat: number; lng: number };

export type PointCarte = {
  id: string;
  lat: number;
  lng: number;
  titre: string;
  categorie: Categorie;
  statut: Statut;
  lien: string | null;          // détail accessible à l'utilisateur, sinon null
  approximatif: boolean;        // position arrondie (~100 m)
};
