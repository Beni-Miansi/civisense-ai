/**
 * Vidéo de démonstration CiviSense AI pour le jury (MP4 H.264 1920×1080, ~4 min 40).
 *
 *   npm run demo:video
 *
 * Variables (facultatives) :
 *   DEMO_URL          URL de production à filmer (sinon : serveur local `next start` lancé sur le port 3100)
 *   DEMO_LIEN_PUBLIC  lien affiché sur l'écran de fin (par défaut : DEMO_URL)
 *   DEMO_SANS_SEED=1  ne pas réinitialiser les données de démo avant l'enregistrement
 *
 * Sorties : videos/civisense-demo.mp4 et videos/chapitres.txt (début réel de chaque scène, pour la voix off).
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { chromium, type FrameLocator, type Locator, type Page } from 'playwright';

const RACINE = process.cwd();
const DOSSIER = path.join(RACINE, 'videos');
const BRUT = path.join(DOSSIER, 'brut');
const PORT = 3100;
const BASE = (process.env.DEMO_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '');
const LIEN_PUBLIC = process.env.DEMO_LIEN_PUBLIC ?? (process.env.DEMO_URL ? BASE : 'Lien communiqué avec le dossier de candidature');
const MOT_DE_PASSE = process.env.SEED_DEMO_PASSWORD ?? '';

const COMPTES = {
  citoyen: 'citoyen4@demo.civisense.sn',      // Mariama Faye : aucun signalement, aucun soutien
  responsable: 'responsable@demo.civisense.sn', // Awa Ndiaye
  agent: 'agent1@demo.civisense.sn',            // Moussa Diop
};
// À ~12 m du signalement « Eaux usées qui débordent sur la rue du marché HLM » (doublon proposé).
const POSITION = { latitude: 14.71224, longitude: -17.44583, accuracy: 8 };
const TITRE = 'Caniveau bouché, l\'eau stagne devant l\'école';
const DESCRIPTION = 'L\'eau ne s\'écoule plus depuis trois jours : elle stagne devant l\'entrée de l\'école et dégage une forte odeur. Les enfants doivent passer dedans.';

// Durées cibles (s) : chaque scène est complétée par une pause pour rester calée sur la voix off.
const SCENES = [
  { titre: 'Le problème et la solution', duree: 10 },
  { titre: 'Citoyen : signaler un problème', duree: 60 },
  { titre: 'Carte interactive', duree: 15 },
  { titre: 'Responsable : prioriser et affecter', duree: 60 },
  { titre: 'Agent (mobile) : intervenir et prouver', duree: 40 },
  { titre: 'Citoyen : confirmer la résolution', duree: 25 },
  { titre: 'Responsable : contrôler et clôturer', duree: 30 },
  { titre: 'Tableau de bord et export CSV', duree: 18 },
  { titre: 'IA responsable et sécurité', duree: 12 },
  { titre: 'Fin', duree: 10 },
];

type EtatSousTitre = { cle: string; etape: string; titre: string; texte: string; cote: boolean } | null;
type FenetreDemo = { __demoSousTitre?: (e: EtatSousTitre) => void };

// ----------------------------------------------------------------------------- Préparation

function reinitialiserDonnees() {
  if (process.env.DEMO_SANS_SEED) return;
  console.log('▶ Réinitialisation des données de démo (seed)…');
  execFileSync(process.execPath, ['--env-file-if-exists=.env.local', 'scripts/seed.mts'], { stdio: 'inherit' });
}

async function attendreServeur(url: string, delaiMs = 60_000) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Serveur injoignable : ${url}`);
}

async function demarrerServeur(): Promise<ChildProcess | null> {
  if (process.env.DEMO_URL) return null;
  const next = path.join(RACINE, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!existsSync(path.join(RACINE, '.next', 'BUILD_ID'))) {
    console.log('▶ Build de production…');
    execFileSync(process.execPath, [next, 'build'], { stdio: 'inherit' });
  }
  console.log(`▶ Serveur de production sur ${BASE}`);
  const serveur = spawn(process.execPath, [next, 'start', '-p', String(PORT)], { stdio: 'ignore' });
  await attendreServeur(`${BASE}/connexion`);
  return serveur;
}

// Photos d'illustration (avant / après), dessinées puis capturées en JPEG.
function scenePhoto(apres: boolean) {
  const eau = apres
    ? '<rect x="0" y="560" width="1600" height="90" fill="#9ca3af"/><rect x="0" y="575" width="1600" height="20" fill="#6b7280"/>'
    : '<rect x="0" y="540" width="1600" height="140" fill="#5b4a2e"/><ellipse cx="800" cy="610" rx="700" ry="60" fill="#7a6a3a" opacity=".8"/>'
      + '<circle cx="420" cy="600" r="22" fill="#e5e7eb"/><rect x="980" y="585" width="70" height="28" rx="6" fill="#2563eb"/><circle cx="1240" cy="615" r="16" fill="#f97316"/>';
  return `<!doctype html><html><body style="margin:0">
  <svg width="1600" height="1200" viewBox="0 0 1600 1200" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#e0f2fe"/></linearGradient></defs>
    <rect width="1600" height="540" fill="url(#ciel)"/>
    <rect x="80" y="170" width="620" height="370" fill="#fde68a"/><rect x="80" y="140" width="620" height="40" fill="#b45309"/>
    <text x="390" y="250" font-family="Arial" font-size="44" font-weight="bold" fill="#92400e" text-anchor="middle">ÉCOLE</text>
    <rect x="160" y="300" width="110" height="140" fill="#93c5fd"/><rect x="510" y="300" width="110" height="140" fill="#93c5fd"/><rect x="330" y="370" width="120" height="170" fill="#78350f"/>
    <rect x="860" y="230" width="560" height="310" fill="#e7e5e4"/><rect x="920" y="290" width="120" height="110" fill="#93c5fd"/><rect x="1240" y="290" width="120" height="110" fill="#93c5fd"/>
    ${eau}
    <rect x="0" y="680" width="1600" height="520" fill="#a8a29e"/><rect x="0" y="680" width="1600" height="16" fill="#78716c"/>
    <rect x="1180" y="1110" width="380" height="60" rx="10" fill="rgba(0,0,0,.55)"/>
    <text x="1370" y="1150" font-family="Arial" font-size="28" fill="#fff" text-anchor="middle">Photo de démonstration</text>
  </svg></body></html>`;
}

// ----------------------------------------------------------------------------- Écrans injectés

const POLICE = 'font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;';
const FOND = 'background: radial-gradient(circle at 20% 20%, #115e59 0%, #064e3b 45%, #022c22 100%); color: #fff;';

function ecran(contenu: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>CiviSense AI</title>
  <style>
    body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center; ${POLICE} ${FOND} }
    .bloc { max-width: 1100px; padding: 40px; zoom: 1.3333; animation: entree .9s ease-out both; }
    h1 { font-size: 84px; margin: 0; letter-spacing: -2px; }
    .slogan { font-size: 32px; color: #a7f3d0; margin: 14px 0 36px; }
    .colonnes { display:grid; grid-template-columns: repeat(3, 1fr); gap: 22px; text-align:left; }
    .carte { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18); border-radius: 18px; padding: 22px 24px; }
    .carte h2 { margin: 0 0 10px; font-size: 24px; color: #6ee7b7; }
    .carte p, .carte li { font-size: 19px; line-height: 1.45; color: #ecfdf5; margin: 6px 0; }
    .carte ul { margin: 0; padding-left: 20px; }
    .petit { color: #a7f3d0; font-size: 20px; margin-top: 30px; }
    @keyframes entree { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
  </style></head><body><div class="bloc">${contenu}</div></body></html>`;
}

const LOGO = `<svg width="86" height="86" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" stroke-width="1.6" style="vertical-align:middle;margin-right:14px">
  <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><path d="m9 10 2 2 4-4"/></svg>`;

const PAGES: Record<string, string> = {
  titre: ecran(`<div style="text-align:center">
    <h1>${LOGO}CiviSense AI</h1>
    <p class="slogan">Du signalement d'un problème urbain à sa résolution prouvée</p>
    <div class="colonnes">
      <div class="carte"><h2>Le problème</h2><p>Déchets, caniveaux bouchés, éclairage en panne : les habitants ne savent pas à qui signaler, la mairie ne sait pas quoi traiter en premier.</p></div>
      <div class="carte"><h2>La solution</h2><p>Une plateforme unique : le citoyen signale, la mairie priorise et affecte, l'agent intervient et prouve la résolution.</p></div>
      <div class="carte"><h2>L'IA en appui</h2><p>Catégorie suggérée, doublons détectés, priorité expliquée. L'IA suggère, l'humain décide.</p></div>
    </div>
    <p class="petit">Démonstration · Dakar (données fictives) · Panafricode</p></div>`),
  ia: ecran(`<h1 style="font-size:60px;text-align:center">IA responsable et sécurité</h1>
    <p class="slogan" style="text-align:center">Une IA utile, mesurée et sous contrôle humain</p>
    <div class="colonnes">
      <div class="carte"><h2>L'IA suggère, l'humain décide</h2><ul>
        <li>Le citoyen choisit la catégorie</li><li>Le responsable valide la priorité, avec un motif tracé</li>
        <li>Les doublons sont suggérés, jamais supprimés</li><li>Les erreurs de l'IA sont mesurées</li></ul></div>
      <div class="carte"><h2>Accès par rôle</h2><ul>
        <li>Règles imposées par la base de données (RLS)</li><li>Un agent ne modifie que ses interventions</li>
        <li>Un citoyen ne voit que ses signalements</li><li>Chaque action est historisée</li></ul></div>
      <div class="carte"><h2>Données personnelles</h2><ul>
        <li>Position publique arrondie à ~100 m</li><li>Photos privées, liens temporaires</li>
        <li>Aucune reconnaissance faciale</li><li>Repli hors IA si le réseau tombe</li></ul></div>
    </div>`),
  fin: ecran(`<div style="text-align:center">
    <h1>${LOGO}CiviSense AI</h1>
    <p class="slogan">Merci de votre attention</p>
    <div class="carte" style="max-width:760px;margin:0 auto;text-align:center">
      <p style="font-size:24px"><strong>Béni Miansi</strong> · développement full stack</p>
      <p>Projet porté par <strong>Panafricode</strong> · prototype réalisé en 3 jours</p>
      <p style="font-size:22px;color:#6ee7b7;margin-top:18px">${LIEN_PUBLIC}</p>
    </div></div>`),
  mobile: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>CiviSense AI · agent</title>
  <style>
    body { margin:0; height:100vh; display:flex; align-items:center; justify-content:flex-end; padding-right: 300px; box-sizing: border-box;
           background: radial-gradient(circle at 70% 40%, #1e293b 0%, #0f172a 60%, #020617 100%); ${POLICE} }
    .telephone { transform: scale(1.25); transform-origin: center; padding: 12px; border-radius: 46px; background: #0b0b0f; box-shadow: 0 30px 80px rgba(0,0,0,.6), inset 0 0 0 2px #334155; }
    iframe { display:block; width: 375px; height: 700px; border: 0; border-radius: 34px; background: #fff; }
  </style></head><body>
    <div class="telephone"><iframe id="telephone" src="/connexion" allow="geolocation; camera"></iframe></div>
  </body></html>`,
};

// ----------------------------------------------------------------------------- Surcouche (sous-titres, surlignage)

// Injecté dans chaque document : style de surlignage partout, bandeau de sous-titre dans la page principale.
function surcouche() {
  const CSS = `
    #demo-st { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); z-index: 2147483647; width: min(1180px, 88vw);
      background: rgba(15, 23, 42, .93); color: #fff; border-radius: 18px; padding: 16px 26px 18px; pointer-events: none;
      border-left: 6px solid #10b981; box-shadow: 0 18px 50px rgba(2, 6, 23, .45);
      font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif; animation: demo-entree .45s ease-out both; }
    #demo-st.cote { left: 56px; top: 50%; bottom: auto; transform: translateY(-50%); width: 520px; padding: 26px 30px; }
    #demo-st .etape { font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6ee7b7; }
    #demo-st .titre { font-size: 25px; font-weight: 700; margin-top: 4px; }
    #demo-st .texte { font-size: 18px; line-height: 1.45; color: #e2e8f0; margin-top: 6px; }
    #demo-st.cote .titre { font-size: 30px; } #demo-st.cote .texte { font-size: 20px; }
    @keyframes demo-entree { from { opacity: 0; } to { opacity: 1; } }
    .demo-surligne { outline: 4px solid #f59e0b !important; outline-offset: 4px !important;
      box-shadow: 0 0 0 12px rgba(245, 158, 11, .22) !important; border-radius: 10px; transition: outline-color .2s; }`;

  // Zoom ×4/3 : toute la page pour l'application, seulement le bandeau pour les écrans /__demo/
  // (qui gèrent leur propre agrandissement). Pas de zoom dans l'iframe du téléphone.
  const ZOOM = window.top !== window ? ''
    : location.pathname.startsWith('/__demo/') ? '#demo-st { zoom: 1.3333; }' : 'html { zoom: 1.3333; }';

  const installerStyle = () => {
    if (document.getElementById('demo-style') || !document.head) return;
    const style = document.createElement('style');
    style.id = 'demo-style';
    style.textContent = CSS + ZOOM;
    document.head.appendChild(style);
  };

  const rendre = () => {
    installerStyle();
    if (window.top !== window || !document.body) return;
    let etat: EtatSousTitre = null;
    try { etat = JSON.parse(sessionStorage.getItem('demo-st') ?? 'null') as EtatSousTitre; } catch { /* vide */ }
    let el = document.getElementById('demo-st');
    if (!etat) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-st';
      document.body.appendChild(el);
    }
    if (el.dataset.cle === etat.cle) return;
    el.dataset.cle = etat.cle;
    el.className = etat.cote ? 'cote' : '';
    el.replaceChildren();
    for (const [classe, texte] of [['etape', etat.etape], ['titre', etat.titre], ['texte', etat.texte]]) {
      const ligne = document.createElement('div');
      ligne.className = classe;
      ligne.textContent = texte;
      el.appendChild(ligne);
    }
  };

  (window as unknown as FenetreDemo).__demoSousTitre = (e) => {
    sessionStorage.setItem('demo-st', JSON.stringify(e));
    rendre();
  };
  document.addEventListener('DOMContentLoaded', rendre);
  setInterval(rendre, 250);
}

