# Batch du soir

Tourne sur le laptop, hors de la PWA. Transforme l'export de la journée en
fichier enrichi réimportable dans l'app.

```bash
node batch/enrichir.mjs preparer  sourcing-20260903-2100.json
# → recherche.md         : un dossier par produit, liens 1688 / Amazon / Cdiscount
# → enrichissement.json  : le squelette à remplir

# … tu remplis enrichissement.json (prix usine, prix concurrents, code SH) …

node batch/enrichir.mjs fusionner sourcing-20260903-2100.json enrichissement.json
# → sourcing-20260903-2100-enrichi.json  → Réglages → Importer dans l'app
```

## Ce qui est automatique

Sans réseau et sans recherche : obligations réglementaires par catégorie et
mots-clés (UN38.3, RED, EN71, contact alimentaire, EPI, cosmétique…), risque
contrefaçon par détection de marques et de formulations de contournement,
pistes de code SH avec droits indicatifs, mots-clés chinois pour 1688, score
sur 100 et statut proposé.

Le score est transparent : chaque composante est écrite dans `_scoreDetail`
(marge face à la concurrence, densité de valeur, écart au prix usine, MOQ,
charge réglementaire, risque PI, délai). Modifie les pondérations dans
`enrichir.mjs`, les règles dans `regles.mjs`.

## Ce qui demande un humain

Les prix réels : 1688/Taobao pour le prix usine, Amazon/Cdiscount/ManoMano/Temu
pour la revente. **Aucun scraping n'est fait ici.** Ces sites bloquent les
robots et renvoient des prix faux ou partiels sans le signaler ; sur une
décision d'achat, un chiffre faux est pire que pas de chiffre. Le script
prépare les recherches, ouvre les bonnes URL et valide ce que tu ramènes.

Pour 1688, une IP chinoise (eSIM sur l'Android) donne des résultats bien plus
rapides et complets. La recherche par image dans l'app 1688 reste le moyen le
plus fiable de retrouver un article vu au stand.

## Garanties de la fusion

- `updatedAt` n'est **jamais** modifié : l'app n'applique les champs terrain
  que si l'horodatage entrant est plus récent, donc une correction faite sur
  le téléphone après l'export ne peut pas être écrasée. Vérifié par test.
- Le risque contrefaçon ne peut que monter : les règles lèvent une alerte,
  elles n'en annulent jamais une posée à la main.
- Un taux de droits hors plage 0–60 % est rejeté avec un avertissement.
- Les codes SH sont des **pistes** à confirmer sur le tarif douanier officiel
  (RITA). Un code erroné fausse les droits et engage ta déclaration.
- La REP emballage/Triman n'est pas listée par produit : c'est une obligation
  d'entreprise, elle figure en tête de `recherche.md`.
