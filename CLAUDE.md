# CiviSense AI — Contexte projet

Projet porté par Béni (dev full stack) pour Panafricode, format hackathon (prototype en 3 jours).
Claude gère le projet de bout en bout avec Béni : il code, Béni valide, teste et pilote.
Langue de travail : **français** (UI, commentaires, commits).

## Le produit
Plateforme web responsive de signalement et de traitement des problèmes urbains
(déchets, voirie, caniveaux, éclairage). Boucle fermée :
signalement citoyen → priorité explicable → affectation → intervention → preuve photo → clôture → citoyen informé.

Cahier des charges complet : `docs/CiviSense_AI_Cahier_des_charges.pdf`.

Emplacement du projet : `C:\dev\civisense-ai` (hors OneDrive, pour éviter les verrous de fichiers sur node_modules/.next).

## Rôles
- **citoyen** : crée un signalement (catégorie, titre, description, photo facultative, position), suit son statut, confirme la résolution.
- **agent** : voit ses interventions, change le statut, ajoute commentaire + photo « après ».
- **responsable** : voit tout son périmètre, filtre (catégorie, zone, statut, priorité), valide/modifie la priorité, affecte, clôture, exporte.
- **admin** : utilisateurs, rôles, catégories, communes/zones, règles de priorité.

## Règles métier (figées — ne pas rediscuter pendant le hackathon)
- Catégories : Déchets, Voirie, Assainissement, Éclairage, Autre.
- Statuts : nouveau → a_verifier → valide → affecte → en_cours → resolu → cloture ; plus `rejete` et `doublon` (justification obligatoire).
- Seul le **responsable** passe `a_verifier` → `valide` et `resolu` → `cloture`.
- Citoyen authentifié (email). Pas de signalement anonyme dans le MVP.
- Chaque changement de statut, affectation ou commentaire écrit une ligne dans `historique`.