// ----------------------------------------------------------------------------- Enregistrement

let page: Page;
const chapitres: { titre: string; debut: number }[] = [];
let origine = 0;   // instant (ms) de l'écran titre : début de la vidéo finale

const pause = (ms: number) => page.waitForTimeout(ms);

async function sousTitre(etape: string, titre: string, texte: string, cote = false) {
  await page.evaluate((e) => (window as unknown as FenetreDemo).__demoSousTitre?.(e),
    { cle: `${etape}|${titre}`, etape, titre, texte, cote });
}
const sansSousTitre = () => page.evaluate(() => (window as unknown as FenetreDemo).__demoSousTitre?.(null));

async function surligner(cible: Locator, ms = 1800) {
  await cible.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await pause(500);
  await cible.evaluate((el) => el.classList.add('demo-surligne'));
  await pause(ms);
  await cible.evaluate((el) => el.classList.remove('demo-surligne')).catch(() => {});
}

async function clic(cible: Locator, ms = 800) {
  await cible.waitFor({ state: 'visible', timeout: 20_000 });
  await surligner(cible, ms);
  await cible.click();
}

async function taper(cible: Locator, texte: string, delai = 32) {
  await clic(cible, 400);
  await cible.pressSequentially(texte, { delay: delai });
}

async function defiler(cible: Locator) {
  await cible.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await pause(900);
}

