# Sourcing Shenzhen — PWA de capture terrain

App de saisie rapide de produits sur les marchés de Shenzhen (Huaqiangbei, Futian,
marchés de gros). Fonctionne **100 % hors ligne**, s'installe sur l'écran d'accueil
Android et iOS, aucune dépendance, aucun build step.

## Déploiement

**GitHub Pages** (en place) : Settings → Pages → source `main` / racine.
Site servi sur <https://zeqoae.github.io/Analystic/>. Le fichier `.nojekyll` évite
que Pages ne fasse passer les fichiers par Jekyll. Chaque push sur `main` redéploie.

**Netlify Drop** (secours, sans compte GitHub) : glisser le dossier contenant les
5 fichiers sur <https://app.netlify.com/drop>. Sans connexion, l'URL est temporaire.

Puis, sur le téléphone :
- **Android / Chrome** : menu ⋮ → « Installer l'application » (WebAPK : icône dans
  le tiroir, pas de barre d'URL, stockage persistant accordé).
- **iOS / Safari** : Partager → « Sur l'écran d'accueil ». Premier lancement avec du
  réseau pour que le service worker remplisse son cache, ensuite le mode avion passe.

HTTPS est obligatoire : sans lui, ni service worker, ni géolocalisation, ni installation.
L'app fonctionne indifféremment à la racine d'un domaine ou dans un sous-dossier.

| Fichier | Rôle |
|---|---|
| `index.html` | toute l'app (HTML + CSS + JS vanilla) |
| `sw.js` | service worker cache-first + réception du Share Target |
| `manifest.json` | installation, `display: standalone`, `share_target` |
| `icon-192.png` / `icon-512.png` | icônes opaques (sans elles, pas de WebAPK) |

## Premier lancement

1. Onglet **Réglages** → vérifier taux de change, fret €/CBM, fret €/kg, TVA,
   commission, marge cible. Rien n'est codé en dur.
   Le taux se saisit en **RMB pour 1 €** (ex. 7,78), c'est-à-dire l'inverse de ce
   qu'affichent Google et les convertisseurs (« 1 renminbi = 0,128 euro »). Le champ
   montre les deux sens et refuse silencieusement de laisser passer une valeur
   inférieure à 1 sans confirmation.
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
- Le prix se saisit en RMB ; la conversion en euros s'affiche juste sous le champ,
  au taux des réglages. Idem sur chaque palier de prix.
- Chaque abréviation (PU €, €/CBM, coût rendu, vente mini, MOQ, CBM, diviseur
  volumétrique…) s'explique d'un tap sur sa pastille ⓘ.
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
disponibles. Sur iPhone, les exports passent par la feuille de partage iOS
(« Enregistrer dans Fichiers », Mail, AirDrop) : un téléchargement classique
échoue souvent en mode écran d'accueil. Si le partage est annulé, l'export n'est
pas comptabilisé et le rappel reste affiché.

## Périmètre

v0 et une partie de v1 sont livrés : capture, photos, calculs, liste/tris/filtres,
doublons, export JSON/CSV/ZIP, import fusionné, offline complet, installable,
Share Target Android, notes vocales, jeu de test.
Hors périmètre (v2) : backend et sync multi-appareils, OCR des cartes de visite,
comparateur multi-fournisseurs, suivi des échantillons.