## Priorité explicable (toujours afficher le détail du calcul)
| Critère | Points |
|---|---|
| Gravité catégorie : Assainissement 3, Déchets 2, Voirie 2, Éclairage 1, Autre 1 | 1–3 |
| Zone à risque (inondable, école, marché) | +2 |
| ≥ 3 signalements similaires à moins de 100 m | +2 |
| Non traité depuis plus de 72 h (nouveau → affecté) | +1 |
| ≥ 3 soutiens « Moi aussi » (ajouté à l'étape 7) | +1 |

Score sur 9 : ≥ 6 → Haute · 4–5 → Moyenne · ≤ 3 → Basse. Le responsable peut valider ou modifier, **motif obligatoire** (validation humaine tracée dans l'historique).

## Doublons
Même catégorie, distance < 50 m, écart < 72 h, statut non clos → suggéré comme doublon, **jamais supprimé automatiquement**.
Bouton « Moi aussi » : le citoyen soutient un signalement existant ; le nombre de soutiens entre dans le score.

## IA
- Classification de catégorie depuis le texte : appel LLM **avec repli par mots-clés** (la démo ne doit jamais dépendre du réseau).
- L'IA suggère, l'humain décide. Aucune prédiction présentée comme certaine, pas de reconnaissance faciale.

## Stack
- Next.js 16 (App Router, TypeScript, dossier `src/`, Turbopack) + Tailwind 4 — Next 16 a des changements cassants : consulter `node_modules/next/dist/docs/` (cf. AGENTS.md)
- Node.js 24, npm
- Supabase : PostgreSQL, Auth, Storage (photos), Row Level Security par rôle (`@supabase/supabase-js` + `@supabase/ssr`)
- Leaflet + react-leaflet 5 + OpenStreetMap pour la carte
- Variables d'environnement : voir `.env.local.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`)
- Déploiement Vercel
- Pas de microservices, pas de back séparé.

## Données personnelles
- Position exacte du citoyen jamais publiée : carte publique arrondie à ~100 m.
- Photos : jpg/png/webp, compressées côté navigateur, 5 Mo max.

## Plan
1. Cadrage + init projet (Next.js, Supabase, repo GitHub)
2. Schéma SQL (tables, enums, RLS, triggers d'historique)
3. Données de démo (~30 signalements réalistes sur 3 semaines, quartier réel)
4. Formulaire de signalement + liste + carte
5. Tableau de bord responsable + affectation
6. Vue agent + preuve de résolution
7. Priorité explicable + doublons + classification
8. Déploiement, tests du scénario de bout en bout, vidéo de secours, pitch

## Règles de travail
- Avancer étape par étape ; à la fin de chaque étape, Béni teste et valide avant la suivante.
- Gel des fonctionnalités le J3 à midi : ensuite uniquement des corrections.
- Un seul parcours de démo parfaitement fluide vaut mieux que dix fonctionnalités à moitié faites.

## Avancement
- [x] Étape 1 — Cadrage + init
- [x] Étape 2 — Schéma SQL (`supabase/migrations/20261026120000_schema_initial.sql`)
- [x] Étape 3 — Données de démo Dakar (`npm run seed`, script `scripts/seed.mts`, comptes dans `DEMO.md` non commité)
- [x] Étape 4 — Auth, formulaire de signalement, mes signalements + détail, carte
- [x] Étape 5 — Tableau de bord, actions responsable, affectation, notifications, export CSV (migration `20261027090000_tableau_de_bord.sql`)
- [x] Étape 6 — Vue agent, preuve de résolution géolocalisée, difficulté, confirmation/contestation citoyen (migration `20261028090000_interventions_agent.sql`)
- [ ] Étape 7 — Priorité explicable en SQL, doublons (pg_trgm), « Moi aussi », classification IA + repli mots-clés (migration `20261029090000_priorite_doublons.sql`) + encart « Assistance IA » du tableau de bord (migration `20261030090000_assistance_ia.sql`) — en attente de validation
- [ ] Étape 8 — README + guide de déploiement Vercel, scénario de démo minuté et vidéo de secours (DEMO.md) — en cours · production : https://civisense-ai-three.vercel.app (dépôt github.com/Beni-Miansi/civisense-ai, privé)

## Conventions techniques (établies à l'étape 4)
- `cacheComponents` actif : toute lecture de session/cookies se fait dans un composant async sous `<Suspense>` (jamais au niveau d'un layout ou d'une page).
- `src/proxy.ts` (ex-middleware) rafraîchit la session Supabase et protège `/signalements`, `/interventions`, `/tableau-de-bord`.
- Session et rôle côté serveur : `getUtilisateur()` / `exigerUtilisateur(roles)` dans `src/lib/auth.ts`.
- Écritures simples faites depuis le navigateur (`creerClientNavigateur`), la RLS et les triggers SQL font foi.
- Vocabulaire métier, couleurs et icônes : `src/lib/domaine.ts` ; composants réutilisables : `BadgeStatut`, `IconeCategorie`, `components/carte` (Leaflet chargé sans SSR).
- `error.tsx` reçoit `retry` (et non `reset`) dans cette version de Next.
- `creerClientServeur()` appelle `connection()` : avec le Partial Prefetching, une lecture de cookies seule peut être pré-rendue, or Supabase lit l'heure (expiration du jeton).
- Couleurs de catégorie = palette validée (script dataviz, contrôles CVD) : ne pas les changer sans revalider.
- Filtres du tableau de bord : `src/lib/filtres.ts`, appliqués à la vue `signalements_gestion` (liste, carte, export CSV).
- Notifications : créées uniquement par le trigger `historique_notifier` (jamais depuis l'application).
- Priorité : calculée **uniquement par la base** (`calculer_priorite`, triggers `signalements_priorite*`, `recalculer_priorites()` appelé à l'ouverture du tableau de bord et chaque heure via pg_cron si disponible). Affichage : composant `ExplicationPriorite`. Validation : RPC `valider_priorite` (motif obligatoire).
- Doublons : `doublons_possibles()` (formulaire citoyen, SECURITY DEFINER, sans position exacte), `candidats_doublon()` et colonne `doublon_possible` de `signalements_gestion` (responsable). Distances en haversine (`distance_m`), pas de PostGIS.
- Classification : route `/api/classification` (serveur, utilisateur connecté), SDK `@anthropic-ai/sdk`, délai 3 s, repli `classerParMotsCles` (`src/lib/classification.ts`, aussi utilisé côté navigateur hors ligne). Fournisseur : Claude si `ANTHROPIC_API_KEY`, sinon Groq gratuit si `GROQ_API_KEY` (modèle `GROQ_MODEL`, défaut openai/gpt-oss-120b). Clés serveur uniquement.