async function scene(index: number, action: () => Promise<void>) {
  const { titre, duree } = SCENES[index];
  const debut = Date.now();
  chapitres.push({ titre: `${index + 1}. ${titre}`, debut: debut - origine });
  console.log(`▶ Scène ${index + 1} : ${titre}`);
  await action();
  const reste = duree * 1000 - (Date.now() - debut);
  if (reste > 0) await pause(reste);
  else console.log(`  (scène ${index + 1} plus longue que prévu de ${Math.round(-reste / 1000)} s)`);
}

const visible = (l: Locator) => l.filter({ visible: true }).first();

async function seConnecter(email: string) {
  await page.goto(`${BASE}/connexion`);
  await taper(page.locator('#email'), email, 20);
  await taper(page.locator('#mot_de_passe'), MOT_DE_PASSE, 15);
  await clic(page.locator('button[type="submit"]'), 500);
  await page.waitForURL((u) => !u.pathname.startsWith('/connexion'), { timeout: 20_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function seDeconnecter() {
  if (!page.url().startsWith(BASE) || page.url().includes('/__demo/')) await page.goto(`${BASE}/`);
  await clic(visible(page.getByRole('button', { name: 'Se déconnecter' })), 500);
  await page.waitForURL((u) => u.pathname === '/' || u.pathname.startsWith('/connexion'), { timeout: 20_000 }).catch(() => {});
  await pause(600);
}

async function connexionMobile(telephone: FrameLocator, email: string) {
  await telephone.locator('#email').waitFor({ timeout: 20_000 });
  await taper(telephone.locator('#email'), email, 20);
  await taper(telephone.locator('#mot_de_passe'), MOT_DE_PASSE, 15);
  await clic(telephone.locator('button[type="submit"]'), 500);
}

// Aperçu de l'export CSV, affiché par-dessus la page.
function apercuCsv(csv: string) {
  const lignes = csv.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(0, 7).map((l) =>
    [...l.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replaceAll('""', '"')));
  const colonnes = ['Titre', 'Catégorie', 'Zone', 'Statut', 'Priorité', 'Score'];
  const index = colonnes.map((c) => lignes[0].indexOf(c));
  return { colonnes, lignes: lignes.slice(1).map((l) => index.map((i) => l[i] ?? '')) };
}

async function enregistrer(photos: { avant: string; apres: string }) {
  const navigateur = await chromium.launch({ slowMo: 60 });
  const contexte = await navigateur.newContext({
    // 1920×1080 natif ; l'application est agrandie d'un tiers (zoom CSS) pour rester lisible.
    viewport: { width: 1920, height: 1080 },
    locale: 'fr-FR',
    timezoneId: 'Africa/Dakar',
    geolocation: POSITION,
    permissions: ['geolocation'],
    recordVideo: { dir: BRUT, size: { width: 1920, height: 1080 } },
  });
  await contexte.route(`${BASE}/__demo/**`, (route) => {
    const nom = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGES[nom] ?? 'introuvable' });
  });
  await contexte.addInitScript(surcouche);
  page = await contexte.newPage();
  const debutEnregistrement = Date.now();   // la vidéo démarre avec la page
  page.setDefaultTimeout(20_000);

  // On charge l'app une fois avant de démarrer le chrono : le début (page blanche) est coupé au montage.
  await page.goto(`${BASE}/connexion`);
  await page.goto(`${BASE}/__demo/titre`);
  await sansSousTitre();
  origine = Date.now();
  const decalage = (origine - debutEnregistrement) / 1000;

  let idSignalement = '';

  // 1. Écran titre
  await scene(0, async () => { await pause(500); });

  // 2. Citoyen : signalement, IA, doublon
  await scene(1, async () => {
    await seConnecter(COMPTES.citoyen);
    await sousTitre('2 · Citoyen', 'Signaler un problème en une minute',
      'Mariama, habitante de HLM, signale un caniveau bouché devant l\'école de son quartier.');
    await clic(visible(page.getByRole('link', { name: 'Signaler', exact: true })));
    await page.waitForURL('**/signalements/nouveau');
    await taper(page.locator('#titre'), TITRE);
    await taper(page.locator('#description'), DESCRIPTION, 14);
    await sousTitre('2 · Citoyen · ✨ IA', 'La catégorie est suggérée par l\'IA',
      'Pendant la saisie, l\'IA propose une catégorie avec sa confiance et une justification. Le citoyen garde le choix final.');
    const suggestion = page.locator('div', { has: page.getByText('Catégorie suggérée') }).last();
    await suggestion.waitFor({ timeout: 15_000 });
    await surligner(suggestion, 3000);
    const choisir = page.getByRole('button', { name: 'Choisir cette catégorie' });
    if (await choisir.isVisible()) await clic(choisir);
    else await clic(page.locator('label', { hasText: 'Assainissement' }).first());
    await sousTitre('2 · Citoyen', 'Photo et position',
      'La photo est compressée dans le navigateur ; la position vient du GPS du téléphone ou d\'un clic sur la carte.');
    await page.locator('input[type="file"]').first().setInputFiles(photos.avant);
    await page.getByText(/Photo prête/).waitFor();
    await surligner(page.getByAltText('Aperçu de la photo'), 1200);
    await clic(page.getByRole('button', { name: 'Ma position' }));
    await page.getByText(/Point placé/).waitFor();
    await surligner(page.locator('.leaflet-container').first(), 1500);
    await taper(page.locator('#adresse'), 'Devant l\'école, rue du marché HLM', 25);
    await clic(page.getByRole('button', { name: 'Envoyer le signalement' }));
    await page.getByRole('heading', { name: 'Ce problème a peut-être déjà été signalé' }).waitFor();
    await sousTitre('2 · Citoyen · ✨ IA', 'Ce problème a peut-être déjà été signalé',
      'Un signalement proche existe (même catégorie, moins de 50 m, moins de 72 h). Mariama peut le soutenir avec « Moi aussi »… ou envoyer le sien si c\'est un autre problème.');
    await surligner(page.locator('section', { hasText: 'Ce problème a peut-être déjà été signalé' }), 2500);
    await surligner(page.getByRole('button', { name: 'Moi aussi' }).first(), 2200);
    await clic(page.getByRole('button', { name: /Non, c.est différent/ }));
    await page.waitForURL(/\/signalements\/[0-9a-f-]{36}/, { timeout: 30_000 });
    idSignalement = page.url().match(/[0-9a-f-]{36}/)![0];
    await sousTitre('2 · Citoyen', 'Signalement envoyé',
      'Mariama suit chaque étape du traitement. Elle sera notifiée à chaque changement.');
    await pause(2500);
    await clic(visible(page.getByRole('link', { name: 'Mes signalements' })));
    await page.waitForURL('**/signalements');
    await pause(1500);
  });

  // 3. Carte
  await scene(2, async () => {
    await clic(visible(page.getByRole('link', { name: 'Carte', exact: true })));
    await page.locator('.leaflet-container').first().waitFor();
    await sousTitre('3 · Carte', 'Tous les signalements de Dakar sur une carte',
      'Couleur et icône par catégorie. Sur la carte publique, les positions sont arrondies à environ 100 m pour protéger les habitants.');
    await pause(2500);
    const carte = page.locator('.leaflet-container').first();
    const boite = await carte.boundingBox();
    if (boite) {
      await page.mouse.move(boite.x + boite.width * 0.55, boite.y + boite.height * 0.45);
      await page.mouse.wheel(0, -300);
      await pause(2000);
      await page.mouse.wheel(0, 300);
    }
  });

  // 4. Responsable : tableau de bord, priorité, validation, affectation
  await scene(3, async () => {
    await sousTitre('4 · Responsable', 'Le tableau de bord de la mairie',
      'Awa, responsable, voit en temps réel les signalements en attente, les interventions en cours et les délais.');
    await seDeconnecter();
    await seConnecter(COMPTES.responsable);
    await page.waitForURL('**/tableau-de-bord**');
    await pause(1500);
    await surligner(page.getByText('Signalements', { exact: true }).first().locator('..'), 1500);
    await defiler(page.getByText('✨ Assistance IA'));
    await sousTitre('4 · Responsable · ✨ IA', 'L\'IA est mesurée, pas une boîte noire',
      'Taux de suggestions retenues, doublons détectés, problèmes récurrents par quartier : chaque apport de l\'IA est vérifiable.');
    await pause(3500);
    await sousTitre('4 · Responsable', 'Filtrer et trier par priorité',
      'Filtres par catégorie, zone, statut et priorité ; tri par priorité pour traiter l\'urgent d\'abord.');
    const categorie = page.locator('select[name="categorie"]');
    await surligner(categorie, 600);
    await categorie.selectOption('assainissement');
    const tri = page.locator('select[name="tri"]');
    await surligner(tri, 600);
    await tri.selectOption('priorite');
    await clic(page.getByRole('button', { name: 'Filtrer' }));
    await page.waitForURL(/categorie=assainissement/);
    await clic(visible(page.getByRole('link', { name: TITRE })));
    await page.waitForURL(`**/signalements/${idSignalement}`);
    await sousTitre('4 · Responsable · ✨ IA', 'Pourquoi cette priorité ?',
      'Le score est expliqué critère par critère : gravité, zone inondable, problème récurrent à moins de 100 m, ancienneté, soutiens.');
    await surligner(page.locator('details').filter({ hasText: 'Pourquoi cette priorité' }).first(), 4500);
    await clic(page.getByRole('button', { name: 'Commencer la vérification' }));
    await clic(page.getByRole('button', { name: 'Valider', exact: true }));
    await sousTitre('4 · Responsable', 'L\'humain valide, avec un motif tracé',
      'La priorité suggérée est confirmée ou modifiée par le responsable ; son motif est conservé dans l\'historique.');
    await clic(page.getByRole('button', { name: /Valider ou modifier la priorité/ }));
    await taper(page.locator('form', { hasText: 'Priorité retenue' }).locator('textarea'),
      'Vérifié : école juste à côté, risque sanitaire pour les enfants.', 22);
    await clic(page.getByRole('button', { name: 'Enregistrer' }));
    await page.getByText(/Priorité « .* » validée/).waitFor();
    await sousTitre('4 · Responsable', 'Affectation à un agent',
      'L\'agent le moins chargé est visible d\'un coup d\'œil ; il est notifié immédiatement.');
    await clic(page.getByRole('button', { name: 'Affecter à un agent' }));
    await clic(page.locator('label', { hasText: 'Moussa Diop' }));
    await clic(page.getByRole('button', { name: 'Confirmer', exact: true }));
    await page.getByText(/Intervention affectée/).waitFor();
    await pause(1500);
  });

  // 5. Agent sur mobile
  await scene(4, async () => {
    await sousTitre('5 · Agent sur le terrain', 'Place à l\'agent, sur son téléphone',
      'Moussa Diop, agent municipal, se connecte depuis le terrain.');
    await seDeconnecter();
    await page.goto(`${BASE}/__demo/mobile`);
    await sousTitre('5 · Agent sur le terrain', 'Moussa reçoit l\'intervention sur son téléphone',
      'Ses interventions sont triées par priorité, avec l\'itinéraire en un geste.', true);
    const telephone = page.frameLocator('#telephone');
    await connexionMobile(telephone, COMPTES.agent);
    await telephone.getByText('Mes interventions').first().waitFor();
    await pause(1500);
    const carte = telephone.locator('li', { hasText: TITRE });
    await surligner(carte, 1500);
    await clic(carte.getByRole('link', { name: 'Démarrer' }));
    await clic(telephone.getByRole('button', { name: 'Démarrer l\'intervention' }));
    await telephone.getByRole('button', { name: 'Marquer résolu' }).waitFor();
    await sousTitre('5 · Agent sur le terrain', 'Une preuve de résolution vérifiable',
      'Photo « après » obligatoire, horodatée et géolocalisée, avec la description des travaux. La base refuse « résolu » sans preuve.', true);
    await clic(telephone.getByRole('button', { name: 'Marquer résolu' }));
    await telephone.locator('input[type="file"]').setInputFiles(photos.apres);
    await telephone.getByText(/Position enregistrée/).waitFor({ timeout: 20_000 });
    await surligner(telephone.getByAltText('Photo après intervention'), 1200);
    await taper(telephone.getByPlaceholder(/Ex\. : curage/),'Curage du caniveau sur 20 m, évacuation des déchets, écoulement rétabli.', 18);
    await clic(telephone.getByRole('button', { name: 'Confirmer la résolution' }));
    await telephone.getByText(/Intervention marquée comme résolue/).waitFor({ timeout: 30_000 });
    await pause(1500);
  });

  // 6. Citoyen : notification et confirmation
  await scene(5, async () => {
    await sousTitre('6 · Citoyen', 'Mariama est informée',
      'Notification : l\'intervention est terminée. Elle voit la photo « après » et confirme que le problème est réglé.');
    await seDeconnecter();
    await seConnecter(COMPTES.citoyen);
    await clic(visible(page.getByRole('link', { name: /^Notifications/ })));
    await clic(page.getByRole('link', { name: /intervention est terminée/ }).first());
    await page.waitForURL(`**/signalements/${idSignalement}`);
    await surligner(page.locator('figure', { hasText: 'Après intervention' }).first(), 1500);
    await clic(page.getByRole('button', { name: 'Problème bien résolu' }));
    await page.getByText(/Vous avez confirmé/).waitFor();
    await pause(1200);
  });

  // 7. Responsable : avant/après, clôture, historique
  await scene(6, async () => {
    await sousTitre('7 · Responsable', 'Contrôler la preuve avant de clôturer',
      'Photos avant / après côte à côte, distance entre la photo et le signalement, confirmation du citoyen.');
    await seDeconnecter();
    await seConnecter(COMPTES.responsable);
    await page.goto(`${BASE}/signalements/${idSignalement}`);
    await surligner(page.locator('figure').first().locator('..'), 2500);
    await surligner(page.getByText(/Prise à \d+ m du signalement/).first(), 2000);
    await surligner(page.getByText(/Preuve cohérente/).first(), 2000);
    await clic(page.getByRole('button', { name: 'Clôturer', exact: true }));
    await page.getByText(/Statut passé à/).waitFor();
    await sousTitre('7 · Responsable', 'Un historique complet et traçable',
      'Chaque changement de statut, affectation, validation et commentaire est daté et attribué.');
    await defiler(page.getByRole('heading', { name: 'Suivi' }));
    await pause(1500);
    await page.mouse.wheel(0, 350);
  });

  // 8. Tableau de bord et export
  await scene(7, async () => {
    await page.goto(`${BASE}/tableau-de-bord`);
    await sousTitre('8 · Tableau de bord', 'Les indicateurs se mettent à jour',
      'Résolus, délai médian, répartition par catégorie et par quartier ; export CSV pour le suivi de l\'activité.');
    await pause(2500);
    const [telechargement] = await Promise.all([
      page.waitForEvent('download'),
      clic(page.getByRole('link', { name: 'Exporter en CSV' })),
    ]);
    const fichier = path.join(BRUT, telechargement.suggestedFilename());
    await telechargement.saveAs(fichier);
    const apercu = apercuCsv(readFileSync(fichier, 'utf8'));
    await page.evaluate(({ colonnes, lignes, nom }) => {
      const fond = document.createElement('div');
      fond.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.55);z-index:2147483646;display:flex;align-items:center;justify-content:center;';
      const boite = document.createElement('div');
      boite.style.cssText = 'background:#fff;border-radius:16px;padding:22px 26px;max-width:1150px;box-shadow:0 30px 80px rgba(0,0,0,.4);font:15px ui-sans-serif,system-ui;margin-bottom:120px;';
      const titre = document.createElement('p');
      titre.style.cssText = 'margin:0 0 12px;font-weight:700;font-size:18px;color:#0f172a;';
      titre.textContent = `📄 ${nom} (ouvrable dans Excel)`;
      const table = document.createElement('table');
      table.style.cssText = 'border-collapse:collapse;width:100%;';
      [colonnes, ...lignes].forEach((ligne, n) => {
        const tr = document.createElement('tr');
        ligne.forEach((v) => {
          const td = document.createElement(n ? 'td' : 'th');
          td.textContent = v;
          td.style.cssText = `border:1px solid #e2e8f0;padding:6px 10px;text-align:left;${n ? '' : 'background:#f1f5f9;'}`;
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      boite.append(titre, table);
      fond.appendChild(boite);
      document.body.appendChild(fond);
    }, { ...apercu, nom: telechargement.suggestedFilename() });
    await pause(6000);
  });

  // 9. IA responsable et sécurité
  await scene(8, async () => {
    await sansSousTitre();
    await page.goto(`${BASE}/__demo/ia`);
  });

  // 10. Fin
  await scene(9, async () => {
    await page.goto(`${BASE}/__demo/fin`);
  });

  const video = page.video();
  await contexte.close();
  await navigateur.close();
  return { webm: await video!.path(), decalage };
}

// ----------------------------------------------------------------------------- Principal

async function principal() {
  if (!MOT_DE_PASSE) throw new Error('SEED_DEMO_PASSWORD manquant dans .env.local');
  if (!ffmpeg) throw new Error('ffmpeg introuvable (paquet ffmpeg-static)');
  rmSync(BRUT, { recursive: true, force: true });
  mkdirSync(BRUT, { recursive: true });

  reinitialiserDonnees();
  const serveur = await demarrerServeur();
  try {
    // Photos de démonstration
    const outil = await chromium.launch();
    const p = await outil.newPage({ viewport: { width: 1600, height: 1200 } });
    const photos = { avant: path.join(BRUT, 'avant.jpg'), apres: path.join(BRUT, 'apres.jpg') };
    for (const [cle, apres] of [['avant', false], ['apres', true]] as const) {
      await p.setContent(scenePhoto(apres));
      await p.screenshot({ path: photos[cle], type: 'jpeg', quality: 82 });
    }
    await outil.close();

    const { webm, decalage } = await enregistrer(photos);
    const duree = SCENES.reduce((t, s) => t + s.duree, 0) + 30;

    console.log('▶ Conversion en MP4 (H.264)…');
    const mp4 = path.join(DOSSIER, 'civisense-demo.mp4');
    execFileSync(ffmpeg, [
      '-y', '-ss', decalage.toFixed(2), '-i', webm, '-t', String(duree),
      '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-r', '30',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', '-an', mp4,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });

    const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;
    writeFileSync(path.join(DOSSIER, 'chapitres.txt'), chapitres.map((c) => `${mmss(c.debut)}  ${c.titre}`).join('\n') + '\n');
    console.log(`✔ Vidéo : ${mp4}`);
    console.log(readFileSync(path.join(DOSSIER, 'chapitres.txt'), 'utf8'));
  } finally {
    serveur?.kill();
  }
}

principal().catch((e: unknown) => {
  console.error('✖', e instanceof Error ? e.message : e);
  process.exit(1);
});
