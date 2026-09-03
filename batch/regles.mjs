/* Regles deterministes du batch du soir : reglementaire, contrefacon, score.
   Aucune dependance, aucun reseau. C'est le module qui evite le plus de pertes :
   un produit bloque a la douane ou interdit a la vente coute plus cher qu'une
   marge mal estimee. Tout est en donnees pour rester relisable et modifiable. */

/* ---- obligations reglementaires, par declencheur ----------------------------
   Chaque regle : mots-cles (nom + categorie, sans accents, minuscules) ->
   obligations. Volontairement large : un faux positif coute une verification,
   un faux negatif coute un stock invendable. */
export const REGLES_REG = [
  { id: 'batterie', mots: ['batterie', 'accu', 'lithium', 'powerbank', 'power bank', 'rechargeable',
      'sans fil', 'bluetooth', 'tws', 'ecouteur', 'enceinte', 'montre connectee', 'trottinette', 'velo electrique'],
    cats: ['audio'],
    obligations: ['UN38.3 batterie lithium', 'CE', 'RoHS', 'DEEE (D3E)', 'REP emballage + Triman'],
    critique: true,
    note: 'Transport aerien restreint. Exiger le rapport UN38.3 et la fiche de securite AVANT commande.' },

  { id: 'radio', mots: ['bluetooth', 'wifi', 'sans fil', 'tws', 'telecommande', 'rf', '2.4g', 'nfc'],
    obligations: ['directive RED (equipement radio)', 'CE', 'RoHS', 'DEEE (D3E)'],
    critique: true,
    note: 'Declaration UE de conformite RED obligatoire, avec rapport d essai radio.' },

  { id: 'electrique', mots: ['usb', 'led', 'lampe', 'chargeur', 'cable', 'adaptateur', 'prise', 'ventilateur',
      'moteur', 'electrique', 'electronique', 'ecran', 'camera'],
    cats: ['electronique', 'eclairage', 'accessoire telephone'],
    obligations: ['CE', 'RoHS', 'DEEE (D3E)', 'REACH', 'REP emballage + Triman'],
    note: 'Si alimentation secteur : directive basse tension + CEM.' },

  { id: 'jouet', mots: ['jouet', 'peluche', 'poupee', 'figurine', 'puzzle', 'enfant', 'bebe', 'lego', 'brique'],
    cats: ['jouet'],
    obligations: ['EN71-1/2/3 (securite des jouets)', 'marquage CE', 'directive 2009/48/CE',
      'avertissement age + coordonnees importateur', 'REP emballage + Triman'],
    critique: true,
    note: 'Controle douanier frequent. Rapport de test EN71 par laboratoire accredite exige.' },

  { id: 'alimentaire', mots: ['cuisine', 'assiette', 'verre', 'tasse', 'gourde', 'bouteille', 'couvert',
      'paille', 'boite repas', 'lunch', 'thermos', 'planche'],
    cats: ['cuisine'],
    obligations: ['contact alimentaire : reglement CE 1935/2004', 'declaration de conformite du fournisseur',
      'symbole verre-fourchette', 'REP emballage + Triman'],
    critique: true,
    note: 'Migration specifique a tester si plastique ou melamine.' },

  { id: 'cosmetique', mots: ['creme', 'serum', 'maquillage', 'vernis', 'parfum', 'savon', 'shampoing', 'masque visage'],
    cats: ['beaute'],
    obligations: ['reglement CE 1223/2009', 'notification CPNP', 'personne responsable dans l UE',
      'dossier information produit (DIP)'],
    critique: true,
    note: 'Import quasi impossible sans personne responsable etablie dans l UE. A eviter en premiere importation.' },

  { id: 'textile', mots: ['tshirt', 't-shirt', 'textile', 'coton', 'vetement', 'chaussette', 'sac', 'casquette', 'echarpe'],
    cats: ['textile', 'bagagerie'],
    obligations: ['etiquetage composition (reglement UE 1007/2011)', 'REACH', 'REP textile (Refashion)',
      'REP emballage + Triman'],
    note: 'Etiquette de composition en francais cousue, obligatoire.' },

  { id: 'bijou', mots: ['bijou', 'bracelet', 'collier', 'bague', 'boucle', 'piercing'],
    cats: ['bijoux'],
    obligations: ['REACH (nickel, plomb, cadmium)', 'poinconnage si metal precieux', 'REP emballage + Triman'],
    critique: true,
    note: 'Test nickel obligatoire pour tout contact prolonge avec la peau.' },

  { id: 'protection', mots: ['masque', 'gant', 'casque', 'lunette', 'genouillere', 'harnais', 'gilet'],
    obligations: ['EPI : reglement UE 2016/425', 'examen UE de type par organisme notifie', 'CE'],
    critique: true,
    note: 'Equipement de protection individuelle : procedure lourde, categorie a verifier.' }
];

