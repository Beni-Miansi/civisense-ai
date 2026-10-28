/**
 * Données de démo CiviSense AI — Dakar (Médina, Grand Dakar, HLM, Colobane).
 *
 * Rejouable : supprime d'abord les comptes @demo.civisense.sn (et, par cascade,
 * leurs signalements, interventions, commentaires, soutiens, historique) ainsi
 * que la commune « Dakar » et ses zones, puis recrée tout. Les dates sont
 * relatives au moment du lancement : les cas « > 72 h » et « < 72 h » restent vrais.
 *
 *   npm run seed               → lit .env.local (URL, clé secrète, mot de passe démo)
 *   npm run seed -- --dry-run  → vérifie les données sans toucher à Supabase
 *
 * Exécuté par Node 24 directement (suppression des types TypeScript, sans build).
 */
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

type Categorie = 'dechets' | 'voirie' | 'assainissement' | 'eclairage' | 'autre';
type Statut =
  | 'nouveau' | 'a_verifier' | 'valide' | 'affecte' | 'en_cours' | 'resolu' | 'cloture'
  | 'rejete' | 'doublon';
type Niveau = 'basse' | 'moyenne' | 'haute';
type CleZone = 'medina' | 'grand_dakar' | 'hlm' | 'colobane';
type CleCompte = 'admin' | 'resp' | 'agent1' | 'agent2' | 'cit1' | 'cit2' | 'cit3' | 'cit4';
type Citoyen = 'cit1' | 'cit2' | 'cit3';
type Agent = 'agent1' | 'agent2';

// -----------------------------------------------------------------------------
// Référentiel
// -----------------------------------------------------------------------------

const DOMAINE = 'demo.civisense.sn';

const COMPTES: Record<CleCompte, { email: string; nom: string; role: string }> = {
  admin:  { email: `admin@${DOMAINE}`,       nom: 'Ousmane Sow',      role: 'admin' },
  resp:   { email: `responsable@${DOMAINE}`, nom: 'Awa Ndiaye',       role: 'responsable' },
  agent1: { email: `agent1@${DOMAINE}`,      nom: 'Moussa Diop',      role: 'agent' },
  agent2: { email: `agent2@${DOMAINE}`,      nom: 'Ibrahima Fall',    role: 'agent' },
  cit1:   { email: `citoyen1@${DOMAINE}`,    nom: 'Fatou Sarr',       role: 'citoyen' },
  cit2:   { email: `citoyen2@${DOMAINE}`,    nom: 'Cheikh Ba',        role: 'citoyen' },
  cit3:   { email: `citoyen3@${DOMAINE}`,    nom: 'Aminata Diallo',   role: 'citoyen' },
  // Sans signalement ni soutien : compte « neuf » pour la démo (proposition « Moi aussi »).
  cit4:   { email: `citoyen4@${DOMAINE}`,    nom: 'Mariama Faye',     role: 'citoyen' },
};

const COMMUNE = { nom: 'Dakar', pays: 'Sénégal', centre_lat: 14.6990, centre_lng: -17.4480 };

// Centres approximatifs des quartiers ; zones circulaires (cf. migration).
const ZONES: Record<CleZone, {
  nom: string; lat: number; lng: number; rayon_m: number; risque: 'inondable' | 'marche' | null;
}> = {
  medina:      { nom: 'Médina',      lat: 14.6828, lng: -17.4497, rayon_m: 650, risque: null },
  grand_dakar: { nom: 'Grand Dakar', lat: 14.7075, lng: -17.4555, rayon_m: 650, risque: null },
  hlm:         { nom: 'HLM',         lat: 14.7130, lng: -17.4460, rayon_m: 550, risque: 'inondable' },
  colobane:    { nom: 'Colobane',    lat: 14.6935, lng: -17.4445, rayon_m: 450, risque: 'marche' },
};

const LIBELLE_RISQUE = { inondable: 'zone inondable', marche: 'marché' };
const GRAVITE: Record<Categorie, number> = { assainissement: 3, dechets: 2, voirie: 2, eclairage: 1, autre: 1 };
const LIBELLE_CATEGORIE: Record<Categorie, string> = {
  dechets: 'Déchets', voirie: 'Voirie', assainissement: 'Assainissement', eclairage: 'Éclairage', autre: 'Autre',
};

// Heures écoulées entre la création et chaque étape du cycle.
const CYCLE: Statut[] = ['nouveau', 'a_verifier', 'valide', 'affecte', 'en_cours', 'resolu', 'cloture'];
const HEURES: Record<string, number> = {
  a_verifier: 1, valide: 8, affecte: 20, en_cours: 30, resolu: 54, cloture: 70, rejete: 6, doublon: 6,
};

// -----------------------------------------------------------------------------
// Signalements (dx/dy : décalage en mètres vers l'est/le nord depuis le centre de la zone)
// -----------------------------------------------------------------------------

