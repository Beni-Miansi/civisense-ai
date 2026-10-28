# CiviSense AI — Script de voix off (vidéo de démonstration)

Vidéo : `videos/civisense-demo.mp4` (4 min 40, scènes calées sur les temps ci-dessous). Les temps réels de chaque scène sont dans
`videos/chapitres.txt` après génération : caler la lecture sur ces repères.

Rythme : environ 130 mots par minute, ton posé. Les passages entre crochets sont des indications, à ne pas lire.

---

## 1. Le problème et la solution — 0:00 → 0:10 (10 s)

Déchets, caniveaux bouchés, éclairage en panne… CiviSense AI relie les habitants, la mairie et les agents,
du signalement d'un problème urbain à sa résolution prouvée.

## 2. Citoyen : signaler un problème — 0:10 → 1:10 (60 s)

Voici Mariama, habitante du quartier HLM à Dakar. Devant l'école de ses enfants, le caniveau est bouché
et l'eau stagne depuis trois jours.
Elle ouvre CiviSense, se connecte et décrit le problème avec ses mots.
[suggestion] Pendant qu'elle écrit, l'intelligence artificielle lui suggère une catégorie, Assainissement,
avec un niveau de confiance et une courte justification. C'est une suggestion : Mariama garde toujours
le choix final.
Elle ajoute une photo, allégée directement dans le téléphone, puis sa position GPS, visible sur la carte.
[doublon] Au moment d'envoyer, CiviSense repère un signalement très proche, de la même catégorie, envoyé
il y a moins de trois jours. Mariama pourrait simplement le soutenir avec « Moi aussi ». Ici, il s'agit
d'un autre problème : elle envoie le sien. Elle pourra suivre chaque étape depuis « Mes signalements ».

## 3. Carte interactive — 1:10 → 1:25 (15 s)

Tous les signalements apparaissent sur la carte de Dakar, avec une couleur et une icône par catégorie.
Pour protéger les habitants, la position publique est arrondie à une centaine de mètres.

## 4. Responsable : prioriser et affecter — 1:25 → 2:25 (60 s)

À la mairie, Awa est responsable. Son tableau de bord montre en temps réel les signalements en attente,
les interventions en cours et les délais de résolution.
[Assistance IA] L'encart Assistance IA rend l'intelligence artificielle mesurable : part des suggestions
retenues, doublons détectés, et quartiers où les problèmes reviennent.
Awa filtre l'assainissement, trie par priorité, et ouvre le signalement de Mariama.
[Pourquoi cette priorité] La priorité n'est pas une boîte noire : chaque critère est expliqué. Gravité
de la catégorie, zone inondable, problème récurrent à moins de cent mètres.
Awa vérifie, valide, puis confirme la priorité avec un motif, conservé dans l'historique.
Enfin, elle affecte l'intervention à Moussa, qui est notifié immédiatement.

## 5. Agent sur mobile : intervenir et prouver — 2:25 → 3:05 (40 s)

Sur le terrain, Moussa retrouve ses interventions sur son téléphone, triées par priorité.
Il démarre l'intervention. Une fois le caniveau curé, il la marque résolue.
La preuve est obligatoire : une photo « après », horodatée et géolocalisée, et la description des travaux.
Sans cette preuve, la base de données refuse tout simplement le passage à « résolu ».

## 6. Citoyen : confirmer la résolution — 3:05 → 3:30 (25 s)

Retour chez Mariama. Elle reçoit une notification : l'intervention est terminée. Elle ouvre son
signalement, voit la photo après travaux, et confirme d'un geste que le problème est bien réglé.

## 7. Responsable : contrôler et clôturer — 3:30 → 4:00 (30 s)

Awa compare les photos avant et après. CiviSense indique que la photo a été prise à quelques mètres
du signalement, et que la citoyenne a confirmé. Awa clôture.
Tout est tracé : chaque statut, chaque affectation, chaque validation, avec sa date et son auteur.

## 8. Tableau de bord et export CSV — 4:00 → 4:18 (18 s)

Les indicateurs se mettent à jour automatiquement. Et pour les rapports, la liste filtrée
s'exporte en un clic, lisible dans Excel.

## 9. IA responsable et sécurité — 4:18 → 4:30 (12 s)

Notre principe : l'IA suggère, l'humain décide. Les accès sont contrôlés par rôle,
et les données des habitants sont protégées.

## 10. Fin — 4:30 → 4:40 (10 s)

CiviSense AI : une ville qui utilise ses données pour mieux agir au service de ses habitants. Merci.

---

## Fusionner la voix off avec la vidéo

Enregistrer la voix dans `videos/voix.m4a` (téléphone, Audacity ou l'Enregistreur vocal de Windows), puis :

```powershell
node_modules\ffmpeg-static\ffmpeg.exe -i videos\civisense-demo.mp4 -i videos\voix.m4a -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest videos\civisense-demo-voix.mp4
```

- `-c:v copy` : la vidéo n'est pas réencodée (rapide, sans perte).
- `-shortest` : la sortie s'arrête au plus court des deux flux ; enlever l'option si la voix doit
  continuer sur l'écran de fin.
- Pour décaler la voix (par exemple de 0,5 s), ajouter `-itsoffset 0.5` juste avant `-i videos\voix.m4a`.
