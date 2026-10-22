/*
 * BABI A.C Player Rating — moteur de calcul.
 *
 * Module pur : aucune dépendance au DOM, aucun stockage, aucun accès réseau.
 * Utilisable dans le navigateur (window.BabiScoring) et dans Node (require) pour les tests.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Référentiels                                                         */
  /* ------------------------------------------------------------------ */

  var POSITIONS = ['GK', 'DC', 'DD', 'DG', 'MDC', 'MC', 'MOC', 'AD', 'AG', 'BU'];

  var POSITION_LABELS = {
    GK: 'Gardien de but',
    DC: 'Défenseur central',
    DD: 'Défenseur droit',
    DG: 'Défenseur gauche',
    MDC: 'Milieu défensif central',
    MC: 'Milieu central',
    MOC: 'Milieu offensif central',
    AD: 'Ailier droit',
    AG: 'Ailier gauche',
    BU: 'Buteur'
  };

  var FC_STATS = [
    { key: 'archetype', label: "Niveau de l'archétype", short: 'Archétype', unit: '%', higherIsBetter: true, max: 100,
      hint: 'Niveau actuel ÷ niveau maximal accessible au moment de l’évaluation, en % (0 à 100).' },
    { key: 'buts', label: 'Buts par match', short: 'Buts', unit: '/ match', higherIsBetter: true, max: 99,
      hint: 'Moyenne de buts par match affichée dans le jeu.' },
    { key: 'passes', label: 'Passes décisives par match', short: 'Passes D.', unit: '/ match', higherIsBetter: true, max: 99,
      hint: 'Moyenne de passes décisives par match.' },
    { key: 'contributions', label: 'Buts + passes décisives par match', short: 'B + PD', unit: '/ match', higherIsBetter: true, max: 99,
      hint: 'Contributions offensives par match (buts + passes décisives).' },
    { key: 'interceptions', label: 'Interceptions par match', short: 'Interceptions', unit: '/ match', higherIsBetter: true, max: 99,
      hint: 'Moyenne d’interceptions par match.' },
    { key: 'ballonsPerdus', label: 'Ballons perdus par match', short: 'Ballons perdus', unit: '/ match', higherIsBetter: false, max: 99,
      hint: 'Moyenne de ballons perdus par match. Plus la valeur est basse, meilleure est la note.' }
  ];

  var PERF_CRITERIA = [
    { key: 'technique', label: 'Technique et qualité d’exécution' },
    { key: 'placement', label: 'Placement et lecture du jeu' },
    { key: 'decisions', label: 'Qualité des décisions' },
    { key: 'collectif', label: 'Contribution au rôle et au collectif' },
    { key: 'transitions', label: 'Transitions et adaptation au match' }
  ];

  var CONSIGNES_CRITERIA = [
    { key: 'role', label: 'Respect du rôle et des instructions tactiques' },
    { key: 'discipline', label: 'Discipline de placement et respect du système' },
    { key: 'reaction', label: 'Réaction aux consignes et corrections du staff' },
    { key: 'communication', label: 'Communication et coordination collective' }
  ];

  var BLOCK_MAX = { fc: 30, perf: 50, consignes: 20 };
  var NOTE_MAX = 5;
  var NOTE_STEP = 0.5;
  var OBSERVERS = ['a', 'b'];
  var MENTIONS = { 1: 'Niveau en développement', 2: 'Joueur compétent', 3: 'Joueur confirmé' };
  var TOLERANCE = 0.01;

  var SETTINGS_FORMAT = 'babi-ac-player-rating/parametres';
  var EVALUATION_FORMAT = 'babi-ac-player-rating/evaluation';
  var FORMAT_VERSION = 1;

  var POSITIVE_RULES = ['lineaire', 'racine'];
  var NEGATIVE_RULES = ['lineaire', 'zone'];

  /* ------------------------------------------------------------------ */
  /* Paramètres initiaux                                                  */
  /* ------------------------------------------------------------------ */

  // Ordre : archétype, buts, passes, buts+passes, interceptions, ballons perdus.
  var DEFAULT_COEFFICIENTS = {
    GK: [60, 2, 3, 0, 10, 25],
    DC: [30, 3, 3, 0, 25, 39],
    DD: [25, 5, 15, 2, 20, 33],
    DG: [25, 5, 15, 2, 20, 33],
    MDC: [25, 3, 10, 2, 30, 30],
    MC: [25, 8, 20, 5, 17, 25],
    MOC: [20, 15, 25, 20, 5, 15],
    AD: [20, 25, 15, 25, 3, 12],
    AG: [20, 25, 15, 25, 3, 12],
    BU: [20, 30, 10, 30, 2, 8]
  };

  // Seuils de référence initiaux (À CALIBRER PAR LE STAFF).
  // Statistiques positives : valeur qui donne 100/100.
  // Ballons perdus : valeur à partir de laquelle la note tombe à 0/100.
  var DEFAULT_THRESHOLDS = {
    GK: [100, 0.05, 0.1, 0.15, 1.5, 6],
    DC: [100, 0.2, 0.15, 0.3, 5, 8],
    DD: [100, 0.25, 0.4, 0.6, 3.5, 12],
    DG: [100, 0.25, 0.4, 0.6, 3.5, 12],
    MDC: [100, 0.25, 0.3, 0.5, 5, 12],
    MC: [100, 0.4, 0.5, 0.8, 3, 14],
    MOC: [100, 0.6, 0.8, 1.3, 1.5, 18],
    AD: [100, 0.8, 0.6, 1.3, 1.2, 18],
    AG: [100, 0.8, 0.6, 1.3, 1.2, 18],
    BU: [100, 1, 0.5, 1.4, 0.8, 18]
  };

  function rowToStats(row) {
    var out = {};
    FC_STATS.forEach(function (s, i) { out[s.key] = row[i]; });
    return out;
  }

  function defaultSettings() {
    var seuils = {};
    var coefficients = {};
    POSITIONS.forEach(function (p) {
      seuils[p] = rowToStats(DEFAULT_THRESHOLDS[p]);
      coefficients[p] = rowToStats(DEFAULT_COEFFICIENTS[p]);
    });
    return {
      etoiles: { deux: 50, trois: 75 },
      sessions: { actif: true, minimum: 3 },
      normalisation: { statsPositives: 'lineaire', ballonsPerdus: 'lineaire', zoneExcellence: 25 },
      seuils: seuils,
      coefficients: coefficients,
      poidsPerformance: { technique: 10, placement: 10, decisions: 10, collectif: 10, transitions: 10 },
      poidsConsignes: { role: 8, discipline: 5, reaction: 4, communication: 3 }
    };
  }

  function cloneSettings(s) {
    return JSON.parse(JSON.stringify(s));
  }

  function emptyEvaluation(poste) {
    var fc = {};
    FC_STATS.forEach(function (s) { fc[s.key] = { raw: '', nd: false }; });
    var perf = {};
    PERF_CRITERIA.forEach(function (c) { perf[c.key] = { a: null, b: null }; });
    var consignes = {};
    CONSIGNES_CRITERIA.forEach(function (c) { consignes[c.key] = { a: null, b: null }; });
    return { joueur: '', poste: poste || 'MC', date: '', sessions: '', fc: fc, perf: perf, consignes: consignes };
  }

  /* ------------------------------------------------------------------ */
  /* Outils numériques                                                    */
  /* ------------------------------------------------------------------ */

  function clamp(x, min, max) { return Math.min(max, Math.max(min, x)); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  // Élimine le bruit des flottants (ex. 74.99999999999 -> 75).
  function clean(x) { return Math.round(x * 1e6) / 1e6; }
  function sum(values) { return values.reduce(function (a, b) { return a + (isNum(b) ? b : 0); }, 0); }

  /**
   * Analyse une saisie numérique (virgule ou point acceptés).
   * Ne transforme jamais un champ vide en 0.
   */
  function parseNumber(raw, max) {
    var str = raw == null ? '' : String(raw).trim().replace(/\s+/g, '');
    if (str === '') return { status: 'vide', value: null };
    if (/^-/.test(str)) return { status: 'invalide', value: null, error: 'Les valeurs négatives ne sont pas autorisées.' };
    if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(str)) return { status: 'invalide', value: null, error: 'Saisissez un nombre (ex. 0,45).' };
    var value = parseFloat(str.replace(',', '.'));
    if (!isNum(value)) return { status: 'invalide', value: null, error: 'Saisissez un nombre (ex. 0,45).' };
    if (max != null && value > max) {
      return { status: 'invalide', value: null, error: 'La valeur doit être comprise entre 0 et ' + formatNumber(max) + '.' };
    }
    return { status: 'ok', value: value };
  }

  function isValidNote(n) {
    return isNum(n) && n >= 0 && n <= NOTE_MAX && Math.abs(n / NOTE_STEP - Math.round(n / NOTE_STEP)) < 1e-9;
  }

  /* ------------------------------------------------------------------ */
  /* Normalisation                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Convertit une valeur brute en note sur 100.
   * Retourne NaN si le seuil est inutilisable (≤ 0) : jamais de division par zéro.
   */
  function normalizeStat(value, threshold, higherIsBetter, rules) {
    if (!isNum(value) || value < 0 || !isNum(threshold) || threshold <= 0) return NaN;
    rules = rules || {};
    if (higherIsBetter) {
      var ratio = value / threshold;
      var base = rules.statsPositives === 'racine' ? Math.sqrt(ratio) : ratio;
      return clamp(base * 100, 0, 100);
    }
    if (rules.ballonsPerdus === 'zone') {
      var zone = clamp(isNum(rules.zoneExcellence) ? rules.zoneExcellence : 0, 0, 90);
      var excellent = threshold * zone / 100;
      if (value <= excellent) return 100;
      if (value >= threshold) return 0;
      return clamp((threshold - value) / (threshold - excellent) * 100, 0, 100);
    }
    return clamp((threshold - value) / threshold * 100, 0, 100);
  }

  /* ------------------------------------------------------------------ */
  /* Validation des paramètres                                            */
  /* ------------------------------------------------------------------ */

  function validateSettings(s) {
    var errors = [];
    function err(section, message, poste) { errors.push({ section: section, message: message, poste: poste || null }); }

    var e = s.etoiles || {};
    var deuxOk = isNum(e.deux) && e.deux >= 0 && e.deux <= 100;
    var troisOk = isNum(e.trois) && e.trois >= 0 && e.trois <= 100;
    if (!deuxOk) err('etoiles', 'Le seuil 2 étoiles doit être un nombre entre 0 et 100.');
    if (!troisOk) err('etoiles', 'Le seuil 3 étoiles doit être un nombre entre 0 et 100.');
    if (deuxOk && troisOk && e.trois < e.deux) err('etoiles', 'Le seuil 3 étoiles (' + formatNumber(e.trois) + ') doit être supérieur ou égal au seuil 2 étoiles (' + formatNumber(e.deux) + ').');

    var ss = s.sessions || {};
    if (typeof ss.actif !== 'boolean') err('sessions', 'Le choix d’activation de la règle de confirmation est invalide.');
    if (!(isNum(ss.minimum) && Math.floor(ss.minimum) === ss.minimum && ss.minimum >= 1 && ss.minimum <= 50)) {
      err('sessions', 'Le nombre minimal de sessions doit être un entier entre 1 et 50.');
    }

    var n = s.normalisation || {};
    if (POSITIVE_RULES.indexOf(n.statsPositives) < 0) err('normalisation', 'Règle de normalisation des statistiques positives inconnue.');
    if (NEGATIVE_RULES.indexOf(n.ballonsPerdus) < 0) err('normalisation', 'Règle de normalisation des ballons perdus inconnue.');
    if (!(isNum(n.zoneExcellence) && n.zoneExcellence >= 0 && n.zoneExcellence <= 90)) {
      err('normalisation', 'La zone d’excellence des ballons perdus doit être comprise entre 0 et 90 %.');
    }

    POSITIONS.forEach(function (p) {
      var seuils = (s.seuils || {})[p] || {};
      FC_STATS.forEach(function (st) {
        var v = seuils[st.key];
        if (!(isNum(v) && v > 0 && v <= st.max)) {
          err('seuils', p + ' — seuil « ' + st.short + ' » : nombre strictement positif requis (max ' + formatNumber(st.max) + ').', p);
        }
      });
      var coefs = (s.coefficients || {})[p] || {};
      var allNum = true;
      FC_STATS.forEach(function (st) {
        var v = coefs[st.key];
        if (!(isNum(v) && v >= 0 && v <= 100)) {
          allNum = false;
          err('coefficients', p + ' — coefficient « ' + st.short + ' » : nombre entre 0 et 100 requis.', p);
        }
      });
      if (allNum) {
        var total = coefficientTotal(s, p);
        if (Math.abs(total - 100) > TOLERANCE) {
          err('coefficients', p + ' — les coefficients totalisent ' + formatNumber(total) + ' % au lieu de 100 %.', p);
        }
      }
    });

    validateWeights(s.poidsPerformance, PERF_CRITERIA, BLOCK_MAX.perf, 'poidsPerformance', 'performances', err);
    validateWeights(s.poidsConsignes, CONSIGNES_CRITERIA, BLOCK_MAX.consignes, 'poidsConsignes', 'respect des consignes', err);
    return errors;
  }

  function validateWeights(weights, criteria, expected, section, name, err) {
    weights = weights || {};
    var allNum = true;
    criteria.forEach(function (c) {
      var v = weights[c.key];
      if (!(isNum(v) && v >= 0 && v <= expected)) {
        allNum = false;
        err(section, 'Poids « ' + c.label + ' » : nombre entre 0 et ' + expected + ' requis.');
      }
    });
    if (allNum) {
      var total = sum(criteria.map(function (c) { return weights[c.key]; }));
      if (Math.abs(total - expected) > TOLERANCE) {
        err(section, 'Les poids du bloc ' + name + ' totalisent ' + formatNumber(total) + ' points au lieu de ' + expected + '.');
      }
    }
  }

  function coefficientTotal(s, poste) {
    var coefs = (s.coefficients || {})[poste] || {};
    return clean(sum(FC_STATS.map(function (st) { return coefs[st.key]; })));
  }

  function weightTotal(weights, criteria) {
    return clean(sum(criteria.map(function (c) { return (weights || {})[c.key]; })));
  }

  /* ------------------------------------------------------------------ */
  /* Calcul                                                               */
  /* ------------------------------------------------------------------ */

  function computeFc(evaluation, settings) {
    var poste = evaluation.poste;
    var coefs = settings.coefficients[poste] || {};
    var seuils = settings.seuils[poste] || {};
    var items = FC_STATS.map(function (st) {
      var entry = evaluation.fc[st.key] || { raw: '', nd: false };
      var coefficient = isNum(coefs[st.key]) ? coefs[st.key] : 0;
      var threshold = seuils[st.key];
      var item = {
        key: st.key, label: st.label, short: st.short, coefficient: coefficient, threshold: threshold,
        higherIsBetter: st.higherIsBetter, used: coefficient > 0,
        status: 'ok', value: null, normalized: null, points: 0, error: null
      };
      if (entry.nd) {
        item.status = 'nd';
      } else {
        var parsed = parseNumber(entry.raw, st.max);
        item.status = parsed.status;
        item.value = parsed.value;
        item.error = parsed.error || null;
        if (parsed.status === 'ok') {
          var norm = normalizeStat(parsed.value, threshold, st.higherIsBetter, settings.normalisation);
          if (isNum(norm)) {
            item.normalized = norm;
            item.points = norm * coefficient / 100 * BLOCK_MAX.fc / 100;
          } else {
            item.status = 'seuil-invalide';
            item.error = 'Seuil de référence invalide pour ce poste : calcul impossible.';
          }
        }
      }
      return item;
    });
    var raw = sum(items.map(function (i) { return i.points; }));
    return { score: clamp(clean(raw), 0, BLOCK_MAX.fc), max: BLOCK_MAX.fc, items: items };
  }

  function computeObserved(entries, criteria, weights, max) {
    var items = criteria.map(function (c) {
      var entry = entries[c.key] || { a: null, b: null };
      var weight = isNum(weights[c.key]) ? weights[c.key] : 0;
      var notes = {};
      var manquants = [];
      var invalides = [];
      OBSERVERS.forEach(function (o) {
        var n = entry[o];
        if (n === null || n === undefined || n === '') {
          notes[o] = null;
          manquants.push(o.toUpperCase());
        } else if (!isValidNote(n)) {
          notes[o] = null;
          invalides.push(o.toUpperCase());
        } else {
          notes[o] = n;
        }
      });
      // Une note manquante ne vaut pas 0 : elle ne rapporte simplement aucun point
      // (la moitié du critère) et l'évaluation est signalée incomplète.
      var sumNotes = (notes.a || 0) + (notes.b || 0);
      var moyenne = manquants.length + invalides.length === 0 ? (notes.a + notes.b) / 2 : null;
      var points = (sumNotes / 2) / NOTE_MAX * weight;
      return {
        key: c.key, label: c.label, weight: weight, a: notes.a, b: notes.b,
        moyenne: moyenne, points: clean(points), manquants: manquants, invalides: invalides
      };
    });
    var raw = sum(items.map(function (i) { return i.points; }));
    return { score: clamp(clean(raw), 0, max), max: max, items: items };
  }

  function starsFor(total, etoiles) {
    var t = clean(total);
    if (isNum(etoiles.trois) && t >= etoiles.trois) return 3;
    if (isNum(etoiles.deux) && t >= etoiles.deux) return 2;
    return 1;
  }

  function sessionStatus(evaluation, settings) {
    var cfg = settings.sessions || {};
    if (!cfg.actif) return { type: 'desactive' };
    var parsed = parseNumber(evaluation.sessions, 999);
    if (parsed.status === 'vide') return { type: 'non-renseigne', minimum: cfg.minimum };
    if (parsed.status !== 'ok' || Math.floor(parsed.value) !== parsed.value) {
      return { type: 'invalide', minimum: cfg.minimum, error: 'Le nombre de sessions doit être un entier positif.' };
    }
    return {
      type: parsed.value >= cfg.minimum ? 'atteint' : 'provisoire',
      sessions: parsed.value, minimum: cfg.minimum
    };
  }

  function compute(evaluation, settings) {
    var paramErrors = validateSettings(settings);
    var fc = computeFc(evaluation, settings);
    var perf = computeObserved(evaluation.perf, PERF_CRITERIA, settings.poidsPerformance, BLOCK_MAX.perf);
    var consignes = computeObserved(evaluation.consignes, CONSIGNES_CRITERIA, settings.poidsConsignes, BLOCK_MAX.consignes);

    var total = clamp(clean(fc.score + perf.score + consignes.score), 0, 100);
    var etoiles = starsFor(total, settings.etoiles);
    var sessions = sessionStatus(evaluation, settings);

    var manquantes = [];
    var nonDisponibles = [];
    var invalides = [];
    fc.items.forEach(function (i) {
      if (!i.used) return; // coefficient nul : donnée non utilisée pour ce poste
      if (i.status === 'vide') manquantes.push('EA FC — ' + i.label);
      else if (i.status === 'nd') nonDisponibles.push('EA FC — ' + i.label);
      else if (i.status !== 'ok') invalides.push('EA FC — ' + i.label);
    });
    fc.items.forEach(function (i) {
      if (!i.used && (i.status === 'invalide')) invalides.push('EA FC — ' + i.label);
    });
    [[perf, 'Performances'], [consignes, 'Consignes']].forEach(function (pair) {
      pair[0].items.forEach(function (i) {
        i.manquants.forEach(function (o) { manquantes.push(pair[1] + ' — ' + i.label + ' (observateur ' + o + ')'); });
        i.invalides.forEach(function (o) { invalides.push(pair[1] + ' — ' + i.label + ' (observateur ' + o + ')'); });
      });
    });

    var complet = manquantes.length === 0 && nonDisponibles.length === 0 && invalides.length === 0;
    var avertissements = [];
    if (paramErrors.length) avertissements.push('Paramètres invalides : le score n’est pas fiable tant qu’ils ne sont pas corrigés.');
    if (manquantes.length) avertissements.push('Évaluation incomplète : ' + manquantes.length + ' donnée(s) manquante(s), comptée(s) zéro point.');
    if (nonDisponibles.length) avertissements.push('Donnée(s) marquée(s) non disponible(s) : score non pleinement comparable aux autres évaluations.');
    if (invalides.length) avertissements.push(invalides.length + ' saisie(s) invalide(s), ignorée(s) dans le calcul.');
    if (sessions.type === 'invalide') avertissements.push(sessions.error);

    return {
      poste: evaluation.poste,
      fc: fc, perf: perf, consignes: consignes,
      total: total,
      etoiles: etoiles,
      mention: MENTIONS[etoiles],
      sessions: sessions,
      complet: complet,
      manquantes: manquantes,
      nonDisponibles: nonDisponibles,
      invalides: invalides,
      avertissements: avertissements,
      parametresValides: paramErrors.length === 0,
      erreursParametres: paramErrors
    };
  }

  /** Libellé du statut lié au nombre de sessions. */
  function statusLabel(result) {
    var s = result.sessions;
    if (s.type === 'provisoire') return 'Statut provisoire — ' + s.sessions + ' / ' + s.minimum + ' session(s) observée(s)';
    if (s.type === 'atteint') return 'Statut confirmé sur ' + s.sessions + ' session(s) observée(s)';
    if (s.type === 'non-renseigne') {
      return result.etoiles === 3
        ? 'Niveau calculé sur cette évaluation — confirmation non vérifiée (sessions non renseignées)'
        : 'Niveau calculé sur cette évaluation';
    }
    if (s.type === 'invalide') return 'Nombre de sessions invalide';
    return 'Niveau calculé sur cette évaluation';
  }

  /* ------------------------------------------------------------------ */
  /* Formatage                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Score affiché avec une décimale, tronqué (et non arrondi) pour rester
   * cohérent avec les étoiles : 49,99 s'affiche 49,9 et vaut 1 étoile.
   */
  function truncate1(x) {
    if (!isNum(x)) return NaN;
    return Math.floor(clean(x) * 10 + 1e-7) / 10;
  }

  function formatScore(x) {
    var t = truncate1(x);
    return isNum(t) ? t.toFixed(1).replace('.', ',') : '—';
  }

  function formatNumber(x, maxDecimals) {
    if (!isNum(x)) return '—';
    var d = maxDecimals == null ? 2 : maxDecimals;
    var s = String(Math.round(x * Math.pow(10, d)) / Math.pow(10, d));
    return s.replace('.', ',');
  }

  function formatNote(n) {
    return n === null || n === undefined ? '—' : formatNumber(n, 1);
  }

  /* ------------------------------------------------------------------ */
  /* Import / export des paramètres                                       */
  /* ------------------------------------------------------------------ */

  function exportSettingsObject(settings, now) {
    return {
      format: SETTINGS_FORMAT,
      version: FORMAT_VERSION,
      exporteLe: (now || new Date()).toISOString(),
      parametres: cloneSettings(settings)
    };
  }

  function isPlainObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
  }

  function checkKeys(obj, required, optional, path, errors) {
    if (!isPlainObject(obj)) { errors.push(path + ' : objet attendu.'); return false; }
    var allowed = required.concat(optional || []);
    var ok = true;
    Object.keys(obj).forEach(function (k) {
      if (allowed.indexOf(k) < 0) { errors.push(path + ' : clé inconnue « ' + k + ' » refusée.'); ok = false; }
    });
    required.forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) { errors.push(path + ' : clé obligatoire « ' + k + ' » absente.'); ok = false; }
    });
    return ok;
  }

  function readNumbers(obj, keys, path, errors) {
    var out = {};
    keys.forEach(function (k) {
      var v = obj[k];
      if (!isNum(v)) errors.push(path + '.' + k + ' : valeur numérique attendue.');
      out[k] = v;
    });
    return out;
  }

  var MAX_IMPORT_LENGTH = 100000;

  /**
   * Analyse stricte d'un fichier de paramètres. Le contenu n'est jamais exécuté :
   * JSON.parse puis reconstruction d'un nouvel objet à partir des seules clés connues.
   */
  function parseSettingsFile(text) {
    var errors = [];
    if (typeof text !== 'string') return { ok: false, errors: ['Fichier illisible.'] };
    if (text.length > MAX_IMPORT_LENGTH) return { ok: false, errors: ['Fichier trop volumineux pour un fichier de paramètres.'] };
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, errors: ['Le fichier n’est pas un JSON valide.'] };
    }
    if (!checkKeys(data, ['format', 'version', 'parametres'], ['exporteLe'], 'fichier', errors)) return { ok: false, errors: errors };
    if (data.format !== SETTINGS_FORMAT) return { ok: false, errors: ['Ce fichier n’est pas un fichier de paramètres BABI A.C Player Rating.'] };
    if (data.version !== FORMAT_VERSION) return { ok: false, errors: ['Version de fichier non prise en charge (' + String(data.version) + ').'] };
    if (data.exporteLe !== undefined && typeof data.exporteLe !== 'string') errors.push('fichier.exporteLe : texte attendu.');

    var p = data.parametres;
    var root = ['etoiles', 'sessions', 'normalisation', 'seuils', 'coefficients', 'poidsPerformance', 'poidsConsignes'];
    if (!checkKeys(p, root, [], 'parametres', errors)) return { ok: false, errors: errors };

    var out = {};
    var statKeys = FC_STATS.map(function (s) { return s.key; });

    if (checkKeys(p.etoiles, ['deux', 'trois'], [], 'etoiles', errors)) out.etoiles = readNumbers(p.etoiles, ['deux', 'trois'], 'etoiles', errors);
    if (checkKeys(p.sessions, ['actif', 'minimum'], [], 'sessions', errors)) {
      if (typeof p.sessions.actif !== 'boolean') errors.push('sessions.actif : vrai/faux attendu.');
      out.sessions = { actif: p.sessions.actif, minimum: readNumbers(p.sessions, ['minimum'], 'sessions', errors).minimum };
    }
    if (checkKeys(p.normalisation, ['statsPositives', 'ballonsPerdus', 'zoneExcellence'], [], 'normalisation', errors)) {
      if (typeof p.normalisation.statsPositives !== 'string' || typeof p.normalisation.ballonsPerdus !== 'string') {
        errors.push('normalisation : règles textuelles attendues.');
      }
      out.normalisation = {
        statsPositives: p.normalisation.statsPositives,
        ballonsPerdus: p.normalisation.ballonsPerdus,
        zoneExcellence: readNumbers(p.normalisation, ['zoneExcellence'], 'normalisation', errors).zoneExcellence
      };
    }
    ['seuils', 'coefficients'].forEach(function (section) {
      if (!checkKeys(p[section], POSITIONS, [], section, errors)) return;
      out[section] = {};
      POSITIONS.forEach(function (pos) {
        if (checkKeys(p[section][pos], statKeys, [], section + '.' + pos, errors)) {
          out[section][pos] = readNumbers(p[section][pos], statKeys, section + '.' + pos, errors);
        }
      });
    });
    var perfKeys = PERF_CRITERIA.map(function (c) { return c.key; });
    var consKeys = CONSIGNES_CRITERIA.map(function (c) { return c.key; });
    if (checkKeys(p.poidsPerformance, perfKeys, [], 'poidsPerformance', errors)) out.poidsPerformance = readNumbers(p.poidsPerformance, perfKeys, 'poidsPerformance', errors);
    if (checkKeys(p.poidsConsignes, consKeys, [], 'poidsConsignes', errors)) out.poidsConsignes = readNumbers(p.poidsConsignes, consKeys, 'poidsConsignes', errors);

    if (errors.length) return { ok: false, errors: errors };
    var semantic = validateSettings(out);
    if (semantic.length) return { ok: false, errors: semantic.map(function (e) { return e.message; }) };
    return { ok: true, settings: out, errors: [] };
  }

  /* ------------------------------------------------------------------ */
  /* Export d'une évaluation                                              */
  /* ------------------------------------------------------------------ */

  function round2(x) { return isNum(x) ? Math.round(x * 100) / 100 : null; }

  function exportEvaluationObject(evaluation, settings, result, now) {
    return {
      format: EVALUATION_FORMAT,
      version: FORMAT_VERSION,
      avertissement: 'Ce fichier contient des informations sur un joueur. Conservez-le de façon responsable et ne le partagez qu’avec le staff concerné.',
      exporteLe: (now || new Date()).toISOString(),
      joueur: evaluation.joueur,
      poste: evaluation.poste,
      posteLibelle: POSITION_LABELS[evaluation.poste],
      dateEvaluation: evaluation.date || null,
      sessionsObservees: result.sessions.sessions != null ? result.sessions.sessions : null,
      resultat: {
        scoreTotal: truncate1(result.total),
        etoiles: result.etoiles,
        mention: result.mention,
        statut: statusLabel(result),
        scoreEaFc: { points: round2(result.fc.score), max: BLOCK_MAX.fc },
        scorePerformances: { points: round2(result.perf.score), max: BLOCK_MAX.perf },
        scoreConsignes: { points: round2(result.consignes.score), max: BLOCK_MAX.consignes },
        evaluationComplete: result.complet,
        parametresValides: result.parametresValides,
        avertissements: result.avertissements.slice(),
        donneesManquantes: result.manquantes.slice(),
        donneesNonDisponibles: result.nonDisponibles.slice(),
        saisiesInvalides: result.invalides.slice()
      },
      detail: {
        eaFc: result.fc.items.map(function (i) {
          return {
            donnee: i.label, statut: i.status, valeur: i.value, coefficient: i.coefficient,
            seuilReference: i.threshold, noteNormalisee: round2(i.normalized), points: round2(i.points)
          };
        }),
        performances: result.perf.items.map(observedDetail),
        consignes: result.consignes.items.map(observedDetail)
      },
      parametresUtilises: cloneSettings(settings)
    };
  }

  function observedDetail(i) {
    return {
      critere: i.label, poidsMax: i.weight, observateurA: i.a, observateurB: i.b,
      moyenne: i.moyenne, points: round2(i.points)
    };
  }

  /* ------------------------------------------------------------------ */

  var API = {
    POSITIONS: POSITIONS,
    POSITION_LABELS: POSITION_LABELS,
    FC_STATS: FC_STATS,
    PERF_CRITERIA: PERF_CRITERIA,
    CONSIGNES_CRITERIA: CONSIGNES_CRITERIA,
    BLOCK_MAX: BLOCK_MAX,
    NOTE_MAX: NOTE_MAX,
    NOTE_STEP: NOTE_STEP,
    MENTIONS: MENTIONS,
    SETTINGS_FORMAT: SETTINGS_FORMAT,
    EVALUATION_FORMAT: EVALUATION_FORMAT,
    defaultSettings: defaultSettings,
    cloneSettings: cloneSettings,
    emptyEvaluation: emptyEvaluation,
    parseNumber: parseNumber,
    normalizeStat: normalizeStat,
    validateSettings: validateSettings,
    coefficientTotal: coefficientTotal,
    weightTotal: weightTotal,
    compute: compute,
    starsFor: starsFor,
    statusLabel: statusLabel,
    truncate1: truncate1,
    formatScore: formatScore,
    formatNumber: formatNumber,
    formatNote: formatNote,
    exportSettingsObject: exportSettingsObject,
    parseSettingsFile: parseSettingsFile,
    exportEvaluationObject: exportEvaluationObject
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.BabiScoring = API;
})(typeof window !== 'undefined' ? window : this);