type Spec = {
  cle: string;
  zone: CleZone; dx: number; dy: number; adresse: string;
  categorie: Categorie; suggestion?: Categorie;
  titre: string; description: string;
  auteur: Citoyen; jours: number; statut: Statut;
  agent?: Agent; reaffectation?: { agent: Agent; h: number };
  actions?: string; confirmation?: boolean;
  priorite_validee?: Niveau;               // si le responsable modifie la suggestion
  justification?: string; doublon_de?: string;
  commentaires?: { de: CleCompte; h: number; texte: string; interne?: boolean }[];
  soutiens?: Citoyen[];
};

const SPECS: Spec[] = [
  // --- HLM : caniveau du marché, problème récurrent en zone inondable --------
  {
    cle: 'R1', zone: 'hlm', dx: 40, dy: -110, adresse: 'Marché HLM, HLM',
    categorie: 'assainissement', titre: 'Caniveau bouché devant le marché HLM',
    description: 'Le caniveau qui longe le marché est rempli de sable et de sacs plastiques. L\'eau ne s\'écoule plus et déborde sur la chaussée dès qu\'il pleut.',
    auteur: 'cit2', jours: 19, statut: 'cloture', agent: 'agent1', confirmation: true,
    actions: 'Curage du caniveau sur 40 m, évacuation de 6 sacs de sable et de déchets.',
    commentaires: [{ de: 'agent1', h: 50, texte: 'Curage terminé, le caniveau s\'écoule normalement.' }],
  },
  {
    cle: 'R2', zone: 'hlm', dx: 65, dy: -90, adresse: 'Carrefour du marché HLM',
    categorie: 'assainissement', titre: 'Eaux stagnantes au carrefour du marché HLM',
    description: 'Une grande flaque d\'eau verdâtre stagne depuis plusieurs jours au carrefour. Les moustiques se multiplient et les enfants passent dedans pour aller à l\'école.',
    auteur: 'cit3', jours: 13, statut: 'cloture', agent: 'agent1', confirmation: true,
    actions: 'Débouchage de l\'avaloir et pompage de l\'eau stagnante.',
  },
  {
    cle: 'R3', zone: 'hlm', dx: 30, dy: -125, adresse: 'Marché HLM, HLM',
    categorie: 'assainissement', titre: 'Le caniveau du marché HLM est de nouveau obstrué',
    description: 'Après la pluie de cette semaine, le caniveau curé il y a quelques jours est à nouveau plein de déchets. L\'eau remonte jusqu\'aux étals.',
    auteur: 'cit1', jours: 8, statut: 'resolu', agent: 'agent1', confirmation: false,
    actions: 'Retrait des déchets à l\'entrée de l\'avaloir.',
    commentaires: [
      { de: 'cit1', h: 80, texte: 'L\'eau stagne encore ce matin, le problème n\'est pas réglé en profondeur.' },
      { de: 'resp', h: 84, interne: true, texte: 'Troisième signalement au même endroit en trois semaines : prévoir une grille de protection et une sensibilisation des commerçants.' },
    ],
  },
  {
    cle: 'R4', zone: 'hlm', dx: 55, dy: -105, adresse: 'Canal derrière le marché HLM',
    categorie: 'assainissement', titre: 'Canal rempli de déchets plastiques près du marché HLM',
    description: 'Le canal à ciel ouvert derrière le marché est complètement bouché par des bouteilles et des sachets. Avec les pluies annoncées, le quartier risque d\'être inondé comme l\'an dernier.',
    auteur: 'cit2', jours: 4.6, statut: 'a_verifier', soutiens: ['cit1'],
  },
  {
    cle: 'R5', zone: 'hlm', dx: 25, dy: -95, adresse: 'Rue du marché HLM',
    categorie: 'assainissement', titre: 'Eaux usées qui débordent sur la rue du marché HLM',
    description: 'De l\'eau noire et malodorante sort de l\'égout et coule sur la rue. Les commerçants ont posé des briques pour pouvoir passer.',
    auteur: 'cit3', jours: 1, statut: 'nouveau', soutiens: ['cit1', 'cit2'],
  },

  // --- Groupe de doublons n°1 : dépôt d'ordures à Grand Dakar (≈ 28 m, ≈ 19 h) ---
  {
    cle: 'D1a', zone: 'grand_dakar', dx: -120, dy: -80, adresse: 'Grand Dakar, près de la mosquée',
    categorie: 'dechets', titre: 'Dépôt sauvage d\'ordures près de la mosquée',
    description: 'Des habitants déposent leurs ordures sur le terrain vague à côté de la mosquée. Le tas grossit chaque jour et l\'odeur devient insupportable.',
    auteur: 'cit1', jours: 2, statut: 'nouveau', soutiens: ['cit3'],
  },
  {
    cle: 'D1b', zone: 'grand_dakar', dx: -100, dy: -60, adresse: 'Grand Dakar, près de la mosquée',
    categorie: 'dechets', titre: 'Tas d\'ordures qui bloque le trottoir',
    description: 'Un gros tas de déchets ménagers occupe tout le trottoir, les piétons doivent marcher sur la route.',
    auteur: 'cit2', jours: 1.2, statut: 'nouveau',
  },

  // --- Groupe de doublons n°2 : éclairage rue 11 à la Médina (≈ 28 m, 48 h) ---
  {
    cle: 'D2a', zone: 'medina', dx: -200, dy: 150, adresse: 'Rue 11, Médina',
    categorie: 'eclairage', titre: 'Lampadaires éteints rue 11',
    description: 'Trois lampadaires sont éteints depuis une semaine rue 11. La rue est complètement noire le soir et des passants se sont fait arracher leur téléphone.',
    auteur: 'cit3', jours: 2.5, statut: 'a_verifier',
  },
  {
    cle: 'D2b', zone: 'medina', dx: -180, dy: 170, adresse: 'Rue 11, Médina',
    categorie: 'eclairage', titre: 'Rue 11 plongée dans le noir',
    description: 'Plus aucun éclairage dans la rue 11 la nuit, c\'est dangereux pour celles et ceux qui rentrent tard du travail.',
    auteur: 'cit1', jours: 0.5, statut: 'nouveau',
  },

  // --- Colobane (marché) ------------------------------------------------------
  {
    cle: 'C1', zone: 'colobane', dx: 60, dy: -120, adresse: 'Arrière du marché Colobane',
    categorie: 'dechets', titre: 'Ordures accumulées derrière le marché Colobane',
    description: 'Les déchets du marché (cartons, restes de légumes) s\'entassent derrière les étals depuis plusieurs jours. Les rats sont de plus en plus nombreux.',
    auteur: 'cit1', jours: 20, statut: 'cloture', agent: 'agent2', confirmation: true,
    actions: 'Enlèvement de deux camions de déchets et nettoyage de l\'aire de dépôt.',
  },
  {
    cle: 'C2', zone: 'colobane', dx: -90, dy: 60, adresse: 'Rond-point de Colobane',
    categorie: 'voirie', titre: 'Nid-de-poule profond près du rond-point de Colobane',
    description: 'Un trou d\'environ un mètre de large s\'est formé sur la chaussée. Les taxis font des écarts brusques pour l\'éviter.',
    auteur: 'cit2', jours: 6, statut: 'en_cours', agent: 'agent2',
    commentaires: [{ de: 'agent2', h: 31, texte: 'Zone balisée. Rebouchage prévu demain matin avec l\'équipe voirie.' }],
  },
  {
    cle: 'C3', zone: 'colobane', dx: 100, dy: 40, adresse: 'Marché Colobane, côté est',
    categorie: 'dechets', titre: 'Déchets brûlés à ciel ouvert près du marché',
    description: 'Chaque soir, des tas d\'ordures sont brûlés à côté du marché. La fumée envahit les maisons voisines et fait tousser les enfants.',
    auteur: 'cit3', jours: 2, statut: 'affecte', agent: 'agent1', soutiens: ['cit1', 'cit2'],
  },
  {
    cle: 'C4', zone: 'colobane', dx: -40, dy: -150, adresse: 'Entrée du marché Colobane',
    categorie: 'voirie', titre: 'Trottoir effondré à l\'entrée du marché Colobane',
    description: 'Une partie du trottoir s\'est effondrée au-dessus du caniveau. Avec la foule du marché, quelqu\'un risque de tomber dans le trou.',
    auteur: 'cit1', jours: 5, statut: 'valide', priorite_validee: 'haute',
    commentaires: [{ de: 'resp', h: 9, interne: true, texte: 'Priorité relevée à Haute : forte affluence piétonne aux heures de marché, risque de chute.' }],
  },
  {
    cle: 'C5', zone: 'colobane', dx: 20, dy: 150, adresse: 'Allée principale du marché Colobane',
    categorie: 'eclairage', titre: 'Projecteur du marché en panne',
    description: 'Le grand projecteur qui éclaire l\'allée principale du marché ne s\'allume plus depuis plusieurs nuits.',
    auteur: 'cit2', jours: 7, statut: 'resolu', agent: 'agent2',
    actions: 'Remplacement de la lampe et du ballast du projecteur.',
  },
  {
    cle: 'C6', zone: 'colobane', dx: -120, dy: -40, adresse: 'Allée des poissonniers, marché Colobane',
    categorie: 'assainissement', titre: 'Regard d\'égout qui déborde dans l\'allée du marché',
    description: 'Le regard d\'égout au milieu de l\'allée déborde, les eaux usées coulent entre les étals de poisson.',
    auteur: 'cit3', jours: 3.8, statut: 'nouveau',
  },

  // --- Médina -------------------------------------------------------------------
  {
    cle: 'M1', zone: 'medina', dx: 150, dy: -100, adresse: 'Avenue Blaise Diagne, Médina',
    categorie: 'voirie', titre: 'Bouche d\'égout sans couvercle avenue Blaise Diagne',
    description: 'Le couvercle en fonte de la bouche d\'égout a disparu. Le trou est au bord de la chaussée, très dangereux la nuit.',
    auteur: 'cit3', jours: 17, statut: 'cloture', agent: 'agent2', confirmation: true,
    actions: 'Pose d\'un nouveau tampon en fonte.',
  },
  {
    cle: 'M2', zone: 'medina', dx: -60, dy: -180, adresse: 'Rue 13, Médina',
    categorie: 'dechets', titre: 'Bac à ordures renversé et non collecté',
    description: 'Le bac collectif de la rue 13 est renversé depuis le week-end, les déchets sont éparpillés sur la route.',
    auteur: 'cit1', jours: 4, statut: 'en_cours', agent: 'agent1',
    commentaires: [{ de: 'agent1', h: 31, texte: 'Sur place : ramassage en cours. Le bac est fissuré et devra être remplacé.' }],
  },
  {
    cle: 'M3', zone: 'medina', dx: 80, dy: 120, adresse: 'Devant l\'école élémentaire, Médina',
    categorie: 'assainissement', titre: 'Fuite d\'eaux usées devant une école',
    description: 'Une canalisation fuit devant l\'entrée de l\'école élémentaire. Les élèves marchent dans l\'eau sale en arrivant le matin.',
    auteur: 'cit2', jours: 3, statut: 'affecte', agent: 'agent2',
  },
  {
    cle: 'M4', zone: 'medina', dx: -250, dy: -50, adresse: 'Médina',
    categorie: 'autre', titre: 'Musique très forte toutes les nuits',
    description: 'Un bar diffuse de la musique à fort volume jusqu\'à 3 h du matin.',
    auteur: 'cit3', jours: 9, statut: 'rejete',
    justification: 'Hors périmètre : les nuisances sonores relèvent de la police municipale. Le citoyen a été orienté vers le bon interlocuteur.',
  },
  {
    cle: 'M5', zone: 'medina', dx: 200, dy: 50, adresse: 'Médina, près de la Grande Mosquée',
    categorie: 'dechets', titre: 'Gravats abandonnés sur la chaussée',
    description: 'Des gravats de chantier ont été déversés sur la route et réduisent la circulation à une seule voie.',
    auteur: 'cit2', jours: 15, statut: 'cloture', agent: 'agent1', confirmation: true,
    actions: 'Évacuation des gravats par camion benne. Le propriétaire du chantier a été averti.',
  },
  {
    cle: 'M6', zone: 'medina', dx: -30, dy: 200, adresse: 'Rue 6, Médina',
    categorie: 'eclairage', titre: 'Lampadaire qui clignote devant la pharmacie',
    description: 'Le lampadaire devant la pharmacie s\'allume et s\'éteint sans arrêt toute la nuit.',
    auteur: 'cit2', jours: 4, statut: 'a_verifier',
  },

  // --- Grand Dakar --------------------------------------------------------------
  {
    cle: 'G1', zone: 'grand_dakar', dx: 150, dy: -200, adresse: 'Rue principale, Grand Dakar',
    categorie: 'voirie', titre: 'Chaussée dégradée sur la rue principale',
    description: 'La route est pleine de trous sur une centaine de mètres. Les cars rapides abîment leurs pneus et montent sur le trottoir pour les éviter.',
    auteur: 'cit3', jours: 18, statut: 'cloture', agent: 'agent2', confirmation: true,
    actions: 'Rebouchage de 12 nids-de-poule à l\'enrobé à froid.',
  },
  {
    cle: 'G2', zone: 'grand_dakar', dx: -200, dy: 100, adresse: 'Grand Dakar',
    categorie: 'assainissement', titre: 'Caniveau qui déborde après chaque averse',
    description: 'Le caniveau de la rue déborde à chaque pluie et l\'eau entre dans les cours des maisons.',
    auteur: 'cit1', jours: 5, statut: 'en_cours', agent: 'agent1', reaffectation: { agent: 'agent2', h: 27 },
    commentaires: [
      { de: 'agent1', h: 24, interne: true, texte: 'Caniveau bouché en profondeur, il faut un camion hydrocureur. Je demande une réaffectation à l\'équipe équipée.' },
      { de: 'agent2', h: 33, texte: 'Hydrocurage commencé, environ la moitié du tronçon est dégagée.' },
    ],
  },
  {
    cle: 'G3', zone: 'grand_dakar', dx: 50, dy: -250, adresse: 'Carrefour, Grand Dakar',
    categorie: 'eclairage', titre: 'Carrefour sans éclairage public',
    description: 'Les lampadaires du carrefour sont éteints, les voitures ne voient pas les piétons qui traversent.',
    auteur: 'cit2', jours: 3.5, statut: 'affecte', agent: 'agent1',
  },
  {
    cle: 'G4', zone: 'grand_dakar', dx: -250, dy: -150, adresse: 'Arrêt de bus, Grand Dakar',
    categorie: 'autre', titre: 'Grosse branche prête à tomber sur l\'arrêt de bus',
    description: 'Une branche du caïlcédrat est fendue et pend au-dessus de l\'arrêt de bus. Beaucoup de monde attend dessous.',
    auteur: 'cit3', jours: 4, statut: 'valide',
  },
  {
    cle: 'G6', zone: 'grand_dakar', dx: 200, dy: 150, adresse: 'Rue 10, Grand Dakar',
    categorie: 'dechets', titre: 'Bac à ordures débordant rue 10',
    description: 'Le bac à ordures n\'a pas été vidé depuis une semaine, les sacs s\'entassent autour.',
    auteur: 'cit1', jours: 12, statut: 'cloture', agent: 'agent1', confirmation: true,
    actions: 'Vidage du bac et ramassage des sacs autour. Fréquence de collecte signalée au concessionnaire.',
  },
  {
    cle: 'G5', zone: 'grand_dakar', dx: 220, dy: 170, adresse: 'Rue 10, Grand Dakar',
    categorie: 'dechets', titre: 'Ordures partout autour du bac de la rue 10',
    description: 'Les ordures débordent du bac et les chiens les éparpillent dans la rue.',
    auteur: 'cit3', jours: 11, statut: 'doublon', doublon_de: 'G6',
    justification: 'Même bac que le signalement « Bac à ordures débordant rue 10 », déjà pris en charge.',
  },

  // --- HLM (autres) -------------------------------------------------------------
  {
    cle: 'H1', zone: 'hlm', dx: -150, dy: 180, adresse: 'Entrée de HLM 5',
    categorie: 'voirie', titre: 'Nid-de-poule profond à l\'entrée de HLM 5',
    description: 'Un nid-de-poule très profond s\'est formé à l\'entrée du quartier, les motos tombent régulièrement.',
    auteur: 'cit3', jours: 6, statut: 'resolu', agent: 'agent1', confirmation: true,
    actions: 'Rebouchage à l\'enrobé à froid et compactage.',
  },
  {
    cle: 'H2', zone: 'hlm', dx: 200, dy: 50, adresse: 'HLM 4',
    categorie: 'eclairage', titre: 'Rue de HLM 4 sans éclairage',
    description: 'Toute la rue est dans le noir depuis la coupure de la semaine dernière.',
    auteur: 'cit1', jours: 16, statut: 'cloture', agent: 'agent2', confirmation: true,
    actions: 'Réparation du câble d\'alimentation et remise en service de 5 lampadaires.',
  },
  {
    cle: 'H3', zone: 'hlm', dx: -60, dy: -60, adresse: 'Bord du canal, HLM',
    categorie: 'dechets', titre: 'Sacs d\'ordures jetés le long du canal',
    description: 'Des sacs poubelles sont jetés chaque nuit le long du canal, certains tombent dedans.',
    auteur: 'cit1', jours: 1.5, statut: 'a_verifier',
  },
  {
    cle: 'H4', zone: 'hlm', dx: 120, dy: -20, adresse: 'HLM',
    categorie: 'autre', suggestion: 'eclairage', titre: 'Câble électrique qui pend au-dessus de la rue',
    description: 'Un câble est tombé d\'un poteau et pend à hauteur de tête au-dessus de la rue. Personne ne sait s\'il est encore sous tension.',
    auteur: 'cit2', jours: 0.3, statut: 'nouveau',
  },
];

