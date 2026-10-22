'use strict';
// Vérifications statiques : confidentialité, chemins relatifs (sous-chemin GitHub Pages), fichiers PWA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const PAGE_FILES = ['index.html', 'css/styles.css', 'js/app.js', 'js/scoring.js', 'js/content.js'];

test('aucun stockage persistant ni envoi réseau dans le code de la page', () => {
  const forbidden = [
    /localStorage/, /sessionStorage/, /indexedDB/i, /document\.cookie/, /\bfetch\s*\(/, /XMLHttpRequest/,
    /sendBeacon/, /WebSocket/, /EventSource/, /\beval\s*\(/, /new Function\s*\(/, /caches\./, /openDatabase/
  ];
  PAGE_FILES.forEach((f) => {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
    forbidden.forEach((re) => assert.ok(!re.test(src), `${f} contient ${re}`));
  });
});

test('aucune ressource externe (polices, scripts, analytics)', () => {
  PAGE_FILES.concat(['manifest.webmanifest', 'sw.js']).forEach((f) => {
    const urls = read(f).match(/https?:\/\/[^\s"')]+/g) || [];
    const external = urls.filter((u) => !u.startsWith('http://www.w3.org/'));
    assert.deepEqual(external, [], `${f} référence ${external.join(', ')}`);
  });
  const html = read('index.html');
  assert.match(html, /connect-src 'none'/);
});

test('chemins relatifs uniquement (compatibles avec un sous-chemin GitHub Pages)', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('#'));
  refs.forEach((u) => {
    assert.ok(!u.startsWith('/'), `chemin absolu interdit : ${u}`);
    assert.ok(fs.existsSync(path.join(ROOT, u)), `fichier manquant : ${u}`);
  });
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.short_name.length <= 12);
  manifest.icons.forEach((i) => {
    assert.ok(!i.src.startsWith('/'));
    assert.ok(fs.existsSync(path.join(ROOT, i.src)), i.src);
  });
  assert.match(read('js/app.js'), /register\('\.\/sw\.js', \{ scope: '\.\/' \}\)/);
});

test('icônes PNG aux bonnes dimensions', () => {
  const dims = (f) => { const b = fs.readFileSync(path.join(ROOT, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepEqual(dims('icons/icon-192.png'), [192, 192]);
  assert.deepEqual(dims('icons/icon-512.png'), [512, 512]);
  assert.deepEqual(dims('icons/icon-maskable-512.png'), [512, 512]);
  assert.deepEqual(dims('icons/apple-touch-icon.png'), [180, 180]);
});

test('le service worker ne met en cache que des fichiers de l’application existants', () => {
  const sw = read('sw.js');
  const list = JSON.parse(sw.match(/var APP_FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  list.filter((f) => f !== './').forEach((f) => assert.ok(fs.existsSync(path.join(ROOT, f)), f));
  // Pas de mise en cache dynamique (cache.put) : rien d'autre que la liste ne peut être stocké.
  assert.ok(!/\.put\s*\(/.test(sw));
  assert.ok(!/localStorage|indexedDB|sessionStorage/.test(sw));
  // Toutes les ressources de la page sont bien pré-cachées (fonctionnement hors ligne).
  PAGE_FILES.forEach((f) => assert.ok(list.includes('./' + f), `${f} absent du cache hors ligne`));
});

test('tous les textes d’interface visibles sont en français (pas de libellés anglais résiduels)', () => {
  const html = read('index.html');
  assert.match(html, /<html lang="fr">/);
  ['Settings', 'Submit', 'Cancel', 'Export', 'Import', 'Reset', 'Score:'].forEach((w) => {
    assert.ok(!new RegExp('>\\s*' + w + '\\b').test(html), `libellé anglais : ${w}`);
  });
});
