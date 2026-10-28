import { CATEGORIES, type Categorie } from './domaine';

// Suggestion de catégorie : l'IA (ou les mots-clés) suggère, le citoyen décide.
export type SourceSuggestion = 'ia' | 'mots_cles';
export type Suggestion = {
  categorie: Categorie;
  confiance: number;          // 0–1, jamais présentée comme une certitude
  justification: string;
  source: SourceSuggestion;
};

// Radicaux sans accents (le texte est normalisé). Quelques mots wolof courants à Dakar :
// mbalit (ordures), tilim (sale), ndox (eau), yoon (route), lëndëm (obscurité), kurant (courant), lamp.
const MOTS_CLES: Record<Exclude<Categorie, 'autre'>, string[]> = {
  assainissement: [
    'caniveau', 'egout', 'eaux usees', 'eau usee', 'fosse', 'inond', 'stagn', 'debord',
    'latrine', 'canalisation', 'puisard', 'odeur', 'moustique', 'ndox',
  ],
  dechets: [
    'dechet', 'ordure', 'poubelle', 'bac a', 'bac ', 'plastique', 'decharge', 'immondice', 'brul',
    'gravat', 'encombrant', 'salete', 'sacs', 'collecte', 'mbalit', 'tilim',
  ],
  voirie: [
    'route', 'chaussee', 'nid-de-poule', 'nid de poule', 'trou', 'goudron', 'bitume', 'trottoir',
    'pave', 'fissure', 'effondr', 'dos d\'ane', 'ralentisseur', 'carrefour degrade', 'yoon',
  ],
  eclairage: [
    'lampadaire', 'eclairage', 'lampe', 'ampoule', 'lumiere', 'eteint', 'obscur', 'noir la nuit',
    'projecteur', 'poteau', 'panne de courant', 'lendem', 'kurant', 'lamp ',
  ],
};

export const normaliser = (texte: string) =>
  texte.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

// Repli hors ligne : compte les radicaux trouvés par catégorie. null si aucun indice.
export function classerParMotsCles(texte: string): Suggestion | null {
  const t = ` ${normaliser(texte)} `;
  const resultats = (Object.keys(MOTS_CLES) as Exclude<Categorie, 'autre'>[])
    .map((categorie) => ({ categorie, trouves: MOTS_CLES[categorie].filter((m) => t.includes(m)) }))
    .filter((r) => r.trouves.length > 0)
    .sort((a, b) => b.trouves.length - a.trouves.length);
  if (!resultats.length) return null;

  const [meilleur] = resultats;
  const total = resultats.reduce((n, r) => n + r.trouves.length, 0);
  // Confiance volontairement modeste : quelques mots ne suffisent pas à trancher.
  const confiance = Math.min(0.8, 0.3 + 0.15 * meilleur.trouves.length) * (meilleur.trouves.length / total);
  return {
    categorie: meilleur.categorie,
    confiance: Math.round(confiance * 100) / 100,
    justification: `Mots repérés : ${meilleur.trouves.join(', ')}.`,
    source: 'mots_cles',
  };
}

export const libelleSource = (s: SourceSuggestion) => (s === 'ia' ? 'suggestion de l\'IA' : 'suggestion par mots-clés');
export const libelleCategorie = (c: Categorie) => CATEGORIES[c].libelle;