// -----------------------------------------------------------------------------
// Calculs (positions, priorité explicable, chronologie)
// -----------------------------------------------------------------------------

const MAINTENANT = Date.now();
const H = 3600 * 1000;

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2
    + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

function position(s: Spec) {
  const z = ZONES[s.zone];
  return {
    lat: Number((z.lat + s.dy / 111320).toFixed(6)),
    lng: Number((z.lng + s.dx / (111320 * Math.cos((z.lat * Math.PI) / 180))).toFixed(6)),
  };
}

// Même règle que public.zone_du_point : zones à risque d'abord, puis la plus proche.
function zoneDuPoint(lat: number, lng: number): CleZone | null {
  const candidates = (Object.keys(ZONES) as CleZone[])
    .map((k) => ({ k, d: distanceM(lat, lng, ZONES[k].lat, ZONES[k].lng), risque: ZONES[k].risque !== null }))
    .filter((c) => c.d <= ZONES[c.k].rayon_m)
    .sort((a, b) => Number(b.risque) - Number(a.risque) || a.d - b.d);
  return candidates[0]?.k ?? null;
}

const creeLe = (s: Spec) => MAINTENANT - s.jours * 24 * H;
const pos = new Map(SPECS.map((s) => [s.cle, position(s)]));
const NON_TRAITES: Statut[] = ['nouveau', 'a_verifier', 'valide', 'affecte'];

