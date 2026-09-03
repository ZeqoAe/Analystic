#!/usr/bin/env node
/* ===========================================================================
   Batch du soir — section 5 de la spec. Tourne sur le laptop, hors de la PWA.

     node batch/enrichir.mjs preparer  sourcing-XXX.json
        -> recherche.md          : un dossier de recherche par produit, avec
                                   les liens 1688 / Taobao / Amazon / Cdiscount
                                   et les mots-cles chinois
        -> enrichissement.json   : le squelette a remplir avec ce que tu trouves

     node batch/enrichir.mjs fusionner sourcing-XXX.json enrichissement.json
        -> sourcing-XXX-enrichi.json : reimportable tel quel dans l'app

   Ce qui est automatique et fiable : obligations reglementaires, risque
   contrefacon, pistes de code SH, score, statut propose, calculs.
   Ce qui demande un humain (ou Claude Code avec acces web) : les prix reels
   sur 1688 et chez les concurrents. Aucun scraping n'est fait ici : 1688,
   Taobao et Amazon bloquent les robots et renvoient des prix faux en silence,
   ce qui est pire que pas de prix du tout quand on engage un achat.
   =========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { REGLES_REG, MARQUES_RISQUE, MOTS_COPIE, PISTES_SH, LEXIQUE_ZH } from './regles.mjs';

/* ---------- utilitaires (memes conventions que l'app) ---------- */
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const num = (v) => { if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmt = (n, d = 2) => (n === null || !Number.isFinite(n)) ? '—' : n.toFixed(d).replace('.', ',');
const enc = encodeURIComponent;

/* Reprend exactement les formules de la section 4, verifiees contre l'app. */
function compute(p, cfg) {
  const r = { partial: [] };
  const L = num(p.cartonL), W = num(p.cartonW), H = num(p.cartonH);
  const pcs = num(p.pcsParCarton), kg = num(p.cartonPoidsKg);
  const vol = (L && W && H) ? L * W * H : null;
  r.cbmCarton = vol !== null ? vol / 1e6 : null;
  r.cbmParPiece = (r.cbmCarton !== null && pcs) ? r.cbmCarton / pcs : null;
  r.poidsParPiece = (kg !== null && pcs) ? kg / pcs : null;
  const taux = num(cfg.tauxRMBEUR), pRMB = num(p.prixUnitaireRMB);
  r.prixUnitaireEUR = (pRMB !== null && taux) ? pRMB / taux : null;
  const eurCbm = num(cfg.fretMaritimeEuroParCBM);
  r.fretMaritimeParPiece = (r.cbmParPiece !== null && eurCbm !== null) ? r.cbmParPiece * eurCbm : null;
  const divis = num(cfg.diviseurVolumetrique);
  r.poidsVolumetrique = (vol !== null && divis) ? vol / divis : null;
  const volPP = (r.poidsVolumetrique !== null && pcs) ? r.poidsVolumetrique / pcs : null;
  const charg = (r.poidsParPiece !== null || volPP !== null) ? Math.max(r.poidsParPiece || 0, volPP || 0) : null;
  const eurKg = num(cfg.fretAerienEuroParKg);
  r.fretAerienParPiece = (charg !== null && eurKg !== null) ? charg * eurKg : null;
  r.fret = r.fretMaritimeParPiece;
  if (r.fret === null) r.partial.push('fret');
  if (r.prixUnitaireEUR === null) {
    r.valeurEnDouane = r.droits = r.tva = r.coutRendu = r.prixVenteMini = r.densiteValeur = null;
    return r;
  }
  const fret = r.fret === null ? 0 : r.fret;
  r.valeurEnDouane = r.prixUnitaireEUR + fret;
  const tD = num(p.tauxDroits);
  if (tD === null) r.partial.push('droits');
  r.droits = r.valeurEnDouane * (tD === null ? 0 : tD);
  const tva = num(cfg.tauxTVA);
  r.tva = tva === null ? 0 : (r.valeurEnDouane + r.droits) * tva;
  r.coutRendu = r.prixUnitaireEUR + fret + r.droits + r.tva;
  const den = 1 - (num(cfg.margeCible) || 0) - (num(cfg.commissionMarketplace) || 0);
  r.prixVenteMini = den > 0.01 ? r.coutRendu / den : null;
  r.densiteValeur = (r.prixVenteMini !== null && r.cbmParPiece) ? r.prixVenteMini / r.cbmParPiece : null;
  return r;
}

const texteProduit = (p) => norm([p.nom, p.categorie].filter(Boolean).join(' '));

/* ---------- reglementaire : deterministe, sans reseau ---------- */
export function obligations(p) {
  const t = texteProduit(p), cat = norm(p.categorie);
  const out = [], notes = [], declencheurs = [];
  let critique = false;
  for (const r of REGLES_REG) {
    const parMot = (r.mots || []).some((m) => t.includes(m));
    const parCat = (r.cats || []).some((c) => cat === c);
    if (!parMot && !parCat) continue;
    declencheurs.push(r.id);
    r.obligations.forEach((o) => { if (!out.includes(o)) out.push(o); });
    if (r.note) notes.push(r.id + ' : ' + r.note);
    if (r.critique) critique = true;
  }
  // La REP emballage / Triman n'est PAS listee ici : elle s'applique a tout ce
  // qu'on importe, c'est une obligation d'entreprise (adhesion a un eco-organisme)
  // et pas un blocage propre au produit. La mettre partout rendait le filtre
  // « blocages reglementaires » de l'app inutilisable : 8 produits sur 8.
  return { obligations: out, notes, critique, declencheurs };
}

export function risqueContrefacon(p) {
  const t = texteProduit(p);
  const marque = MARQUES_RISQUE.find((m) => t.includes(m));
  if (marque) return { niveau: 'high', motif: 'marque ou licence citee : « ' + marque + ' »' };
  const copie = MOTS_COPIE.find((m) => new RegExp('\\b' + m + '\\b').test(t));
  if (copie) return { niveau: 'medium', motif: 'formulation de contournement : « ' + copie + ' »' };
  return { niveau: 'low', motif: '' };
}

/* Risque effectif = le plus severe entre ce que les regles detectent dans le nom
   et ce qui a deja ete evalue (a la main, ou par un batch precedent). Les regles
   peuvent lever une alerte, jamais en annuler une. */
const RANG_RISQUE = { low: 0, medium: 1, high: 2 };
export function risqueEffectif(p) {
  const detecte = risqueContrefacon(p);
  const existant = p.risqueContrefacon || 'low';
  if (RANG_RISQUE[detecte.niveau] >= RANG_RISQUE[existant]) return detecte;
  return { niveau: existant, motif: 'evaluation conservee d un passage precedent' };
}

export function pisteSH(p) {
  const t = texteProduit(p);
  const hit = PISTES_SH.find((s) => s.mots.some((m) => t.includes(m)));
  return hit ? { code: hit.code, libelle: hit.libelle, droits: hit.droits } : null;
}

export function motsClesZH(p) {
  const t = texteProduit(p), out = [];
  for (const [fr, zh] of Object.entries(LEXIQUE_ZH)) if (t.includes(fr) && !out.includes(zh)) out.push(zh);
  return out;
}

/* ---------- score : transparent, chaque composante est affichee ---------- */
export function score(p, cfg) {
  const r = compute(p, cfg);
  const parts = [];
  let s = 50;
  const add = (n, why) => { s += n; parts.push((n >= 0 ? '+' : '') + n + ' ' + why); };

  // marge face a la concurrence : le critere qui decide
  const conc = (p.concurrentsFR || []).map((c) => num(c.prixTTC)).filter((x) => x !== null && x > 0);
  const concMin = conc.length ? Math.min(...conc) : null;
  if (concMin !== null && r.prixVenteMini !== null) {
    const marge = (concMin - r.prixVenteMini) / concMin;
    if (marge > 0.4) add(25, 'marge confortable face au moins cher (' + fmt(concMin) + ' €)');
    else if (marge > 0.2) add(15, 'marge correcte face a la concurrence');
    else if (marge > 0.05) add(2, 'marge serree face a la concurrence');
    else add(-30, 'invendable au prix du marche (mini ' + fmt(r.prixVenteMini) + ' € vs ' + fmt(concMin) + ' €)');
  } else parts.push('0 concurrence non renseignee');
  if (conc.length >= 4) add(-8, 'marche sature (' + conc.length + ' offres relevees)');

  // densite de valeur
  if (r.densiteValeur !== null) {
    if (r.densiteValeur >= 6000) add(15, 'excellente densite (' + fmt(r.densiteValeur, 0) + ' €/CBM)');
    else if (r.densiteValeur >= 1500) add(6, 'densite acceptable');
    else add(-25, 'le fret mange la marge (' + fmt(r.densiteValeur, 0) + ' €/CBM)');
  } else parts.push('0 carton non mesure, densite inconnue');

  // ecart avec le prix usine
  const p1688 = num(p.prix1688), pStand = num(p.prixUnitaireRMB);
  if (p1688 !== null && pStand !== null && p1688 > 0) {
    const ratio = pStand / p1688;
    if (ratio > 2.5) add(-12, 'le stand vend ' + fmt(ratio, 1) + '× le prix usine, negocier ou passer en direct');
    else if (ratio > 1.6) add(-5, 'marge du stand notable (' + fmt(ratio, 1) + '×)');
    else add(8, 'prix stand proche du prix usine');
  } else parts.push('0 prix usine non releve');

  // MOQ : la tresorerie immobilisee
  const moq = num(p.moq);
  if (moq !== null && r.prixUnitaireEUR !== null) {
    const engagement = moq * r.prixUnitaireEUR;
    if (engagement > 3000) add(-12, 'MOQ lourde : ' + fmt(engagement, 0) + ' € engages');
    else if (engagement < 500) add(8, 'MOQ accessible (' + fmt(engagement, 0) + ' €)');
  }

  // reglementaire et PI
  const reg = obligations(p);
  if (reg.critique) add(-20, 'obligations lourdes : ' + reg.declencheurs.join(', '));
  else if (reg.obligations.length > 2) add(-6, 'quelques obligations a couvrir');
  const cf = risqueEffectif(p);
  if (cf.niveau === 'high') add(-35, 'risque contrefacon : ' + cf.motif);
  else if (cf.niveau === 'medium') add(-12, 'risque contrefacon : ' + cf.motif);

  // personnalisation et delai
  if (p.personnalisation) add(5, 'personnalisation possible (differenciation)');
  const delai = num(p.delaiJours);
  if (delai !== null && delai > 45) add(-6, 'delai long (' + delai + ' j)');

  return { score: Math.max(0, Math.min(100, Math.round(s))), detail: parts };
}

export function statutPropose(sc, p) {
  const cf = risqueEffectif(p);
  if (cf.niveau === 'high') return 'écarté';
  if (sc >= 70) return 'à_relancer';
  if (sc >= 45) return 'à_creuser';
  if (sc >= 25) return 'à_creuser';
  return 'écarté';
}

/* ---------- mode « preparer » ---------- */
function liens(p) {
  const nom = (p.nom || '').trim();
  const zh = motsClesZH(p);
  const q1688 = zh[0] || nom, qfr = nom || p.categorie || '';
  return [
    ['1688 (usine, IP chinoise conseillee)', 'https://s.1688.com/selloffer/offer_search.htm?keywords=' + enc(q1688)],
    ['Taobao', 'https://s.taobao.com/search?q=' + enc(q1688)],
    ['Amazon.fr', 'https://www.amazon.fr/s?k=' + enc(qfr)],
    ['Cdiscount', 'https://www.cdiscount.com/search/10/' + enc(qfr) + '.html'],
    ['ManoMano', 'https://www.manomano.fr/recherche/' + enc(qfr)],
    ['Temu', 'https://www.temu.com/search_result.html?search_key=' + enc(qfr)],
    ['Tarif douanier (verifier le code SH)', 'https://www.douane.gouv.fr/dam/rita']
  ];
}

function preparer(exportPath) {
  const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const cfg = data.config || {};
  const produits = (data.products || []).filter((p) => p.statut !== 'écarté');
  const dir = path.dirname(path.resolve(exportPath));

  const md = ['# Dossier de recherche — ' + new Date().toLocaleDateString('fr-FR'),
    '', produits.length + ' produits a traiter (les « écarté » sont exclus).',
    '', 'Pour chaque produit : relever le prix usine sur 1688, deux a quatre prix',
    'de revente en France, et confirmer le code SH. Reporter dans `enrichissement.json`.',
    '',
    '## A regler une seule fois, au niveau de l entreprise',
    '',
    'Ces obligations ne dependent pas du produit et ne sont donc pas repetees plus bas :',
    '',
    '- numero EORI pour dedouaner',
    '- TVA a l importation (autoliquidation sur la declaration de TVA)',
    '- REP emballage : adhesion a un eco-organisme (Citeo) + logo Triman',
    '- REP textile (Refashion) si tu importes du textile, REP DEEE si tu importes de l electronique',
    '- mentions obligatoires : importateur, adresse, notice en francais',
    ''];
  const squelette = [];

  for (const p of produits) {
    const r = compute(p, cfg);
    const reg = obligations(p), cf = risqueContrefacon(p), sh = pisteSH(p), zh = motsClesZH(p);
    md.push('---', '', '## ' + (p.nom || '(sans nom)') + '  `' + p.id.slice(0, 8) + '`', '');
    md.push('| | |', '|---|---|');
    md.push('| Stand | ' + [p.stand?.batiment, p.stand?.etage, p.stand?.numero].filter(Boolean).join('-') + ' |');
    md.push('| Prix stand | ' + fmt(num(p.prixUnitaireRMB)) + ' RMB · ' + fmt(r.prixUnitaireEUR) + ' € |');
    md.push('| MOQ | ' + (p.moq ?? '—') + ' |');
    md.push('| Carton | ' + (r.cbmParPiece !== null ? fmt(r.cbmParPiece, 5) + ' CBM/pce' : 'non mesure') + ' |');
    md.push('| Cout rendu | ' + (r.coutRendu !== null ? fmt(r.coutRendu) + ' €' : '—') +
      (r.partial.length ? ' _(incomplet : ' + r.partial.join(', ') + ')_' : '') + ' |');
    md.push('| Vente mini | ' + (r.prixVenteMini !== null ? fmt(r.prixVenteMini) + ' €' : '—') + ' |');
    md.push('| Densite | ' + (r.densiteValeur !== null ? fmt(r.densiteValeur, 0) + ' €/CBM' : '—') +
      (r.densiteValeur !== null && r.densiteValeur < 1500 ? ' ⚠️ le fret mange la marge' : '') + ' |');
    md.push('');
    if (zh.length) md.push('**Mots-cles 1688 :** ' + zh.join(' · ') + '  (sinon, copier le nom sur la carte de visite)', '');
    md.push('**Reglementaire (automatique) :** ' + reg.obligations.join(', '));
    if (reg.notes.length) md.push('', reg.notes.map((n) => '> ' + n).join('\n'));
    md.push('', '**Contrefacon :** ' + cf.niveau + (cf.motif ? ' — ' + cf.motif : ''));
    md.push('', '**Piste code SH :** ' + (sh ? '`' + sh.code + '` ' + sh.libelle + ' — droits indicatifs ' +
      fmt(sh.droits * 100, 1) + ' % — **a confirmer sur RITA**' : 'aucune piste, a chercher'), '');
    if ((p.liens || []).length) {
      md.push('**Liens releves sur place :**');
      p.liens.forEach((l) => md.push('- ' + l.url));
      md.push('');
    }
    md.push('**Recherches :**');
    liens(p).forEach(([k, u]) => md.push('- [' + k + '](' + u + ')'));
    md.push('');

    squelette.push({
      id: p.id, nom: p.nom || '', _stand: [p.stand?.batiment, p.stand?.etage, p.stand?.numero].filter(Boolean).join('-'),
      prix1688: null,
      concurrentsFR: [{ source: '', url: '', prixTTC: null, note: '' }],
      codeSH: sh ? sh.code : null,
      tauxDroits: sh ? sh.droits : null,
      notes: ''
    });
  }

  const mdPath = path.join(dir, 'recherche.md');
  const jsonPath = path.join(dir, 'enrichissement.json');
  fs.writeFileSync(mdPath, md.join('\n'));
  fs.writeFileSync(jsonPath, JSON.stringify(squelette, null, 2));
  console.log('✓ ' + produits.length + ' produits preparés');
  console.log('  ' + mdPath + '   (le dossier de recherche)');
  console.log('  ' + jsonPath + '   (a remplir, puis « fusionner »)');
}

/* ---------- mode « fusionner » ---------- */
function fusionner(exportPath, enrichPath) {
  const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const cfg = data.config || {};
  const saisies = JSON.parse(fs.readFileSync(enrichPath, 'utf8'));
  const parId = new Map(saisies.map((s) => [s.id, s]));
  const avertissements = [];

  for (const p of data.products) {
    const s = parId.get(p.id);
    if (s) {
      const v = num(s.prix1688);
      if (v !== null && v > 0) {
        if (num(p.prixUnitaireRMB) !== null && v > num(p.prixUnitaireRMB) * 3)
          avertissements.push(p.nom + ' : prix 1688 (' + v + ') tres superieur au prix stand, verifier l unite');
        p.prix1688 = v;
      }
      const conc = (s.concurrentsFR || [])
        .filter((c) => c && (c.source || c.url) && num(c.prixTTC) !== null && num(c.prixTTC) > 0)
        .map((c) => ({ source: String(c.source || '').slice(0, 60), url: String(c.url || ''),
                       prixTTC: num(c.prixTTC), note: String(c.note || '').slice(0, 200) }));
      if (conc.length) p.concurrentsFR = conc;
      if (s.codeSH) p.codeSH = String(s.codeSH).replace(/\s/g, '');
      const td = num(s.tauxDroits);
      if (td !== null) {
        if (td < 0 || td > 0.6) avertissements.push(p.nom + ' : taux de droits ' + td + ' hors plage plausible, ignore');
        else p.tauxDroits = td;
      }
      if (s.notes) p.transcription = [p.transcription, s.notes].filter(Boolean).join(' — ');
    }
    // deterministe : applique a tous, meme sans saisie
    const reg = obligations(p);
    p.obligationsReg = reg.obligations;
    // Les regles ne voient que le nom : elles peuvent detecter un risque, jamais
    // en absoudre un. Une evaluation humaine plus severe est toujours conservee.
    p.risqueContrefacon = risqueEffectif(p).niveau;
    const sc = score(p, cfg);
    p.scoreGlobal = sc.score;
    p._scoreDetail = sc.detail;                 // trace lisible, ignoree par l'app
    p.statutPropose = statutPropose(sc.score, p);
    // updatedAt volontairement NON modifie : l'app n'ecrase alors jamais une
    // saisie terrain plus recente, seuls les champs d'enrichissement passent.
  }

  const out = exportPath.replace(/\.json$/, '') + '-enrichi.json';
  data.enrichedAt = new Date().toISOString();
  fs.writeFileSync(out, JSON.stringify(data, null, 2));

  const tri = [...data.products].sort((a, b) => (b.scoreGlobal || 0) - (a.scoreGlobal || 0));
  console.log('\n✓ ' + data.products.length + ' produits enrichis → ' + out);
  console.log('\nClassement :');
  for (const p of tri) {
    const bloc = (p.obligationsReg || []).length > 2 ? ' ⚠' : '  ';
    const cf = p.risqueContrefacon === 'high' ? ' 🚫' : '  ';
    console.log('  ' + String(p.scoreGlobal).padStart(3) + bloc + cf + ' ' +
      (p.nom || '(sans nom)').slice(0, 40).padEnd(42) + (p.statutPropose || ''));
  }
  if (avertissements.length) {
    console.log('\nAvertissements :');
    avertissements.forEach((a) => console.log('  ! ' + a));
  }
  console.log('\nImporter ce fichier dans l app : Réglages → Importer un JSON enrichi.');
}

/* ---------- entree ---------- */
const [, , mode, f1, f2] = process.argv;
if (mode === 'preparer' && f1) preparer(f1);
else if (mode === 'fusionner' && f1 && f2) fusionner(f1, f2);
else if (process.argv[1] && process.argv[1].endsWith('enrichir.mjs')) {
  console.log('Usage :\n  node batch/enrichir.mjs preparer  <export.json>\n' +
              '  node batch/enrichir.mjs fusionner <export.json> <enrichissement.json>');
}
