'use strict';
// Tests du moteur de calcul : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/scoring.js');

const EPS = 1e-9;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} attendu ${b}, obtenu ${a}`);

function fullEvaluation(poste, settings, note) {
  const ev = S.emptyEvaluation(poste);
  const seuils = settings.seuils[poste];
  S.FC_STATS.forEach((st) => {
    ev.fc[st.key].raw = st.higherIsBetter ? String(seuils[st.key]) : '0';
  });
  Object.keys(ev.perf).forEach((k) => { ev.perf[k] = { a: note, b: note }; });
  Object.keys(ev.consignes).forEach((k) => { ev.consignes[k] = { a: note, b: note }; });
  return ev;
}

test('les paramètres initiaux sont valides et conformes au cahier des charges', () => {
  const s = S.defaultSettings();
  assert.deepEqual(S.validateSettings(s), []);
  assert.deepEqual(s.etoiles, { deux: 50, trois: 75 });
  const expected = {
    GK: [60, 2, 3, 0, 10, 25], DC: [30, 3, 3, 0, 25, 39], DD: [25, 5, 15, 2, 20, 33], DG: [25, 5, 15, 2, 20, 33],
    MDC: [25, 3, 10, 2, 30, 30], MC: [25, 8, 20, 5, 17, 25], MOC: [20, 15, 25, 20, 5, 15],
    AD: [20, 25, 15, 25, 3, 12], AG: [20, 25, 15, 25, 3, 12], BU: [20, 30, 10, 30, 2, 8]
  };
  S.POSITIONS.forEach((p) => {
    assert.deepEqual(S.FC_STATS.map((st) => s.coefficients[p][st.key]), expected[p], p);
    assert.equal(S.coefficientTotal(s, p), 100, p);
  });
  assert.equal(S.weightTotal(s.poidsPerformance, S.PERF_CRITERIA), 50);
  assert.equal(S.weightTotal(s.poidsConsignes, S.CONSIGNES_CRITERIA), 20);
  assert.deepEqual(s.poidsConsignes, { role: 8, discipline: 5, reaction: 4, communication: 3 });
});

test('defaultSettings renvoie une copie neuve à chaque appel (rétablissement fiable)', () => {
  const a = S.defaultSettings();
  a.coefficients.MC.buts = 99;
  a.etoiles.deux = 10;
  const b = S.defaultSettings();
  assert.equal(b.coefficients.MC.buts, 8);
  assert.equal(b.etoiles.deux, 50);
});

test('normalisation : statistiques favorables (linéaire plafonnée)', () => {
  const r = { statsPositives: 'lineaire', ballonsPerdus: 'lineaire', zoneExcellence: 25 };
  assert.equal(S.normalizeStat(0.4, 0.4, true, r), 100); // valeur = seuil -> 100
  close(S.normalizeStat(0.2, 0.4, true, r), 50);
  assert.equal(S.normalizeStat(5, 0.4, true, r), 100); // plafonné
  assert.equal(S.normalizeStat(0, 0.4, true, r), 0);
});

test('normalisation : ballons perdus (formule de base et variantes)', () => {
  const lin = { statsPositives: 'lineaire', ballonsPerdus: 'lineaire', zoneExcellence: 25 };
  assert.equal(S.normalizeStat(14, 14, false, lin), 0); // valeur = seuil -> 0
  assert.equal(S.normalizeStat(0, 14, false, lin), 100); // jamais plus de 100
  close(S.normalizeStat(7, 14, false, lin), 50);
  assert.equal(S.normalizeStat(30, 14, false, lin), 0); // jamais négatif

  const zone = { statsPositives: 'lineaire', ballonsPerdus: 'zone', zoneExcellence: 25 };
  assert.equal(S.normalizeStat(2, 16, false, zone), 100); // sous 25 % du seuil
  assert.equal(S.normalizeStat(4, 16, false, zone), 100);
  close(S.normalizeStat(10, 16, false, zone), 50);
  assert.equal(S.normalizeStat(16, 16, false, zone), 0);
  // Monotone décroissante et bornée
  let prev = 101;
  for (let v = 0; v <= 20; v += 0.25) {
    const n = S.normalizeStat(v, 16, false, zone);
    assert.ok(n <= prev && n >= 0 && n <= 100);
    prev = n;
  }

  const racine = { statsPositives: 'racine', ballonsPerdus: 'lineaire', zoneExcellence: 0 };
  close(S.normalizeStat(0.25, 1, true, racine), 50);
  assert.equal(S.normalizeStat(4, 1, true, racine), 100);
});

test('normalisation : aucun division par zéro, seuils invalides refusés', () => {
  const r = S.defaultSettings().normalisation;
  assert.ok(Number.isNaN(S.normalizeStat(1, 0, true, r)));
  assert.ok(Number.isNaN(S.normalizeStat(1, 0, false, r)));
  assert.ok(Number.isNaN(S.normalizeStat(1, -2, true, r)));
  assert.ok(Number.isNaN(S.normalizeStat(-1, 2, true, r)));

  const s = S.defaultSettings();
  s.seuils.MC.buts = 0;
  const ev = S.emptyEvaluation('MC');
  ev.fc.buts.raw = '1';
  const res = S.compute(ev, s);
  const item = res.fc.items.find((i) => i.key === 'buts');
  assert.equal(item.status, 'seuil-invalide');
  assert.equal(item.points, 0);
  assert.equal(res.parametresValides, false);
  assert.ok(Number.isFinite(res.total));
});

test('analyse des saisies : vide ≠ zéro, négatifs et texte refusés', () => {
  assert.deepEqual(S.parseNumber(''), { status: 'vide', value: null });
  assert.deepEqual(S.parseNumber('   '), { status: 'vide', value: null });
  assert.equal(S.parseNumber('0').value, 0);
  assert.equal(S.parseNumber('0').status, 'ok');
  assert.equal(S.parseNumber('1,5').value, 1.5);
  assert.equal(S.parseNumber('0.45').value, 0.45);
  assert.equal(S.parseNumber(',5').value, 0.5);
  ['-1', '-0,5', 'abc', '1e3', '1,2,3', '12abc', 'NaN', 'Infinity'].forEach((v) => {
    assert.equal(S.parseNumber(v).status, 'invalide', v);
  });
  assert.equal(S.parseNumber('101', 100).status, 'invalide');
  assert.equal(S.parseNumber('100', 100).status, 'ok');
});

test('bloc FC : maximum 30 points pour chaque poste, même avec des valeurs extrêmes', () => {
  const s = S.defaultSettings();
  S.POSITIONS.forEach((p) => {
    const ev = fullEvaluation(p, s, null);
    let r = S.compute(ev, s);
    close(r.fc.score, 30, p);
    // Valeurs énormes : toujours plafonné à 30
    S.FC_STATS.forEach((st) => { if (st.higherIsBetter) ev.fc[st.key].raw = st.key === 'archetype' ? '100' : '50'; });
    r = S.compute(ev, s);
    assert.ok(r.fc.score <= 30 + EPS, p);
  });
});

test('bloc FC : chacun des six coefficients est appliqué au bon poste', () => {
  const s = S.defaultSettings();
  S.POSITIONS.forEach((p) => {
    S.FC_STATS.forEach((st) => {
      const ev = S.emptyEvaluation(p);
      S.FC_STATS.forEach((o) => { ev.fc[o.key].nd = true; });
      ev.fc[st.key] = { raw: st.higherIsBetter ? String(s.seuils[p][st.key]) : '0', nd: false };
      const r = S.compute(ev, s);
      close(r.fc.score, s.coefficients[p][st.key] * 30 / 100, `${p}/${st.key}`);
    });
  });
});

test('bloc FC : exemple chiffré complet (MC)', () => {
  const s = S.defaultSettings();
  const ev = S.emptyEvaluation('MC');
  // seuils MC : archétype 100, buts 0,4, passes 0,5, B+PD 0,8, interceptions 3, ballons perdus 14
  Object.assign(ev.fc.archetype, { raw: '80' }); // 80
  Object.assign(ev.fc.buts, { raw: '0,2' }); // 50
  Object.assign(ev.fc.passes, { raw: '0,5' }); // 100
  Object.assign(ev.fc.contributions, { raw: '0,7' }); // 87,5
  Object.assign(ev.fc.interceptions, { raw: '1,5' }); // 50
  Object.assign(ev.fc.ballonsPerdus, { raw: '7' }); // 50
  const expected = (80 * 25 + 50 * 8 + 100 * 20 + 87.5 * 5 + 50 * 17 + 50 * 25) / 100 * 30 / 100;
  const r = S.compute(ev, s);
  close(r.fc.score, expected);
  close(expected, 20.8125);
});

test('données manquantes signalées et distinctes d’une vraie valeur nulle', () => {
  const s = S.defaultSettings();
  const ev = fullEvaluation('MC', s, 3);
  ev.fc.archetype.raw = '';
  let r = S.compute(ev, s);
  assert.equal(r.complet, false);
  assert.ok(r.manquantes.some((m) => m.includes("Niveau de l'archétype")));
  assert.ok(r.avertissements.some((a) => a.startsWith('Évaluation incomplète')));
  assert.equal(r.fc.items[0].status, 'vide');
  assert.equal(r.fc.items[0].points, 0);

  ev.fc.archetype.raw = '0';
  r = S.compute(ev, s);
  assert.equal(r.complet, true);
  assert.equal(r.fc.items[0].status, 'ok');
  assert.equal(r.manquantes.length, 0);

  // Donnée non utilisée par le poste (coefficient 0) : pas d’incomplétude
  const gk = fullEvaluation('GK', s, 3);
  gk.fc.contributions.raw = '';
  assert.equal(S.compute(gk, s).complet, true);
});

test('donnée marquée « non disponible » : 0 point et avertissement de comparabilité', () => {
  const s = S.defaultSettings();
  const ev = fullEvaluation('BU', s, 4);
  ev.fc.interceptions.nd = true;
  const r = S.compute(ev, s);
  assert.equal(r.complet, false);
  assert.equal(r.nonDisponibles.length, 1);
  assert.ok(r.avertissements.some((a) => a.includes('non pleinement comparable')));
  close(r.fc.score, 30 - 2 * 0.3);
});

test('saisies invalides : ignorées, signalées, jamais de NaN dans le score', () => {
  const s = S.defaultSettings();
  const ev = fullEvaluation('DC', s, 3);
  ev.fc.buts.raw = '-2';
  ev.fc.passes.raw = 'abc';
  ev.fc.archetype.raw = '150';
  const r = S.compute(ev, s);
  assert.equal(r.invalides.length, 3);
  assert.ok(Number.isFinite(r.total));
  assert.equal(r.complet, false);
});

test('bloc B : deux observateurs indépendants, moyenne automatique, max 50', () => {
  const s = S.defaultSettings();
  const ev = S.emptyEvaluation('MOC');
  ev.perf.technique = { a: 5, b: 3 }; // moyenne 4 -> 8 pts
  ev.perf.placement = { a: 2.5, b: 3.5 }; // 3 -> 6
  ev.perf.decisions = { a: 0, b: 5 }; // 2,5 -> 5
  ev.perf.collectif = { a: 4, b: 4 }; // 4 -> 8
  ev.perf.transitions = { a: 1, b: 1.5 }; // 1,25 -> 2,5
  const r = S.compute(ev, s);
  close(r.perf.score, 8 + 6 + 5 + 8 + 2.5);
  assert.equal(r.perf.items[0].moyenne, 4);
  assert.equal(r.perf.items[0].a, 5);
  assert.equal(r.perf.items[0].b, 3);

  const max = fullEvaluation('MOC', s, 5);
  close(S.compute(max, s).perf.score, 50);
  // Poids modifiés mais valides : toujours 50 max
  s.poidsPerformance = { technique: 20, placement: 15, decisions: 5, collectif: 5, transitions: 5 };
  assert.deepEqual(S.validateSettings(s), []);
  close(S.compute(max, s).perf.score, 50);
});

test('bloc B : une note manquante ne vaut pas la note de l’autre observateur', () => {
  const s = S.defaultSettings();
  const ev = S.emptyEvaluation('MC');
  ev.perf.technique = { a: 4, b: null };
  const r = S.compute(ev, s);
  const it = r.perf.items[0];
  assert.equal(it.moyenne, null);
  assert.deepEqual(it.manquants, ['B']);
  close(it.points, 4); // (4 + 0) / 2 / 5 × 10 : la moitié manquante ne rapporte rien
  assert.equal(r.complet, false);
  assert.ok(r.manquantes.some((m) => m.includes('observateur B')));
});

test('bloc B : notes hors échelle refusées (pas de 5,5 ni de 3,3)', () => {
  const s = S.defaultSettings();
  const ev = S.emptyEvaluation('MC');
  ev.perf.technique = { a: 5.5, b: 3.3 };
  const r = S.compute(ev, s);
  assert.equal(r.perf.items[0].points, 0);
  assert.equal(r.invalides.length, 2);
});

test('bloc C : max 20 points, poids 8/5/4/3', () => {
  const s = S.defaultSettings();
  const ev = S.emptyEvaluation('DD');
  ev.consignes.role = { a: 5, b: 5 };
  let r = S.compute(ev, s);
  close(r.consignes.score, 8);
  ev.consignes.discipline = { a: 5, b: 4 }; // 4,5 -> 4,5
  ev.consignes.reaction = { a: 2, b: 3 }; // 2,5 -> 2
  ev.consignes.communication = { a: 5, b: 5 }; // 3
  r = S.compute(ev, s);
  close(r.consignes.score, 8 + 4.5 + 2 + 3);
  close(S.compute(fullEvaluation('DD', s, 5), s).consignes.score, 20);
});

test('total toujours entre 0 et 100, même avec des paramètres incohérents', () => {
  const s = S.defaultSettings();
  assert.equal(S.compute(S.emptyEvaluation('BU'), s).total, 0);
  S.POSITIONS.forEach((p) => close(S.compute(fullEvaluation(p, s, 5), s).total, 100, p));

  const bad = S.defaultSettings();
  bad.coefficients.BU.buts = 300; // total 370 %
  bad.poidsPerformance.technique = 40; // total 80
  bad.poidsConsignes.role = 20; // total 32
  const r = S.compute(fullEvaluation('BU', bad, 5), bad);
  assert.equal(r.parametresValides, false);
  assert.ok(r.fc.score <= 30 && r.perf.score <= 50 && r.consignes.score <= 20);
  assert.ok(r.total <= 100 && r.total >= 0);
});

test('étoiles : seuils 49,99 / 50 / 74,99 / 75', () => {
  const e = { deux: 50, trois: 75 };
  assert.equal(S.starsFor(0, e), 1);
  assert.equal(S.starsFor(49.99, e), 1);
  assert.equal(S.starsFor(50, e), 2);
  assert.equal(S.starsFor(74.99, e), 2);
  assert.equal(S.starsFor(75, e), 3);
  assert.equal(S.starsFor(100, e), 3);
  // Bruit flottant : 74.99999999999 est bien 75
  assert.equal(S.starsFor(74.999999999, e), 3);
  // Affichage cohérent : tronqué, jamais arrondi au-dessus d’un seuil
  assert.equal(S.formatScore(49.99), '49,9');
  assert.equal(S.formatScore(50), '50,0');
  assert.equal(S.formatScore(74.99), '74,9');
  assert.equal(S.formatScore(75), '75,0');
  assert.equal(S.formatScore(68.45), '68,4');
  assert.equal(S.MENTIONS[1], 'Niveau en développement');
  assert.equal(S.MENTIONS[2], 'Joueur compétent');
  assert.equal(S.MENTIONS[3], 'Joueur confirmé');
});

test('étoiles : calcul complet atteignant exactement 75 et 50', () => {
  const s = S.defaultSettings();
  const ev = fullEvaluation('MC', s, null);
  ['technique', 'placement', 'decisions', 'collectif', 'transitions'].forEach((k) => { ev.perf[k] = { a: 4.5, b: 4.5 }; });
  Object.keys(ev.consignes).forEach((k) => { ev.consignes[k] = { a: 0, b: 0 }; });
  let r = S.compute(ev, s);
  assert.equal(r.total, 75);
  assert.equal(r.etoiles, 3);
  ['technique', 'placement', 'decisions', 'collectif', 'transitions'].forEach((k) => { ev.perf[k] = { a: 2, b: 2 }; });
  r = S.compute(ev, s); // 30 + 20 = 50
  assert.equal(r.total, 50);
  assert.equal(r.etoiles, 2);
  ev.perf.transitions = { a: 2, b: 1.5 }; // -0,5
  r = S.compute(ev, s);
  close(r.total, 49.5);
  assert.equal(r.etoiles, 1);
});

test('seuils d’étoiles modifiables et validation de l’ordre', () => {
  const s = S.defaultSettings();
  s.etoiles = { deux: 60, trois: 80 };
  assert.deepEqual(S.validateSettings(s), []);
  assert.equal(S.starsFor(59.99, s.etoiles), 1);
  assert.equal(S.starsFor(60, s.etoiles), 2);
  assert.equal(S.starsFor(80, s.etoiles), 3);
  s.etoiles = { deux: 70, trois: 70 }; // égalité autorisée
  assert.deepEqual(S.validateSettings(s), []);
  s.etoiles = { deux: 80, trois: 60 };
  assert.ok(S.validateSettings(s).some((e) => e.section === 'etoiles'));
  s.etoiles = { deux: NaN, trois: 60 };
  assert.ok(S.validateSettings(s).some((e) => e.section === 'etoiles'));
});

test('validation des totaux : coefficients 100 %, performances 50, consignes 20', () => {
  const s = S.defaultSettings();
  s.coefficients.MC.buts = 7; // 99 %
  let errs = S.validateSettings(s);
  assert.ok(errs.some((e) => e.section === 'coefficients' && e.poste === 'MC' && e.message.includes('99')));
  s.coefficients.MC.buts = 8;
  s.poidsPerformance.technique = 9;
  errs = S.validateSettings(s);
  assert.ok(errs.some((e) => e.section === 'poidsPerformance'));
  s.poidsPerformance.technique = 10;
  s.poidsConsignes.role = 9;
  errs = S.validateSettings(s);
  assert.ok(errs.some((e) => e.section === 'poidsConsignes'));
  s.poidsConsignes.role = 8;
  s.coefficients.DC = { archetype: 33.33, buts: 33.33, passes: 33.34, contributions: 0, interceptions: 0, ballonsPerdus: 0 };
  assert.deepEqual(S.validateSettings(s), []);
});

test('statut de sessions : provisoire tant que le minimum n’est pas atteint', () => {
  const s = S.defaultSettings();
  const ev = fullEvaluation('AG', s, 5);
  let r = S.compute(ev, s);
  assert.equal(r.etoiles, 3);
  assert.equal(r.sessions.type, 'non-renseigne');
  assert.match(S.statusLabel(r), /confirmation non vérifiée/);
  ev.sessions = '1';
  r = S.compute(ev, s);
  assert.equal(r.sessions.type, 'provisoire');
  assert.match(S.statusLabel(r), /provisoire — 1 \/ 3/);
  ev.sessions = '3';
  r = S.compute(ev, s);
  assert.equal(r.sessions.type, 'atteint');
  ev.sessions = '2,5';
  r = S.compute(ev, s);
  assert.equal(r.sessions.type, 'invalide');
  s.sessions.actif = false;
  ev.sessions = '1';
  assert.equal(S.compute(ev, s).sessions.type, 'desactive');
});

test('export / import des paramètres : aller-retour fidèle', () => {
  const s = S.defaultSettings();
  s.etoiles.deux = 55;
  s.seuils.BU.buts = 1.2;
  s.normalisation.ballonsPerdus = 'zone';
  const text = JSON.stringify(S.exportSettingsObject(s));
  const parsed = S.parseSettingsFile(text);
  assert.equal(parsed.ok, true, parsed.errors.join('\n'));
  assert.deepEqual(parsed.settings, s);
  // Le fichier exporté ne contient aucune évaluation
  const obj = JSON.parse(text);
  assert.deepEqual(Object.keys(obj).sort(), ['exporteLe', 'format', 'parametres', 'version']);
  assert.ok(!/joueur|perf"|consignes"/.test(JSON.stringify(obj.parametres)));
});

test('import des paramètres : rejet strict des fichiers invalides', () => {
  const good = S.exportSettingsObject(S.defaultSettings());
  const mutate = (fn) => { const o = JSON.parse(JSON.stringify(good)); fn(o); return JSON.stringify(o); };
  const cases = {
    'JSON invalide': '{ pas du json',
    'tableau': '[]',
    'null': 'null',
    'mauvais format': mutate((o) => { o.format = 'autre'; }),
    'version inconnue': mutate((o) => { o.version = 2; }),
    'clé inconnue racine': mutate((o) => { o.script = 'alert(1)'; }),
    'clé inconnue paramètres': mutate((o) => { o.parametres.extra = 1; }),
    '__proto__': JSON.stringify(good).replace('"parametres":{', '"parametres":{"__proto__":{"x":1},'),
    'constructor': mutate((o) => { o.parametres.etoiles.constructor = 1; }),
    'poste inconnu': mutate((o) => { o.parametres.coefficients.XX = o.parametres.coefficients.MC; }),
    'clé manquante': mutate((o) => { delete o.parametres.poidsConsignes; }),
    'valeur texte': mutate((o) => { o.parametres.etoiles.deux = '50'; }),
    'valeur null': mutate((o) => { o.parametres.seuils.MC.buts = null; }),
    'coefficients incohérents': mutate((o) => { o.parametres.coefficients.MC.buts = 30; }),
    'coefficient négatif': mutate((o) => { o.parametres.coefficients.MC.buts = -2; o.parametres.coefficients.MC.passes = 30; }),
    'seuil nul': mutate((o) => { o.parametres.seuils.GK.buts = 0; }),
    'poids incohérents': mutate((o) => { o.parametres.poidsPerformance.technique = 12; }),
    'consignes > 20': mutate((o) => { o.parametres.poidsConsignes.role = 9; }),
    'étoiles inversées': mutate((o) => { o.parametres.etoiles = { deux: 80, trois: 60 }; }),
    'règle inconnue': mutate((o) => { o.parametres.normalisation.ballonsPerdus = 'eval'; }),
    'booléen invalide': mutate((o) => { o.parametres.sessions.actif = 'oui'; }),
    'sessions non entier': mutate((o) => { o.parametres.sessions.minimum = 2.5; }),
    'trop volumineux': ' '.repeat(100001)
  };
  Object.entries(cases).forEach(([name, text]) => {
    const r = S.parseSettingsFile(text);
    assert.equal(r.ok, false, `devait être refusé : ${name}`);
    assert.ok(r.errors.length > 0, name);
  });
  assert.equal(S.parseSettingsFile(undefined).ok, false);
});

test('export JSON d’une évaluation : contenu complet et avertissement', () => {
  const s = S.defaultSettings();
  const ev = fullEvaluation('AD', s, 4);
  ev.joueur = 'BABI_Test';
  ev.fc.passes.raw = '';
  const r = S.compute(ev, s);
  const out = S.exportEvaluationObject(ev, s, r, new Date('2026-10-22T10:00:00Z'));
  assert.equal(out.format, S.EVALUATION_FORMAT);
  assert.equal(out.joueur, 'BABI_Test');
  assert.equal(out.poste, 'AD');
  assert.match(out.avertissement, /responsable/);
  assert.equal(out.resultat.evaluationComplete, false);
  assert.ok(out.resultat.donneesManquantes.length === 1);
  assert.equal(out.detail.eaFc.length, 6);
  assert.equal(out.detail.performances.length, 5);
  assert.equal(out.detail.consignes.length, 4);
  assert.equal(out.exporteLe, '2026-10-22T10:00:00.000Z');
  assert.doesNotThrow(() => JSON.stringify(out));
});

test('le changement de poste conserve les saisies et recalcule', () => {
  const s = S.defaultSettings();
  const ev = fullEvaluation('MC', s, 3);
  ev.fc.buts.raw = '0,4';
  const mc = S.compute(ev, s);
  ev.poste = 'BU';
  const bu = S.compute(ev, s);
  assert.equal(ev.fc.buts.raw, '0,4');
  assert.notEqual(mc.fc.score, bu.fc.score);
  assert.equal(mc.perf.score, bu.perf.score);
});
