import L from 'leaflet';
import { CATEGORIES, type Categorie } from '@/lib/domaine';

const cache = new Map<string, L.DivIcon>();

const svg = (traces: string[]) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${traces
    .map((d) => `<path d="${d}"/>`)
    .join('')}</svg>`;

// Marqueur rond coloré par catégorie ; estompé pour les problèmes résolus ou clôturés.
export function iconeCategorie(categorie: Categorie, estompe = false) {
  const cle = `${categorie}-${estompe}`;
  let icone = cache.get(cle);
  if (!icone) {
    const { couleur, encre, icone: traces } = CATEGORIES[categorie];
    icone = L.divIcon({
      className: `marqueur-civisense${estompe ? ' estompe' : ''}`,
      html: `<span style="background:${couleur};color:${encre ?? '#fff'}">${svg(traces)}</span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14],
    });
    cache.set(cle, icone);
  }
  return icone;
}

// Repère de la position choisie dans le formulaire.
export const iconePosition = L.divIcon({
  className: 'marqueur-position',
  html: '<span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});