// Priorité explicable (règles de CLAUDE.md), miroir de public.calculer_priorite : la base fait foi
// (score recalculé par trigger) ; ce calcul sert au --dry-run et à la priorité validée par le responsable.
function priorite(s: Spec) {
  const p = pos.get(s.cle)!;
  const zone = ZONES[s.zone];
  const voisins = SPECS.filter((o) => o.cle !== s.cle && o.categorie === s.categorie && !['rejete', 'doublon'].includes(o.statut)
    && distanceM(p.lat, p.lng, pos.get(o.cle)!.lat, pos.get(o.cle)!.lng) < 100).length;
  const nbSoutiens = s.soutiens?.length ?? 0;
  const nonTraite = NON_TRAITES.includes(s.statut) && MAINTENANT - creeLe(s) > 72 * H;

  const criteres = [
    { code: 'gravite', libelle: `Gravité de la catégorie ${LIBELLE_CATEGORIE[s.categorie]}`, points: GRAVITE[s.categorie] },
    {
      code: 'zone_risque',
      libelle: zone.risque ? `Zone à risque : ${zone.nom} (${LIBELLE_RISQUE[zone.risque]})` : `Zone ${zone.nom} : pas de risque particulier`,
      points: zone.risque ? 2 : 0,
    },
    {
      code: 'similaires',
      libelle: `${voisins} signalement(s) similaire(s) à moins de 100 m (seuil : 3)`,
      points: voisins >= 3 ? 2 : 0,
    },
    {
      code: 'anciennete',
      libelle: nonTraite ? 'Non traité depuis plus de 72 h' : 'Pris en charge ou signalé il y a moins de 72 h',
      points: nonTraite ? 1 : 0,
    },
    { code: 'soutiens', libelle: `${nbSoutiens} soutien(s) « Moi aussi » (seuil : 3)`, points: nbSoutiens >= 3 ? 1 : 0 },
  ];
  const total = criteres.reduce((t, c) => t + c.points, 0);
  const niveau: Niveau = total >= 6 ? 'haute' : total >= 4 ? 'moyenne' : 'basse';
  return { total, niveau, criteres };
}

