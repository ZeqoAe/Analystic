# Sourcing Shenzhen — PWA de capture terrain

App de saisie rapide de produits sur les marchés de Shenzhen (Huaqiangbei, Futian,
marchés de gros). Fonctionne **100 % hors ligne**, s'installe sur l'écran d'accueil
Android et iOS, aucune dépendance, aucun build step.

## Déploiement (2 minutes)

1. Ouvrir <https://app.netlify.com/drop>
2. Y glisser **le dossier** contenant les 5 fichiers ci-dessous.
3. Ouvrir l'URL HTTPS fournie sur le téléphone.
4. **Android / Chrome** : menu ⋮ → « Installer l'application » (WebAPK : icône dans
   le tiroir, pas de barre d'URL, stockage persistant accordé).
   **iOS / Safari** : Partager → « Sur l'écran d'accueil ».

HTTPS est obligatoire : sans lui, ni service worker, ni géolocalisation, ni installation.

| Fichier | Rôle |
|---|---|
| `index.html` | toute l'app (HTML + CSS + JS vanilla) |
| `sw.js` | service worker cache-first + réception du Share Target |
| `manifest.json` | installation, `display: standalone`, `share_target` |
| `icon-192.png` / `icon-512.png` | icônes opaques (sans elles, pas de WebAPK) |

## Premier lancement

1. Onglet **Réglages** → vérifier taux RMB→EUR, fret €/CBM, fret €/kg, TVA,
   commission, marge cible. Rien n'est codé en dur.
2. Toucher **5 fois** la ligne de version en bas des réglages → bouton caché
   « Injecter 8 produits de test » (dont 2 quasi-doublons et un produit à batterie),
   pour valider tris, alertes et doublons. Le bouton « Effacer toutes les données »
   remet à zéro avant le départ.

## Sur le terrain

- Photo avec l'**appareil natif** (l'original horodaté/géolocalisé reste dans la
  galerie), puis import dans l'app : redimensionnement 1280 px / JPEG 0.7 (~200 Ko).
- Sur Android, on peut aussi **partager** directement depuis la galerie vers
  « Sourcing » : les photos atterrissent dans le formulaire de capture.
- Seule une photo est obligatoire. Le bâtiment et l'étage sont pré-remplis avec les
  derniers saisis.
- Le bandeau du haut recalcule en direct : PU €, €/CBM, coût rendu, prix de vente
  mini. Sous 1 500 €/CBM, la tuile passe en orange : le fret maritime mange la marge.
- Pendant la saisie du nom, un bandeau signale un produit similaire déjà vu, avec son
  stand et son prix.

## Cycle quotidien

Le soir **Réglages → Export JSON** (fichier léger, sans les photos) → enrichissement
sur laptop (prix 1688, concurrence FR, code SH, blocages réglementaires, score) →
le matin **Import** : fusion par `id`, les saisies locales plus récentes ne sont
jamais écrasées et les photos locales sont conservées. Un bandeau rappelle l'export
au-delà de 6 h.

Export CSV (tableur) et ZIP des photos (`{stand}_{id}_{role}.jpg`) également
disponibles.

## Périmètre

v0 et une partie de v1 sont livrés : capture, photos, calculs, liste/tris/filtres,
doublons, export JSON/CSV/ZIP, import fusionné, offline complet, installable,
Share Target Android, notes vocales, jeu de test.
Hors périmètre (v2) : backend et sync multi-appareils, OCR des cartes de visite,
comparateur multi-fournisseurs, suivi des échantillons.
