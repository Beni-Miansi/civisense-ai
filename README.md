# CiviSense AI

Plateforme web responsive de signalement et de traitement des problèmes urbains (déchets, voirie,
assainissement, éclairage), prototype réalisé pour **Panafricode** en format hackathon.

Boucle fermée : **signalement citoyen → priorité explicable → affectation → intervention → preuve photo → clôture → citoyen informé.**

## Fonctionnalités

| Rôle | Ce qu'il peut faire |
|---|---|
| Citoyen | Signaler (catégorie suggérée par l'IA, photo, position GPS ou carte), soutenir un signalement existant (« Moi aussi »), suivre le statut, confirmer ou contester la résolution |
| Agent | Voir ses interventions triées par priorité, démarrer, résoudre avec photo « après » géolocalisée, signaler une difficulté |
| Responsable | Tableau de bord (indicateurs, filtres, carte, export CSV), assistance IA, validation de la priorité (motif tracé), affectation, doublons, clôture |
| Admin | Mêmes accès que le responsable (gestion des rôles directement en base pour le prototype) |

Toutes les règles (transitions de statut, droits par rôle, preuve de résolution, historique) sont imposées
**par la base de données** (triggers et Row Level Security), pas seulement par l'interface.

## Intelligence artificielle : elle suggère, l'humain décide

| Rôle (cahier des charges §4) | Mise en œuvre |
|---|---|
| Classification (§4.1) | Route serveur `/api/classification` : LLM (Groq gratuit ou Claude) avec **repli par mots-clés** français et wolof si pas de clé, si erreur ou au-delà de 3 s |
| Doublons (§4.2) | Même catégorie, < 50 m, < 72 h, statut non clos, similarité de texte (pg_trgm). Jamais de suppression automatique |
| Priorité explicable (§4.3) | Moteur de règles SQL ; le détail de chaque critère est affiché (« Pourquoi cette priorité ? ») |
| Récurrences (§4.4) | Zones × catégories avec 3 signalements ou plus sur 30 jours (encart « Assistance IA ») |
| Contrôle humain (§4.5) | Catégorie choisie par le citoyen, priorité validée par le responsable avec motif ; taux d'acceptation mesuré |

Grille de priorité (score sur 9) : gravité de la catégorie 1–3, zone à risque +2, ≥ 3 signalements similaires
à moins de 100 m +2, non traité depuis plus de 72 h +1, ≥ 3 soutiens +1. **≥ 6 Haute · 4–5 Moyenne · ≤ 3 Basse.**

Données personnelles : la carte publique arrondit les positions à ~100 m ; aucune reconnaissance faciale.

## Stack

Next.js 16 (App Router, TypeScript, Turbopack) · Tailwind 4 · Supabase (PostgreSQL, Auth, Storage, RLS) ·
Leaflet + OpenStreetMap · Groq / Claude pour la classification · déploiement Vercel.

## Installation locale

Prérequis : Node.js 24, un projet Supabase.

```bash
npm install
cp .env.local.example .env.local   # puis renseigner les valeurs
```

1. **Base de données** : dans Supabase → *SQL Editor*, exécuter dans l'ordre les fichiers de `supabase/migrations/` :
   1. `20261026120000_schema_initial.sql`
   2. `20261027090000_tableau_de_bord.sql`
   3. `20261028090000_interventions_agent.sql`
   4. `20261029090000_priorite_doublons.sql`
   5. `20261030090000_assistance_ia.sql`
2. **Données de démo** (Dakar, 31 signalements, 7 comptes) : `npm run seed`
   (ou `npm.cmd run seed` sous PowerShell). Rejouable ; `-- --dry-run` vérifie sans écrire.
3. **Lancer** : `npm run dev` puis http://localhost:3000

### Variables d'environnement

| Variable | Où | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | local + Vercel | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | local + Vercel | Clé publique (protégée par la RLS) |
| `GROQ_API_KEY` | local + Vercel | Classification IA gratuite (facultatif : sinon mots-clés) |
| `ANTHROPIC_API_KEY` | facultatif | Classification par Claude, prioritaire si présente |
| `SUPABASE_SECRET_KEY` | **local uniquement** | Script de seed (contourne la RLS : jamais sur Vercel, jamais `NEXT_PUBLIC_`) |
| `SEED_DEMO_PASSWORD` | local uniquement | Mot de passe des comptes de démo |

## Vidéo de démonstration

`npm run demo:video` réinitialise les données de démo, filme le parcours complet avec Playwright
(citoyen → responsable → agent sur mobile → clôture) et produit `videos/civisense-demo.mp4`
(1920×1080, H.264) et `videos/chapitres.txt`. Texte de la voix off : [docs/script-voix-off.md](docs/script-voix-off.md).
Variables facultatives : `DEMO_URL` (filmer la production), `DEMO_LIEN_PUBLIC` (lien de l'écran de fin).

## Déploiement (Vercel)

1. Pousser le dépôt sur GitHub.
2. Sur https://vercel.com → *Add New → Project* → importer le dépôt (framework détecté : Next.js).
3. *Environment Variables* : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GROQ_API_KEY`
   (environnements *Production* et *Preview*), puis **Deploy**.
4. Supabase → *Authentication → URL Configuration* :
   - *Site URL* : `https://<projet>.vercel.app`
   - *Redirect URLs* : `https://<projet>.vercel.app/**` et `http://localhost:3000/**`
5. Ouvrir l'URL sur un téléphone : en HTTPS, le GPS et l'appareil photo fonctionnent.

## Structure

```
src/app/              pages (signalements, carte, interventions, tableau-de-bord, notifications, api/classification)
src/components/       composants réutilisables (badges, carte Leaflet, explication de priorité…)
src/lib/              domaine métier, authentification, filtres, photos, classification par mots-clés
supabase/migrations/  schéma, RLS, triggers, fonctions SQL (priorité, doublons, statistiques)
scripts/seed.mts      données de démonstration
```