// Étapes franchies par un signalement, avec leur date.
function etapes(s: Spec): { statut: Statut; t: number }[] {
  const chemin: Statut[] = s.statut === 'rejete' || s.statut === 'doublon'
    ? ['a_verifier', s.statut]
    : CYCLE.slice(1, CYCLE.indexOf(s.statut) + 1);
  return chemin.map((st) => ({ statut: st, t: creeLe(s) + HEURES[st] * H }));
}

const iso = (t: number) => new Date(t).toISOString();

// -----------------------------------------------------------------------------
// Vérifications (aussi exécutées en --dry-run)
// -----------------------------------------------------------------------------

function verifier() {
  const erreurs: string[] = [];
  for (const s of SPECS) {
    const p = pos.get(s.cle)!;
    const z = zoneDuPoint(p.lat, p.lng);
    if (z !== s.zone) erreurs.push(`${s.cle} : tombe dans la zone ${z} au lieu de ${s.zone}`);
    const dates = [...etapes(s).map((e) => e.t), ...(s.commentaires ?? []).map((c) => creeLe(s) + c.h * H)];
    if (s.reaffectation) dates.push(creeLe(s) + s.reaffectation.h * H);
    if (dates.some((t) => t >= MAINTENANT)) erreurs.push(`${s.cle} : événement daté dans le futur`);
    if (s.soutiens?.includes(s.auteur)) erreurs.push(`${s.cle} : l'auteur se soutient lui-même`);
    if (['affecte', 'en_cours', 'resolu', 'cloture'].includes(s.statut) !== Boolean(s.agent)) {
      erreurs.push(`${s.cle} : agent incohérent avec le statut ${s.statut}`);
    }
  }
  if (erreurs.length) throw new Error('Données de démo incohérentes :\n' + erreurs.join('\n'));

  // Doublons potentiels selon la règle : même catégorie, < 50 m, < 72 h, statuts non clos.
  const ouverts = SPECS.filter((s) => !['resolu', 'cloture', 'rejete', 'doublon'].includes(s.statut));
  const paires: string[] = [];
  for (let i = 0; i < ouverts.length; i++) {
    for (let j = i + 1; j < ouverts.length; j++) {
      const [a, b] = [ouverts[i], ouverts[j]];
      const d = distanceM(pos.get(a.cle)!.lat, pos.get(a.cle)!.lng, pos.get(b.cle)!.lat, pos.get(b.cle)!.lng);
      const ecartH = Math.abs(creeLe(a) - creeLe(b)) / H;
      if (a.categorie === b.categorie && d < 50 && ecartH < 72) {
        paires.push(`${a.cle} ↔ ${b.cle} (${Math.round(d)} m, ${Math.round(ecartH)} h)`);
      }
    }
  }
  return paires;
}

