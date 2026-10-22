# BABI A.C Player Rating

Calculatrice d’évaluation des joueurs du club **BABI A.C** (EA SPORTS FC Clubs), sous forme d’application web installable (PWA).
Score sur 100 = **EA SPORTS FC (30)** + **performances observées (50)** + **respect des consignes (20)**, puis 1, 2 ou 3 étoiles pour le poste évalué.

- HTML, CSS et JavaScript natifs : aucune compilation, aucune dépendance, aucune ressource externe.
- **Confidentialité** : pas de serveur, pas de compte, pas de statistiques de visite, pas de cookie ni de stockage navigateur. Tout reste en mémoire vive : actualiser ou fermer la page efface la saisie et rétablit les paramètres initiaux. La page interdit elle-même tout envoi réseau (`connect-src 'none'`).
- Fonctionne hors ligne après la première ouverture (seuls les fichiers de l’application sont mis en cache).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page unique (onglets Évaluation / Paramètres) |
| `css/styles.css` | Thème sombre, mise en page mobile d’abord, fiche imprimable A4 |
| `js/scoring.js` | Moteur de calcul pur (normalisation, blocs, étoiles, validation, import/export) |
| `js/content.js` | Conseils d’observation par poste, échelle de notation |
| `js/app.js` | Interface |
| `sw.js` | Mode hors ligne (cache des fichiers de l’application uniquement) |
| `manifest.webmanifest` | Nom court « BABI Rating », thème sombre, icônes |
| `icons/` | Emblème provisoire (`emblem.svg`) et icônes PNG 180/192/512 (+ maskable) |
| `.nojekyll` | Publication telle quelle sur GitHub Pages |
| `tests/` | Tests automatisés et petit serveur local |

## Publier sur GitHub Pages (5 minutes)

1. Sur GitHub, créez un dépôt (ex. `babi-ac-player-rating`), public ou privé selon votre offre.
2. **Add file → Upload files** : glissez **le contenu** de ce dossier (pas le dossier lui-même), puis **Commit changes**.
3. **Settings → Pages** → *Source* : **Deploy from a branch** → branche **main**, dossier **/ (root)** → **Save**.
4. Après une à deux minutes, l’application est en ligne à `https://<votre-compte>.github.io/babi-ac-player-rating/`.

Tous les chemins sont relatifs : l’application fonctionne dans ce sous-chemin comme à la racine d’un domaine.

**Mise à jour** : remplacez les fichiers modifiés, puis augmentez `CACHE_VERSION` dans `sw.js` (ex. `babi-rating-v1.0.1`). Les appareils déjà installés afficheront « Nouvelle version disponible ».

## Ajouter à l’écran d’accueil de l’iPhone

1. Ouvrez l’adresse dans **Safari**.
2. Touchez **Partager** (carré avec flèche) → **Sur l’écran d’accueil** → **Ajouter**.
3. L’icône « BABI Rating » lance l’application en plein écran, avec le thème sombre, y compris hors connexion après une première ouverture.

Sur Android (Chrome) : menu ⋮ → **Installer l’application**.

## Utilisation

1. **Joueur et poste** : pseudo PSN/Xbox, poste (GK, DC, DD, DG, MDC, MC, MOC, AD, AG, BU), date et nombre de sessions facultatifs.
2. **Bloc A** : reportez les six statistiques du jeu (virgule ou point acceptés). Un champ vide n’est pas un zéro : il est signalé « manquant ». Le bouton **N/D** marque une donnée non disponible. Le champ *Buts + passes D.* propose un remplissage automatique à partir des deux champs précédents.
3. **Blocs B et C** : chaque critère a deux colonnes **Observateur A** et **Observateur B** (0 à 5, demi-points). La moyenne et les points sont calculés automatiquement ; un écart ≥ 2 points entre observateurs est signalé.
4. Le **résultat** se met à jour à chaque saisie (barre de score en bas de l’écran sur téléphone).
5. Changer de poste conserve toutes les saisies et recalcule avec les coefficients et conseils du nouveau poste.
6. **Nouvelle évaluation** : efface la saisie après confirmation (le poste et les paramètres sont conservés).

## Exports (toujours locaux et volontaires)

- **Exporter la fiche (PDF)** : ouvre l’impression du navigateur avec une fiche A4 propre (nom, poste, score, étoiles, mention, statut, trois sous-scores, détail par critère, données manquantes). Choisissez « Enregistrer au format PDF ».
- **Capturer / imprimer le résultat** : affiche la fiche en plein écran, idéale pour une capture d’écran sur téléphone. *Sur iPhone, si l’impression ne s’ouvre pas depuis l’icône de l’écran d’accueil, utilisez ce mode capture ou ouvrez le site dans Safari.*
- **Exporter le résultat (JSON)** : fichier contenant le joueur, les notes, le résultat et les paramètres utilisés. Il contient des informations personnelles : conservez-le de façon responsable.
- **Paramètres → Exporter les paramètres** : fichier JSON contenant uniquement seuils, coefficients, poids et règles (aucune évaluation). Refusé tant que des paramètres sont invalides.
- **Paramètres → Importer les paramètres** : sélectionnez un fichier exporté. Validation stricte avant application (structure exacte, clés inconnues refusées, valeurs numériques, totaux 100 % / 50 / 20, ordre des étoiles). Le contenu n’est jamais exécuté.