/* ---- risque propriete intellectuelle --------------------------------------- */
export const MARQUES_RISQUE = [
  'disney', 'marvel', 'pokemon', 'hello kitty', 'sanrio', 'nintendo', 'mario', 'stitch',
  'apple', 'airpods', 'iphone', 'airtag', 'samsung', 'nike', 'adidas', 'jordan', 'gucci',
  'louis vuitton', 'chanel', 'dyson', 'lego', 'barbie', 'harry potter', 'star wars',
  'spiderman', 'batman', 'labubu', 'squishmallow', 'stanley', 'jellycat', 'bluey', 'anime'
];
export const MOTS_COPIE = ['style', 'compatible', 'inspire', 'type', 'like', 'replique', 'copie', 'oem'];

/* ---- pistes de code SH ------------------------------------------------------
   PISTES, pas verites : un code SH errone fausse les droits et engage ta
   declaration en douane. A confirmer sur le tarif douanier officiel (RITA/TARIC). */
export const PISTES_SH = [
  { mots: ['lampe', 'led', 'eclairage', 'luminaire'], code: '9405', libelle: 'appareils d eclairage', droits: 0.027 },
  { mots: ['cable', 'usb', 'chargeur', 'adaptateur'], code: '8544', libelle: 'fils et cables isoles', droits: 0.033 },
  { mots: ['ecouteur', 'casque', 'enceinte', 'audio'], code: '8518', libelle: 'micros, haut-parleurs, casques', droits: 0.03 },
  { mots: ['jouet', 'peluche', 'poupee', 'figurine'], code: '9503', libelle: 'jouets', droits: 0.0 },
  { mots: ['bijou', 'bracelet', 'collier', 'bague'], code: '7117', libelle: 'bijouterie de fantaisie', droits: 0.04 },
  { mots: ['outil', 'tournevis', 'pince', 'cle'], code: '8205', libelle: 'outils a main', droits: 0.027 },
  { mots: ['plastique', 'panier', 'bac', 'rangement', 'boite'], code: '3924', libelle: 'articles de menage en plastique', droits: 0.065 },
  { mots: ['textile', 'tshirt', 'coton', 'vetement'], code: '61/62', libelle: 'vetements', droits: 0.12 },
  { mots: ['sac', 'bagage', 'valise', 'trousse'], code: '4202', libelle: 'contenants et bagages', droits: 0.037 },
  { mots: ['montre'], code: '9102', libelle: 'montres', droits: 0.045 },
  { mots: ['cuisine', 'couvert', 'ustensile', 'poele'], code: '7323', libelle: 'articles de menage en metal', droits: 0.032 }
];

/* ---- lexique FR -> ZH pour chercher sur 1688/Taobao -------------------------
   1688 ne repond quasiment qu'en chinois. Termes courants et verifiables ;
   pour le reste, le mieux reste le nom sur la carte de visite du vendeur. */
export const LEXIQUE_ZH = {
  'lampe': '台灯', 'led': 'LED灯', 'eclairage': '灯具', 'lampe led': 'LED台灯',
  'cable': '数据线', 'usb': 'USB线', 'chargeur': '充电器', 'batterie externe': '充电宝',
  'ecouteur': '耳机', 'ecouteurs': '蓝牙耳机', 'enceinte': '音箱', 'casque': '头戴式耳机',
  'jouet': '玩具', 'peluche': '毛绒玩具', 'poupee': '娃娃', 'figurine': '手办',
  'bijou': '首饰', 'bracelet': '手链', 'collier': '项链', 'bague': '戒指',
  'outil': '工具', 'tournevis': '螺丝刀', 'pince': '钳子',
  'cuisine': '厨房用品', 'gourde': '水壶', 'bouteille': '保温杯', 'boite': '收纳盒',
  'rangement': '收纳', 'panier': '收纳篮', 'sac': '包', 'textile': '纺织品',
  'montre': '手表', 'coque': '手机壳', 'support telephone': '手机支架',
  'ventilateur': '风扇', 'miroir': '镜子', 'brosse': '刷子', 'animalerie': '宠物用品'
};
