/*
 * BABI A.C Player Rating — textes d'aide (conseils d'observation par poste).
 */
(function (global) {
  'use strict';

  var SCALE = [
    { note: 0, label: 'Très insuffisant ou échec répété' },
    { note: 1, label: 'Insuffisant' },
    { note: 2, label: 'En dessous du niveau attendu' },
    { note: 3, label: 'Correct' },
    { note: 4, label: 'Très bon' },
    { note: 5, label: 'Excellent et reproductible' }
  ];

  var LATERAL = {
    focus: 'Défense, transitions, appels, centres et soutien offensif.',
    criteres: {
      technique: 'Qualité des centres, contrôles en course, duels défensifs sur l’ailier.',
      placement: 'Alignement avec la défense, couverture du couloir, position lors des phases offensives.',
      decisions: 'Choisir le bon moment pour monter ou rester ; centre, passe ou conservation.',
      collectif: 'Soutien offensif, combinaisons avec l’ailier, équilibre avec le défenseur central.',
      transitions: 'Vitesse de repli après la perte, appels dans le dos, projection rapide.'
    }
  };

  var AILIER = {
    focus: 'Élimination, danger créé, appels, centres et contribution défensive.',
    criteres: {
      technique: 'Dribbles, centres, finition et qualité de la dernière passe.',
      placement: 'Largeur, appels en profondeur, présence au second poteau.',
      decisions: 'Dribbler, centrer, repiquer ou temporiser au bon moment.',
      collectif: 'Danger réellement créé pour l’équipe, aide défensive au latéral.',
      transitions: 'Projection en contre-attaque, repli et pressing après la perte.'
    }
  };

  var POSITION_TIPS = {
    GK: {
      focus: 'Placement, arrêts, relances et gestion de la profondeur.',
      criteres: {
        technique: 'Qualité des arrêts, prise de balle, jeu au pied et précision des relances.',
        placement: 'Positionnement sur les frappes, gestion de la profondeur, timing des sorties.',
        decisions: 'Sortir ou rester sur sa ligne ; relance courte ou longue ; prise de risque.',
        collectif: 'Organisation de la défense, sécurité apportée, disponibilité pour relancer.',
        transitions: 'Relance rapide après un arrêt, couverture derrière une défense haute.'
      }
    },
    DC: {
      focus: 'Couverture, interceptions, duels et sécurité de relance.',
      criteres: {
        technique: 'Duels, tacles propres, jeu de tête, qualité de la relance.',
        placement: 'Couverture, alignement, anticipation des appels et des passes à intercepter.',
        decisions: 'Sortir au duel ou temporiser ; relance sûre plutôt que risquée.',
        collectif: 'Coordination de la charnière, compensation des montées des latéraux.',
        transitions: 'Repli après la perte, gestion des contres, relance qui lance l’attaque.'
      }
    },
    DD: LATERAL,
    DG: LATERAL,
    MDC: {
      focus: 'Couverture, récupération, équilibre et passes sous pression.',
      criteres: {
        technique: 'Récupération, passes sous pression, orientation du corps.',
        placement: 'Couverture devant la défense, fermeture des lignes de passe.',
        decisions: 'Choix de passe sûr, faute tactique utile, moment pour casser une ligne.',
        collectif: 'Équilibre de l’équipe, couverture des montées des latéraux.',
        transitions: 'Contre-pressing, protection à la perte, première relance propre.'
      }
    },
    MC: {
      focus: 'Circulation, disponibilité, progression et équilibre.',
      criteres: {
        technique: 'Qualité de passe, contrôle orienté, conservation sous pression.',
        placement: 'Disponibilité entre les lignes, occupation intelligente des espaces.',
        decisions: 'Rythme de circulation, choix de progression, gestion du tempo.',
        collectif: 'Lien entre défense et attaque, équilibre, soutien des partenaires.',
        transitions: 'Repli, projection, réactivité à la perte et à la récupération.'
      }
    },
    MOC: {
      focus: 'Création, passes clés, lecture des espaces et décisions dans le dernier tiers.',
      criteres: {
        technique: 'Passes clés, dribbles courts, frappes de loin.',
        placement: 'Lecture des espaces entre les lignes, réception orientée vers le but.',
        decisions: 'Choix dans le dernier tiers : dernière passe, frappe ou conservation.',
        collectif: 'Occasions créées pour les attaquants, pressing sur la relance adverse.',
        transitions: 'Accélération après la récupération, premier rideau défensif.'
      }
    },
    AD: AILIER,
    AG: AILIER,
    BU: {
      focus: 'Finition, appels, jeu dos au but, occasions et pressing utile.',
      criteres: {
        technique: 'Finition, jeu de tête, contrôle et qualité des remises.',
        placement: 'Appels, position dans la surface, timing face au hors-jeu.',
        decisions: 'Frapper ou servir un partenaire, choix des appels, gestion des occasions.',
        collectif: 'Jeu dos au but, fixation des défenseurs, pressing utile.',
        transitions: 'Pressing immédiat à la perte, appels dès la récupération.'
      }
    }
  };

  var CONSIGNES_HINTS = {
    role: 'Applique le rôle demandé et les instructions tactiques du match.',
    discipline: 'Tient sa position dans le système, ne déserte pas sa zone.',
    reaction: 'Corrige rapidement après une remarque du staff ou du capitaine.',
    communication: 'Communique (vocal, signaux) et se coordonne avec ses partenaires.'
  };

  var API = { SCALE: SCALE, POSITION_TIPS: POSITION_TIPS, CONSIGNES_HINTS: CONSIGNES_HINTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.BabiContent = API;
})(typeof window !== 'undefined' ? window : this);