Les paramètres n’étant jamais enregistrés dans le navigateur, **exportez-les après chaque calibrage** et réimportez-les en début de session.

## Règles de calcul

**Bloc A (30 pts)** — chaque statistique est normalisée sur 100 avec un seuil de référence propre au poste :
- statistiques favorables : `min(100, valeur ÷ seuil × 100)` → valeur = seuil donne **100** ;
- ballons perdus : `max(0, min(100, (seuil − valeur) ÷ seuil × 100))` → valeur = seuil donne **0**, valeur 0 donne 100 (jamais plus).

Variantes au choix dans Paramètres : *racine carrée* pour les statistiques favorables, *zone d’excellence* pour les ballons perdus (100 tant que la valeur reste sous un pourcentage du seuil, puis décroissance linéaire jusqu’à 0 au seuil).
`Score FC = Σ(note normalisée × coefficient) × 30 / 100`. Une donnée manquante ou « N/D » rapporte 0 sans redistribution de son poids ; une donnée dont le coefficient est 0 % n’est pas exigée.

**Blocs B (50 pts) et C (20 pts)** — `points = (note A + note B) / 2 / 5 × poids du critère`. Une note manquante ne rapporte rien (sa moitié du critère) et l’évaluation est signalée incomplète ; elle n’est jamais remplacée par la note de l’autre observateur.

**Étoiles** — 1 étoile sous 50, 2 étoiles de 50 à 74,99, 3 étoiles à partir de 75 (seuils modifiables, 3 ★ ≥ 2 ★ obligatoire). Mentions : *Niveau en développement*, *Joueur compétent*, *Joueur confirmé*. Le score s’affiche avec une décimale **tronquée** (49,99 → 49,9) pour rester cohérent avec les étoiles.

**Statut** — si le nombre de sessions est saisi et inférieur au minimum (3 par défaut), la mention est suivie de « provisoire ». Sans nombre de sessions, l’application affiche le niveau calculé sur cette évaluation et précise, pour 3 étoiles, que la confirmation n’est pas vérifiée. Aucun historique n’est conservé ni inventé.

**Paramètres invalides** (total ≠ 100 % / 50 / 20, étoiles inversées, seuil nul…) : le score reste borné (30/50/20/100), mais il est signalé « Paramètres invalides » partout, y compris sur la fiche.

## Seuils par défaut à calibrer par le staff

Valeurs de départ raisonnables mais **non issues des données du roster** : à ajuster dans Paramètres → *Coefficients et seuils de référence*, puis à exporter.

| Poste | Archétype (%) | Buts / m | Passes D. / m | B + PD / m | Interceptions / m | Ballons perdus / m (→ 0) |
|---|---|---|---|---|---|---|
| GK | 100 | 0,05 | 0,1 | 0,15 | 1,5 | 6 |
| DC | 100 | 0,2 | 0,15 | 0,3 | 5 | 8 |
| DD / DG | 100 | 0,25 | 0,4 | 0,6 | 3,5 | 12 |
| MDC | 100 | 0,25 | 0,3 | 0,5 | 5 | 12 |
| MC | 100 | 0,4 | 0,5 | 0,8 | 3 | 14 |
| MOC | 100 | 0,6 | 0,8 | 1,3 | 1,5 | 18 |
| AD / AG | 100 | 0,8 | 0,6 | 1,3 | 1,2 | 18 |
| BU | 100 | 1 | 0,5 | 1,4 | 0,8 | 18 |

Également à valider : seuils d’étoiles (50 / 75), minimum de 3 sessions, zone d’excellence des ballons perdus (25 %, si cette règle est choisie). Les coefficients et poids sont ceux du cahier des charges.

## Tester en local

```bash
npm test
```

```bash
npm start
```

`npm start` sert l’application sur `http://localhost:8080/babi-ac-player-rating/`, comme sur GitHub Pages (sous-chemin).

## Personnaliser l’emblème

L’emblème « BABI A.C » est provisoire et typographique. Pour le remplacer par le logo officiel : remplacez `icons/emblem.svg` (même nom) et régénérez `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (logo dans les 80 % centraux) et `apple-touch-icon.png` (180 × 180), puis augmentez `CACHE_VERSION` dans `sw.js`.