// -----------------------------------------------------------------------------
// Écriture dans Supabase
// -----------------------------------------------------------------------------

function verif<R extends { data: unknown; error: { message: string } | null }>(res: R, etape: string) {
  if (res.error) throw new Error(`${etape} : ${res.error.message}`);
  return res.data as NonNullable<R['data']>;
}

async function main() {
  const paires = verifier();
  console.log(`✔ ${SPECS.length} signalements cohérents. Doublons potentiels : ${paires.join(' ; ') || 'aucun'}`);

  if (process.argv.includes('--dry-run')) {
    for (const s of SPECS) {
      const p = priorite(s);
      console.log(`${s.cle.padEnd(4)} ${s.zone.padEnd(12)} ${s.categorie.padEnd(15)} ${s.statut.padEnd(11)} score ${p.total} → ${p.niveau}`);
    }
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SECRET_KEY;
  const motDePasse = process.env.SEED_DEMO_PASSWORD;
  if (!url || !cle || !motDePasse) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY et SEED_DEMO_PASSWORD doivent être définis dans .env.local');
  }
  const sb = createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Nettoyage des données de démo précédentes
  const { users } = verif(await sb.auth.admin.listUsers({ page: 1, perPage: 1000 }), 'Liste des comptes');
  const anciens = users.filter((u) => u.email?.endsWith(`@${DOMAINE}`)).map((u) => u.id);
  if (anciens.length) {
    verif(await sb.from('signalements').delete().in('auteur_id', anciens), 'Suppression des signalements');
    verif(await sb.from('interventions').delete().in('agent_id', anciens), 'Suppression des interventions');
    for (const id of anciens) verif(await sb.auth.admin.deleteUser(id), 'Suppression d\'un compte');
  }
  verif(await sb.from('communes').delete().eq('nom', COMMUNE.nom), 'Suppression de la commune');
  console.log(`✔ Nettoyage : ${anciens.length} compte(s) de démo supprimé(s)`);

  // 2. Commune et zones
  const [commune] = verif(await sb.from('communes').insert(COMMUNE).select('id'), 'Création de la commune');
  const zonesCreees = verif(await sb.from('zones').insert(
    (Object.keys(ZONES) as CleZone[]).map((k) => {
      const z = ZONES[k];
      return {
        commune_id: commune.id, nom: z.nom, est_zone_risque: z.risque !== null, type_risque: z.risque,
        centre_lat: z.lat, centre_lng: z.lng, rayon_m: z.rayon_m,
      };
    }),
  ).select('id, nom'), 'Création des zones');
  const zoneId = (k: CleZone) => zonesCreees.find((z) => z.nom === ZONES[k].nom)!.id;

  // 3. Comptes (le trigger crée le profil citoyen, on ajuste ensuite le rôle)
  const uid = {} as Record<CleCompte, string>;
  for (const k of Object.keys(COMPTES) as CleCompte[]) {
    const c = COMPTES[k];
    const { user } = verif(await sb.auth.admin.createUser({
      email: c.email, password: motDePasse, email_confirm: true, user_metadata: { nom_complet: c.nom },
    }), `Création du compte ${c.email}`);
    uid[k] = user!.id;
    verif(await sb.from('profils').update({
      role: c.role, nom_complet: c.nom, commune_id: c.role === 'citoyen' ? null : commune.id,
    }).eq('id', user!.id), `Profil ${c.email}`);
  }
  console.log(`✔ ${Object.keys(COMPTES).length} comptes créés`);

  // 4. Signalements (état final directement ; les originaux avant les doublons)
  const id = new Map(SPECS.map((s) => [s.cle, randomUUID()]));
  const ordre = [...SPECS].sort((a, b) => Number(Boolean(a.doublon_de)) - Number(Boolean(b.doublon_de)));
  const historique: Record<string, unknown>[] = [];

  const lignes = ordre.map((s) => {
    const p = pos.get(s.cle)!;
    const prio = priorite(s);
    const et = etapes(s);
    const date = (st: Statut) => et.find((e) => e.statut === st)?.t;
    const tValide = date('valide');
    const tResolu = date('resolu');
    const priorite_validee = tValide ? (s.priorite_validee ?? prio.niveau) : null;
    const auteurEtape = (st: Statut, t: number) => {
      if (st === 'en_cours' || st === 'resolu') {
        return s.reaffectation && t > creeLe(s) + s.reaffectation.h * H ? uid[s.reaffectation.agent] : uid[s.agent!];
      }
      return uid.resp;
    };

    let precedent: Statut = 'nouveau';
    for (const e of et) {
      historique.push({
        signalement_id: id.get(s.cle), auteur_id: auteurEtape(e.statut, e.t), action: 'statut', interne: false,
        ancienne_valeur: precedent, nouvelle_valeur: e.statut, created_at: iso(e.t),
        details: e.statut === 'rejete' || e.statut === 'doublon'
          ? { justification: s.justification, doublon_de: s.doublon_de ? id.get(s.doublon_de) : null }
          : null,
      });
      precedent = e.statut;
    }
    if (tValide) {
      historique.push({
        signalement_id: id.get(s.cle), auteur_id: uid.resp, action: 'priorite', interne: true,
        ancienne_valeur: prio.niveau, nouvelle_valeur: priorite_validee, created_at: iso(tValide + 60 * 1000),
        details: {
          priorite_suggeree: prio.niveau, score: prio.total,
          justification: priorite_validee === prio.niveau ? 'Suggestion confirmée après vérification.' : 'Ajustée après vérification sur place.',
        },
      });
    }

    return {
      id: id.get(s.cle),
      auteur_id: uid[s.auteur],
      commune_id: commune.id,
      zone_id: zoneId(s.zone),
      titre: s.titre,
      description: s.description,
      categorie: s.categorie,
      categorie_suggeree: s.suggestion ?? s.categorie,
      latitude: p.lat,
      longitude: p.lng,
      adresse: s.adresse,
      statut: s.statut,
      justification: s.justification ?? null,
      doublon_de: s.doublon_de ? id.get(s.doublon_de) : null,
      priorite_validee,   // score, niveau suggéré et détail : calculés par la base (trigger)
      priorite_validee_par: tValide ? uid.resp : null,
      priorite_validee_le: tValide ? iso(tValide + 60 * 1000) : null,
      resolution_confirmee: tResolu ? (s.confirmation ?? null) : null,
      resolution_confirmee_le: tResolu && s.confirmation !== undefined ? iso(tResolu + 12 * H) : null,
      resolu_le: tResolu ? iso(tResolu) : null,
      cloture_le: date('cloture') ? iso(date('cloture')!) : null,
      created_at: iso(creeLe(s)),
      updated_at: iso(et.length ? et[et.length - 1].t : creeLe(s)),
    };
  });
  verif(await sb.from('signalements').insert(lignes), 'Création des signalements');

  // Le trigger journalise la création avec le statut final : on remet « nouveau ».
  verif(await sb.from('historique').update({ nouvelle_valeur: 'nouveau' })
    .eq('action', 'creation').in('signalement_id', [...id.values()]), 'Historique de création');
  verif(await sb.from('historique').insert(historique), 'Historique des statuts et priorités');
  console.log(`✔ ${lignes.length} signalements, ${historique.length} lignes d'historique`);

  // 5. Interventions (le trigger journalise chaque affectation) : premières affectations,
  //    puis réaffectations, pour que l'historique retrouve l'agent précédent.
  const avecAgent = SPECS.filter((s) => s.agent);
  const intervention = (s: Spec, agent: Agent, t: number, active: boolean, fin: number | null) => ({
    signalement_id: id.get(s.cle), agent_id: uid[agent], affecte_par: uid.resp,
    date_affectation: iso(t), active, actions_realisees: active ? (s.actions ?? null) : null,
    date_fin: fin ? iso(fin) : null,
  });
  verif(await sb.from('interventions').insert(avecAgent.map((s) => {
    const tAffecte = creeLe(s) + HEURES.affecte * H;
    const tResolu = etapes(s).find((e) => e.statut === 'resolu')?.t ?? null;
    return s.reaffectation
      ? intervention(s, s.agent!, tAffecte, false, creeLe(s) + s.reaffectation.h * H)
      : intervention(s, s.agent!, tAffecte, true, tResolu);
  })), 'Création des interventions');
  const reaff = avecAgent.filter((s) => s.reaffectation);
  if (reaff.length) {
    verif(await sb.from('interventions').insert(reaff.map((s) => {
      const tResolu = etapes(s).find((e) => e.statut === 'resolu')?.t ?? null;
      return intervention(s, s.reaffectation!.agent, creeLe(s) + s.reaffectation!.h * H, true, tResolu);
    })), 'Réaffectations');
  }
  console.log(`✔ ${avecAgent.length + reaff.length} interventions`);

  // 6. Commentaires (le trigger journalise chacun)
  const commentaires = SPECS.flatMap((s) => (s.commentaires ?? []).map((c) => ({
    signalement_id: id.get(s.cle), auteur_id: uid[c.de], contenu: c.texte,
    interne: c.interne ?? false, created_at: iso(creeLe(s) + c.h * H),
  })));
  verif(await sb.from('commentaires').insert(commentaires), 'Création des commentaires');

  // 7. Soutiens « Moi aussi » (le trigger met à jour nb_soutiens)
  const soutiens = SPECS.flatMap((s) => (s.soutiens ?? []).map((c) => ({
    signalement_id: id.get(s.cle), citoyen_id: uid[c],
  })));
  verif(await sb.from('soutiens').insert(soutiens), 'Création des soutiens');
  console.log(`✔ ${commentaires.length} commentaires, ${soutiens.length} soutiens`);

  // Priorités : recalcul global (voisins insérés en lot, soutiens, ancienneté).
  const recalcul = verif(await sb.rpc('recalculer_priorites'), 'Recalcul des priorités');
  console.log(`✔ Priorités recalculées par la base (${recalcul} signalement(s) mis à jour)`);

  // 8. Notifications (créées par trigger depuis l'historique) : l'ancien est déjà lu.
  verif(await sb.from('notifications').update({ lue: true })
    .in('destinataire_id', Object.values(uid))
    .lt('created_at', iso(MAINTENANT - 48 * H)), 'Notifications anciennes');
  console.log('Terminé. Comptes et scénario : voir DEMO.md');
}

main().catch((e: unknown) => {
  console.error('✖', e instanceof Error ? e.message : e);
  process.exit(1);
});
