/*
 * BABI A.C Player Rating — interface.
 *
 * Confidentialité : tout l'état vit dans les variables ci-dessous (mémoire vive).
 * Aucun localStorage / sessionStorage / IndexedDB / cookie, aucune requête réseau.
 */
(function () {
  'use strict';

  var S = window.BabiScoring;
  var C = window.BabiContent;

  var state = {
    settings: S.defaultSettings(),
    evaluation: S.emptyEvaluation('MC'),
    settingsPoste: 'MC',
    result: null,
    view: 'eval'
  };

  var SHORT_LABELS = {
    GK: 'Gardien', DC: 'Déf. central', DD: 'Déf. droit', DG: 'Déf. gauche', MDC: 'Milieu déf.',
    MC: 'Milieu', MOC: 'Milieu off.', AD: 'Ailier D.', AG: 'Ailier G.', BU: 'Buteur'
  };
  var SCALE_SHORT = { 0: 'Très insuffisant', 1: 'Insuffisant', 2: 'En dessous', 3: 'Correct', 4: 'Très bon', 5: 'Excellent' };
  var STATUS_LABELS = { vide: 'Manquante', nd: 'Non disponible', invalide: 'Invalide', 'seuil-invalide': 'Seuil invalide' };
  var RING_C = 2 * Math.PI * 52;

  var refs = { fc: {}, perf: {}, consignes: {}, blocks: {}, settings: {} };

  /* ------------------------------------------------------------------ */
  /* Outils DOM                                                           */
  /* ------------------------------------------------------------------ */

  function $(id) { return document.getElementById(id); }

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); return; }
    el.append(child instanceof Node ? child : String(child));
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  function starIcon(on) {
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'star' + (on ? ' on' : ''));
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', 'M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z');
    svg.append(p);
    return svg;
  }
  function renderStars(container, n) {
    container.replaceChildren(starIcon(n >= 1), starIcon(n >= 2), starIcon(n >= 3));
  }

  function fmt(x, d) { return S.formatNumber(x, d); }
  function fmtPts(x) { return isFinite(x) ? (Math.round(x * 100) / 100).toFixed(2).replace('.', ',') : '—'; }
  function frDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  function todayFr() { return new Date().toLocaleDateString('fr-FR'); }
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ------------------------------------------------------------------ */
  /* Dialogues et notifications                                           */
  /* ------------------------------------------------------------------ */

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var dlg = $('dlg-confirm');
      var okBtn = $('dlg-confirm-ok');
      var cancelBtn = $('dlg-confirm-cancel');
      $('dlg-confirm-title').textContent = opts.title;
      var body = $('dlg-confirm-text');
      body.replaceChildren();
      [].concat(opts.text || []).forEach(function (t) { body.append(typeof t === 'string' ? h('p', null, t) : t); });
      okBtn.textContent = opts.ok || 'Confirmer';
      okBtn.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-gold');
      cancelBtn.hidden = !!opts.okOnly;
      var answered = false;
      function finish(v) {
        if (answered) return;
        answered = true;
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        dlg.removeEventListener('close', onClose);
        if (dlg.open) dlg.close();
        resolve(v);
      }
      function onOk() { finish(true); }
      function onCancel() { finish(false); }
      function onClose() { finish(false); }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      dlg.addEventListener('close', onClose);
      dlg.showModal();
      (opts.okOnly ? okBtn : cancelBtn).focus();
    });
  }

  var toastTimer = null;
  function toast(message, opts) {
    opts = opts || {};
    var el = $('toast');
    el.replaceChildren(h('span', null, message));
    el.className = 'toast' + (opts.type ? ' toast-' + opts.type : '');
    if (opts.action) {
      el.append(h('button', { type: 'button', class: 'toast-btn', onclick: function () { el.hidden = true; opts.action.fn(); } }, opts.action.label));
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    if (!opts.sticky) toastTimer = setTimeout(function () { el.hidden = true; }, opts.timeout || 3500);
  }

  function downloadJson(obj, filename) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  /* ------------------------------------------------------------------ */
  /* Construction : évaluation                                            */
  /* ------------------------------------------------------------------ */

  function buildPosteGrid(container, onPick, compact) {
    var buttons = {};
    S.POSITIONS.forEach(function (p) {
      var btn = h('button', {
        type: 'button', class: 'poste-chip', role: 'radio', 'aria-checked': 'false', 'data-poste': p,
        title: S.POSITION_LABELS[p], onclick: function () { onPick(p); }
      }, h('span', { class: 'pc-code' }, p), compact ? h('span', { class: 'pc-dot', 'aria-hidden': 'true' }) : h('span', { class: 'pc-label' }, SHORT_LABELS[p]));
      buttons[p] = btn;
      container.append(btn);
    });
    container.addEventListener('keydown', function (e) {
      var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!keys[e.key]) return;
      var idx = S.POSITIONS.indexOf(document.activeElement && document.activeElement.getAttribute('data-poste'));
      if (idx < 0) return;
      e.preventDefault();
      var next = S.POSITIONS[(idx + keys[e.key] + S.POSITIONS.length) % S.POSITIONS.length];
      onPick(next);
      buttons[next].focus();
    });
    return buttons;
  }

  function buildFcList() {
    var list = $('fc-list');
    S.FC_STATS.forEach(function (st) {
      var entry = function () { return state.evaluation.fc[st.key]; };
      var input = h('input', {
        id: 'fc-' + st.key, type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next',
        placeholder: st.key === 'archetype' ? '0 à 100' : 'ex. 0,45', 'aria-describedby': 'fc-msg-' + st.key + ' fc-ref-' + st.key,
        oninput: function (e) { entry().raw = e.target.value; update(); }
      });
      var nd = h('button', {
        type: 'button', class: 'nd-toggle', 'aria-pressed': 'false', title: 'Marquer comme non disponible',
        onclick: function () { entry().nd = !entry().nd; update(); }
      }, 'N/D');
      var auto = null;
      if (st.key === 'contributions') {
        auto = h('button', {
          type: 'button', class: 'link-btn', hidden: true,
          onclick: function () {
            var r = state.result.fc.items;
            var v = r[1].value + r[2].value;
            entry().raw = fmt(v, 2);
            input.value = entry().raw;
            update();
          }
        });
      }
      var bar = h('span');
      var row = h('div', { class: 'stat-row', 'data-key': st.key },
        h('div', { class: 'stat-head' },
          h('div', null,
            h('label', { for: input.id }, st.label),
            h('p', { class: 'stat-ref', id: 'fc-ref-' + st.key })),
          h('span', { class: 'coef', title: 'Coefficient du poste' })),
        h('div', { class: 'stat-line' },
          h('div', { class: 'input-wrap' }, input, h('span', { class: 'unit' }, st.unit)),
          nd),
        auto,
        h('div', { class: 'stat-meta' },
          h('div', { class: 'bar' }, bar),
          h('span', { class: 'norm' }),
          h('span', { class: 'pts' })),
        h('p', { class: 'field-msg', id: 'fc-msg-' + st.key, 'aria-live': 'polite' }));
      list.append(row);
      refs.fc[st.key] = {
        row: row, input: input, nd: nd, auto: auto, bar: bar,
        ref: row.querySelector('.stat-ref'), coef: row.querySelector('.coef'),
        norm: row.querySelector('.norm'), pts: row.querySelector('.pts'), msg: row.querySelector('.field-msg')
      };
    });
  }

  function noteLabel(n) {
    return n % 1 === 0 ? SCALE_SHORT[n] : SCALE_SHORT[n - 0.5] + ' +';
  }

  function buildCriteria(containerId, criteria, group) {
    var container = $(containerId);
    criteria.forEach(function (c) {
      var pickers = {};
      var cells = ['a', 'b'].map(function (o) {
        var id = group + '-' + c.key + '-' + o;
        var sel = h('select', {
          id: id, class: 'np-select', 'aria-label': c.label + ' — Observateur ' + o.toUpperCase(),
          onchange: function (e) {
            state.evaluation[group][c.key][o] = e.target.value === '' ? null : Number(e.target.value);
            update();
          }
        });
        sel.append(h('option', { value: '' }, '— Non noté'));
        for (var n = 0; n <= S.NOTE_MAX; n += S.NOTE_STEP) {
          sel.append(h('option', { value: String(n) }, fmt(n, 1) + (n % 1 === 0 ? ' · ' + SCALE_SHORT[n] : '')));
        }
        var value = h('span', { class: 'np-value' }, '—');
        var label = h('span', { class: 'np-label' }, 'Non noté');
        pickers[o] = { select: sel, value: value, label: label, wrap: null };
        var wrap = h('div', { class: 'note-picker' }, value, label, sel);
        pickers[o].wrap = wrap;
        return h('div', { class: 'obs' }, h('span', { class: 'obs-name' }, 'Observateur ' + o.toUpperCase()), wrap);
      });
      var row = h('div', { class: 'crit', 'data-key': c.key },
        h('div', { class: 'crit-head' },
          h('div', null, h('h3', null, c.label), h('p', { class: 'crit-hint' })),
          h('span', { class: 'crit-max' })),
        h('div', { class: 'obs-grid' }, cells),
        h('div', { class: 'crit-foot' }, h('span', { class: 'crit-avg' }), h('span', { class: 'crit-pts' })),
        h('p', { class: 'crit-gap', hidden: true }));
      container.append(row);
      refs[group][c.key] = {
        row: row, pickers: pickers, hint: row.querySelector('.crit-hint'), max: row.querySelector('.crit-max'),
        avg: row.querySelector('.crit-avg'), pts: row.querySelector('.crit-pts'), gap: row.querySelector('.crit-gap')
      };
    });
  }

  function buildResultBlocks() {
    var c = $('rc-blocks');
    [['fc', 'EA SPORTS FC'], ['perf', 'Performances'], ['consignes', 'Consignes']].forEach(function (b) {
      var bar = h('span');
      var val = h('span', { class: 'rb-val' });
      c.append(h('div', { class: 'rb' }, h('div', { class: 'rb-top' }, h('span', { class: 'rb-name' }, b[1]), val), h('div', { class: 'bar' }, bar)));
      refs.blocks[b[0]] = { bar: bar, val: val };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Rendu : évaluation et résultat                                       */
  /* ------------------------------------------------------------------ */

  function update() {
    state.result = S.compute(state.evaluation, state.settings);
    renderEval();
    renderResult();
    renderSettingsStatus();
  }

  function renderEval() {
    var ev = state.evaluation;
    var r = state.result;
    var settings = state.settings;

    Object.keys(refs.posteEval).forEach(function (p) {
      refs.posteEval[p].setAttribute('aria-checked', String(p === ev.poste));
    });
    $('poste-help').textContent = S.POSITION_LABELS[ev.poste] + ' — les étoiles obtenues valent pour ce poste uniquement.';

    var sess = r.sessions;
    $('sessions-msg').textContent = sess.type === 'invalide' ? sess.error : '';
    $('sessions').classList.toggle('invalid', sess.type === 'invalide');

    // Bloc A
    var rules = settings.normalisation;
    r.fc.items.forEach(function (it) {
      var f = refs.fc[it.key];
      var entry = ev.fc[it.key];
      f.coef.textContent = fmt(it.coefficient, 2) + ' %';
      f.row.classList.toggle('unused', !it.used);
      f.row.classList.toggle('is-missing', it.used && it.status === 'vide');
      f.row.classList.toggle('is-nd', it.status === 'nd');
      f.row.classList.toggle('is-invalid', it.status === 'invalide' || it.status === 'seuil-invalide');
      f.input.disabled = entry.nd;
      f.input.classList.toggle('invalid', it.status === 'invalide');
      f.nd.setAttribute('aria-pressed', String(entry.nd));
      f.nd.textContent = entry.nd ? 'N/D ✓' : 'N/D';

      var t = it.threshold;
      var refText;
      if (!it.used) refText = 'Non utilisée pour ce poste (coefficient 0 %).';
      else if (it.higherIsBetter) refText = '100/100 à partir de ' + fmt(t) + (it.key === 'archetype' ? ' %' : ' par match');
      else if (rules.ballonsPerdus === 'zone') refText = '100/100 jusqu’à ' + fmt(t * rules.zoneExcellence / 100) + ', 0/100 à partir de ' + fmt(t) + ' par match';
      else refText = '0/100 à partir de ' + fmt(t) + ' par match (seuil de référence)';
      f.ref.textContent = refText;

      var pct = it.normalized != null ? it.normalized : 0;
      f.bar.style.width = pct + '%';
      f.norm.textContent = it.normalized != null ? fmt(it.normalized, 0) + '/100' : (STATUS_LABELS[it.status] || '');
      f.norm.className = 'norm' + (it.normalized == null ? ' norm-flag' : '');
      f.pts.textContent = '+' + fmtPts(it.points) + ' pt';
      var msg = it.error || '';
      if (!msg && it.used && it.status === 'vide') msg = 'Donnée manquante : 0 point, évaluation signalée incomplète.';
      if (!msg && it.status === 'nd') msg = 'Marquée non disponible : 0 point, score non pleinement comparable.';
      f.msg.textContent = msg;
      f.msg.className = 'field-msg' + (it.status === 'invalide' || it.status === 'seuil-invalide' ? ' error' : ' warn');
    });
    var auto = refs.fc.contributions.auto;
    var items = r.fc.items;
    var canAuto = ev.fc.contributions.raw.trim() === '' && !ev.fc.contributions.nd && items[1].status === 'ok' && items[2].status === 'ok';
    auto.hidden = !canAuto;
    if (canAuto) auto.textContent = 'Remplir avec buts + passes D. = ' + fmt(items[1].value + items[2].value, 2);
    setPill('pill-fc', r.fc);

    // Blocs B et C
    var tips = C.POSITION_TIPS[ev.poste];
    $('perf-tips').replaceChildren(
      h('p', { class: 'tips-title' }, 'Lecture du poste · ' + ev.poste + ' — ' + S.POSITION_LABELS[ev.poste]),
      h('p', null, tips.focus));
    renderCriteria('perf', r.perf, function (key) { return tips.criteres[key]; });
    renderCriteria('consignes', r.consignes, function (key) { return C.CONSIGNES_HINTS[key]; });
    setPill('pill-perf', r.perf);
    setPill('pill-cons', r.consignes);
  }

  function setPill(id, block) {
    var pill = $(id);
    pill.querySelector('strong').textContent = S.formatScore(block.score);
  }

  function renderCriteria(group, block, hintFor) {
    block.items.forEach(function (it) {
      var f = refs[group][it.key];
      var entry = state.evaluation[group][it.key];
      f.hint.textContent = hintFor(it.key);
      f.max.textContent = '/ ' + fmt(it.weight, 2) + ' pts';
      ['a', 'b'].forEach(function (o) {
        var p = f.pickers[o];
        var n = entry[o];
        var has = n !== null && n !== undefined;
        if (p.select.value !== (has ? String(n) : '')) p.select.value = has ? String(n) : '';
        p.value.textContent = has ? fmt(n, 1) : '—';
        p.label.textContent = has ? noteLabel(n) : 'Non noté';
        p.wrap.classList.toggle('empty', !has);
      });
      var missing = it.manquants.concat(it.invalides);
      if (missing.length === 2) f.avg.textContent = 'Aucune note';
      else if (missing.length === 1) f.avg.textContent = 'Note ' + missing[0] + ' manquante';
      else f.avg.textContent = 'Moyenne ' + fmt(it.moyenne, 2) + ' / 5';
      f.pts.textContent = fmtPts(it.points) + ' / ' + fmt(it.weight, 2) + ' pts';
      f.row.classList.toggle('is-missing', missing.length > 0);
      var gap = it.a != null && it.b != null ? Math.abs(it.a - it.b) : 0;
      f.gap.hidden = gap < 2;
      f.gap.textContent = gap >= 2 ? 'Écart important entre les observateurs (' + fmt(gap, 1) + ' points) : à discuter.' : '';
    });
  }

  function renderResult() {
    var r = state.result;
    var ev = state.evaluation;
    $('rc-player').textContent = ev.joueur.trim() || 'Joueur non renseigné';
    $('rc-player').classList.toggle('placeholder', !ev.joueur.trim());
    $('rc-pos').textContent = ev.poste + ' · ' + S.POSITION_LABELS[ev.poste] + (ev.date ? ' · ' + frDate(ev.date) : '');

    var badge = $('rc-badge');
    if (!r.parametresValides) { badge.textContent = 'Paramètres invalides'; badge.className = 'badge badge-err'; }
    else if (!r.complet) { badge.textContent = 'Incomplète'; badge.className = 'badge badge-warn'; }
    else { badge.textContent = 'Complète'; badge.className = 'badge badge-ok'; }

    var totalText = S.formatScore(r.total);
    $('rc-total').textContent = totalText;
    $('ring-value').style.strokeDasharray = RING_C.toFixed(2);
    $('ring-value').style.strokeDashoffset = (RING_C * (1 - r.total / 100)).toFixed(2);
    renderStars($('rc-stars'), r.etoiles);
    $('rc-stars').setAttribute('aria-label', r.etoiles + ' étoile' + (r.etoiles > 1 ? 's' : '') + ' sur 3');
    var mention = r.mention + (r.sessions.type === 'provisoire' ? ' · provisoire' : '');
    $('rc-mention').textContent = mention;
    $('rc-status').textContent = S.statusLabel(r);
    $('result-card').classList.toggle('invalid', !r.parametresValides);
    $('result-card').setAttribute('data-stars', String(r.etoiles));

    [['fc', r.fc], ['perf', r.perf], ['consignes', r.consignes]].forEach(function (pair) {
      var b = refs.blocks[pair[0]];
      b.val.textContent = S.formatScore(pair[1].score) + ' / ' + pair[1].max;
      b.bar.style.width = (pair[1].score / pair[1].max * 100) + '%';
    });

    var warn = $('rc-warnings');
    warn.replaceChildren();
    r.avertissements.forEach(function (a) { warn.append(h('li', null, a)); });
    if (r.sessions.type === 'provisoire') warn.append(h('li', { class: 'info' }, 'Statut indicatif provisoire : ' + r.sessions.sessions + ' session(s) sur ' + r.sessions.minimum + ' requise(s).'));
    var missingList = r.manquantes.concat(r.nonDisponibles.map(function (m) { return m + ' (N/D)'; }));
    if (missingList.length) {
      var ul = h('ul', { class: 'missing-list' });
      missingList.slice(0, 8).forEach(function (m) { ul.append(h('li', null, m)); });
      if (missingList.length > 8) ul.append(h('li', null, 'et ' + (missingList.length - 8) + ' autre(s)…'));
      warn.append(h('li', { class: 'missing' }, h('details', null, h('summary', null, 'Voir les données manquantes'), ul)));
    }

    $('rc-detail').replaceChildren(detailTables(r));

    // Barre de score mobile
    $('sb-total').textContent = totalText;
    renderStars($('sb-stars'), r.etoiles);
    $('sb-mention').textContent = mention;
    $('scorebar').classList.toggle('invalid', !r.parametresValides);
  }

  function detailTables(r) {
    var frag = document.createDocumentFragment();
    var fcRows = r.fc.items.map(function (i) {
      return h('tr', { class: i.used ? '' : 'muted' },
        h('th', { scope: 'row' }, i.short),
        h('td', null, i.status === 'ok' ? fmt(i.value) : (STATUS_LABELS[i.status] || '—')),
        h('td', null, i.normalized != null ? fmt(i.normalized, 0) : '—'),
        h('td', null, fmt(i.coefficient) + ' %'),
        h('td', null, fmtPts(i.points)));
    });
    frag.append(table('Données EA SPORTS FC', ['Donnée', 'Valeur', 'Note/100', 'Coef.', 'Points'], fcRows,
      ['Total', '', '', '', S.formatScore(r.fc.score) + ' / 30']));
    [['Performances observées', r.perf], ['Respect des consignes', r.consignes]].forEach(function (pair) {
      var rows = pair[1].items.map(function (i) {
        return h('tr', null,
          h('th', { scope: 'row' }, i.label),
          h('td', null, S.formatNote(i.a)),
          h('td', null, S.formatNote(i.b)),
          h('td', null, i.moyenne != null ? fmt(i.moyenne, 2) : '—'),
          h('td', null, fmtPts(i.points) + ' / ' + fmt(i.weight)));
      });
      frag.append(table(pair[0], ['Critère', 'Obs. A', 'Obs. B', 'Moy.', 'Points'], rows,
        ['Total', '', '', '', S.formatScore(pair[1].score) + ' / ' + pair[1].max]));
    });
    return frag;
  }

  function table(title, headers, rows, foot) {
    return h('div', { class: 'dt' },
      h('p', { class: 'dt-title' }, title),
      h('table', null,
        h('thead', null, h('tr', null, headers.map(function (x, i) { return h('th', { scope: 'col', class: i ? 'num' : '' }, x); }))),
        h('tbody', null, rows),
        foot ? h('tfoot', null, h('tr', null, foot.map(function (x, i) { return h(i ? 'td' : 'th', { scope: i ? null : 'row' }, x); }))) : null));
  }

  /* ------------------------------------------------------------------ */
  /* Fiche (impression / capture)                                         */
  /* ------------------------------------------------------------------ */

  function buildSheet() {
    var r = state.result;
    var ev = state.evaluation;
    var s = state.settings;
    var dateLine = ev.date ? 'Évaluation du ' + frDate(ev.date) : 'Fiche éditée le ' + todayFr();
    var statusClass = !r.parametresValides ? 'err' : (!r.complet ? 'warn' : 'ok');

    var stars = h('div', { class: 'stars sh-stars', role: 'img', 'aria-label': r.etoiles + ' étoile(s) sur 3' });
    renderStars(stars, r.etoiles);

    var blocks = h('div', { class: 'sh-blocks' });
    [['EA SPORTS FC', r.fc], ['Performances observées', r.perf], ['Respect des consignes', r.consignes]].forEach(function (pair) {
      var bar = h('span');
      bar.style.width = (pair[1].score / pair[1].max * 100) + '%';
      blocks.append(h('div', { class: 'sh-block' },
        h('p', { class: 'sh-block-name' }, pair[0]),
        h('p', { class: 'sh-block-val' }, h('strong', null, S.formatScore(pair[1].score)), ' / ' + pair[1].max),
        h('div', { class: 'bar' }, bar)));
    });

    var alerts = [];
    r.avertissements.forEach(function (a) { alerts.push(a); });
    if (r.manquantes.length) alerts.push('Données manquantes : ' + r.manquantes.join(' ; ') + '.');
    if (r.nonDisponibles.length) alerts.push('Données non disponibles : ' + r.nonDisponibles.join(' ; ') + '.');

    return h('article', { class: 'sheet' },
      h('header', { class: 'sh-head' },
        h('img', { src: 'icons/emblem.svg', alt: '', width: 44, height: 44 }),
        h('div', { class: 'sh-head-text' }, h('p', { class: 'sh-club' }, 'BABI A.C'), h('p', { class: 'sh-title' }, 'Fiche d’évaluation joueur')),
        h('p', { class: 'sh-date' }, dateLine)),
      h('section', { class: 'sh-hero' },
        h('div', { class: 'sh-player' },
          h('p', { class: 'sh-label' }, 'Joueur'),
          h('p', { class: 'sh-name' }, ev.joueur.trim() || 'Joueur non renseigné'),
          h('p', { class: 'sh-label' }, 'Poste évalué'),
          h('p', { class: 'sh-pos' }, ev.poste + ' · ' + S.POSITION_LABELS[ev.poste]),
          h('span', { class: 'sh-badge sh-badge-' + statusClass }, !r.parametresValides ? 'Paramètres invalides' : (r.complet ? 'Évaluation complète' : 'Évaluation incomplète'))),
        h('div', { class: 'sh-score' },
          h('p', { class: 'sh-total' }, S.formatScore(r.total), h('span', null, ' / 100')),
          stars,
          h('p', { class: 'sh-mention' }, r.mention + (r.sessions.type === 'provisoire' ? ' · provisoire' : '')),
          h('p', { class: 'sh-status' }, S.statusLabel(r)))),
      blocks,
      alerts.length ? h('section', { class: 'sh-alerts' }, h('ul', null, alerts.map(function (a) { return h('li', null, a); }))) : null,
      h('section', { class: 'sh-details' }, detailTables(r)),
      h('footer', { class: 'sh-foot' },
        h('p', null, 'Seuils : 2 étoiles dès ' + fmt(s.etoiles.deux) + ' / 100 · 3 étoiles dès ' + fmt(s.etoiles.trois) + ' / 100. Les étoiles valent pour le poste évalué uniquement.'),
        h('p', null, 'Calculé localement par BABI A.C Player Rating — aucune donnée transmise ni conservée.')));
  }

  function printSheet() {
    $('print-root').replaceChildren(buildSheet());
    window.print();
  }

  function openCapture() {
    $('capture-sheet').replaceChildren(buildSheet());
    $('dlg-capture').showModal();
    $('dlg-capture').querySelector('.capture-scroll').scrollTop = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Saisie : remplissage et réinitialisation                             */
  /* ------------------------------------------------------------------ */

  function setPoste(p) {
    state.evaluation.poste = p; // les valeurs saisies sont conservées
    update();
  }

  function fillEvalInputs() {
    var ev = state.evaluation;
    $('joueur').value = ev.joueur;
    $('date-eval').value = ev.date;
    $('sessions').value = ev.sessions;
    S.FC_STATS.forEach(function (st) { refs.fc[st.key].input.value = ev.fc[st.key].raw; });
  }

  function hasEvaluationData() {
    var ev = state.evaluation;
    if (ev.joueur.trim() || ev.date || String(ev.sessions).trim()) return true;
    var fc = S.FC_STATS.some(function (st) { return ev.fc[st.key].raw.trim() !== '' || ev.fc[st.key].nd; });
    var notes = ['perf', 'consignes'].some(function (g) {
      return Object.keys(ev[g]).some(function (k) { return ev[g][k].a !== null || ev[g][k].b !== null; });
    });
    return fc || notes;
  }

  async function newEvaluation() {
    if (hasEvaluationData()) {
      var ok = await confirmDialog({
        title: 'Commencer une nouvelle évaluation ?',
        text: 'Toutes les saisies en cours seront effacées. Exportez la fiche avant si vous souhaitez la garder. Le poste sélectionné et les paramètres sont conservés.',
        ok: 'Effacer et recommencer', danger: true
      });
      if (!ok) return;
    }
    state.evaluation = S.emptyEvaluation(state.evaluation.poste);
    fillEvalInputs();
    update();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('joueur').focus({ preventScroll: true });
    toast('Nouvelle évaluation prête.');
  }

  async function exportEvaluation() {
    var ok = await confirmDialog({
      title: 'Exporter le résultat en JSON',
      text: [
        'Le fichier sera créé sur cet appareil uniquement. Il contient des informations sur le joueur (pseudo, notes, résultat) : conservez-le de façon responsable et ne le partagez qu’avec le staff concerné.',
        'Rien n’est envoyé à un serveur.'
      ],
      ok: 'Créer le fichier'
    });
    if (!ok) return;
    var obj = S.exportEvaluationObject(state.evaluation, state.settings, state.result);
    var slug = (state.evaluation.joueur.trim() || 'joueur').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'joueur';
    downloadJson(obj, 'babi-ac-evaluation-' + slug + '-' + state.evaluation.poste + '-' + (state.evaluation.date || todayIso()) + '.json');
    toast('Fichier d’évaluation créé.');
  }

  /* ------------------------------------------------------------------ */
  /* Paramètres                                                           */
  /* ------------------------------------------------------------------ */

  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function setPath(obj, path, v) {
    var parts = path.split('.');
    var last = parts.pop();
    var target = parts.reduce(function (o, k) { return o[k]; }, obj);
    target[last] = v;
  }

  function parseSettingInput(raw) {
    var p = S.parseNumber(raw, null);
    return p.status === 'ok' ? p.value : NaN;
  }

  function settingInput(id, getter, setter, label) {
    var input = h('input', {
      id: id, type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': label || null,
      oninput: function (e) {
        var v = parseSettingInput(e.target.value);
        setter(v);
        e.target.classList.toggle('invalid', !isFinite(v));
        update();
      }
    });
    input._fill = function () {
      var v = getter();
      input.value = isFinite(v) ? fmt(v, 4) : '';
      input.classList.toggle('invalid', !isFinite(v));
    };
    refs.settings.inputs.push(input);
    return input;
  }

  function buildSettings() {
    refs.settings.inputs = [];

    // Champs simples (data-path)
    document.querySelectorAll('#settings-form input[data-path]').forEach(function (input) {
      var path = input.getAttribute('data-path');
      input.setAttribute('autocomplete', 'off');
      input.addEventListener('input', function () {
        var v = parseSettingInput(input.value);
        setPath(state.settings, path, v);
        input.classList.toggle('invalid', !isFinite(v));
        update();
      });
      input._fill = function () {
        var v = getPath(state.settings, path);
        input.value = isFinite(v) ? fmt(v, 4) : '';
        input.classList.toggle('invalid', !isFinite(v));
      };
      refs.settings.inputs.push(input);
    });

    $('set-sessions-actif').addEventListener('change', function (e) {
      state.settings.sessions.actif = e.target.checked;
      update();
    });
    document.querySelectorAll('input[name="rule-pos"]').forEach(function (r) {
      r.addEventListener('change', function () { state.settings.normalisation.statsPositives = r.value; update(); });
    });
    document.querySelectorAll('input[name="rule-neg"]').forEach(function (r) {
      r.addEventListener('change', function () { state.settings.normalisation.ballonsPerdus = r.value; update(); });
    });

    refs.posteSettings = buildPosteGrid($('set-poste-grid'), function (p) {
      state.settingsPoste = p;
      fillCoefTable();
      update();
    }, true);

    // Tableau coefficients / seuils pour le poste sélectionné
    var tbl = $('coef-table');
    tbl.append(h('div', { class: 'ct-row ct-head', 'aria-hidden': 'true' },
      h('span', null, 'Statistique'), h('span', null, 'Coefficient'), h('span', null, 'Seuil de réf.')));
    refs.coefInputs = {};
    S.FC_STATS.forEach(function (st) {
      var coef = settingInput('coef-' + st.key,
        function () { return state.settings.coefficients[state.settingsPoste][st.key]; },
        function (v) { state.settings.coefficients[state.settingsPoste][st.key] = v; },
        'Coefficient ' + st.short);
      var seuil = settingInput('seuil-' + st.key,
        function () { return state.settings.seuils[state.settingsPoste][st.key]; },
        function (v) { state.settings.seuils[state.settingsPoste][st.key] = v; },
        'Seuil de référence ' + st.short);
      refs.coefInputs[st.key] = { coef: coef, seuil: seuil };
      tbl.append(h('div', { class: 'ct-row' },
        h('span', { class: 'ct-name' }, st.short, h('small', null, st.higherIsBetter ? (st.key === 'archetype' ? '% pour 100/100' : 'valeur pour 100/100') : 'valeur pour 0/100')),
        h('div', { class: 'input-wrap' }, coef, h('span', { class: 'unit' }, '%')),
        h('div', { class: 'input-wrap' }, seuil, h('span', { class: 'unit' }, st.key === 'archetype' ? '%' : '/m'))));
    });

    // Poids
    [['w-perf', S.PERF_CRITERIA, 'poidsPerformance'], ['w-cons', S.CONSIGNES_CRITERIA, 'poidsConsignes']].forEach(function (cfg) {
      var box = $(cfg[0]);
      cfg[1].forEach(function (c) {
        var input = settingInput('w-' + c.key,
          function () { return state.settings[cfg[2]][c.key]; },
          function (v) { state.settings[cfg[2]][c.key] = v; });
        box.append(h('div', { class: 'w-row' },
          h('label', { for: input.id }, c.label),
          h('div', { class: 'input-wrap' }, input, h('span', { class: 'unit' }, 'pts'))));
      });
    });

    $('btn-seuils-all').addEventListener('click', async function () {
      var p = state.settingsPoste;
      var ok = await confirmDialog({
        title: 'Appliquer les seuils du poste ' + p + ' à tous les postes ?',
        text: 'Les seuils de référence des 10 postes seront remplacés par ceux de ' + p + '. Les coefficients ne changent pas.',
        ok: 'Appliquer'
      });
      if (!ok) return;
      S.POSITIONS.forEach(function (q) { state.settings.seuils[q] = Object.assign({}, state.settings.seuils[p]); });
      fillCoefTable();
      update();
      toast('Seuils appliqués à tous les postes.');
    });
    $('btn-reset-poste').addEventListener('click', function () {
      var d = S.defaultSettings();
      var p = state.settingsPoste;
      state.settings.coefficients[p] = d.coefficients[p];
      state.settings.seuils[p] = d.seuils[p];
      fillCoefTable();
      update();
      toast('Poste ' + p + ' rétabli.');
    });
    $('btn-reset-settings').addEventListener('click', async function () {
      var ok = await confirmDialog({
        title: 'Rétablir les paramètres initiaux ?',
        text: 'Seuils, coefficients, poids et règles reviennent aux valeurs d’origine. L’évaluation en cours est conservée et recalculée.',
        ok: 'Rétablir', danger: true
      });
      if (!ok) return;
      state.settings = S.defaultSettings();
      fillSettingsInputs();
      update();
      toast('Paramètres initiaux rétablis.');
    });
    $('btn-export-settings').addEventListener('click', function () {
      if (S.validateSettings(state.settings).length) {
        toast('Corrigez les paramètres invalides avant de les exporter.', { type: 'err' });
        return;
      }
      downloadJson(S.exportSettingsObject(state.settings), 'babi-ac-parametres-' + todayIso() + '.json');
      toast('Fichier de paramètres créé.');
    });
    $('btn-import-settings').addEventListener('click', function () { $('file-import').click(); });
    $('file-import').addEventListener('change', importSettingsFile);
  }

  async function importSettingsFile(e) {
    var input = e.target;
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > 100000) {
      await confirmDialog({ title: 'Import refusé', text: 'Fichier trop volumineux pour un fichier de paramètres.', ok: 'Compris', okOnly: true });
      return;
    }
    var text;
    try { text = await file.text(); } catch (err) { text = null; }
    var parsed = S.parseSettingsFile(text);
    if (!parsed.ok) {
      var list = h('ul', { class: 'bullets error-list' });
      parsed.errors.slice(0, 8).forEach(function (m) { list.append(h('li', null, m)); });
      if (parsed.errors.length > 8) list.append(h('li', null, 'et ' + (parsed.errors.length - 8) + ' autre(s) erreur(s).'));
      await confirmDialog({ title: 'Import refusé', text: ['Le fichier « ' + file.name + ' » n’a pas été appliqué :', list], ok: 'Compris', okOnly: true });
      return;
    }
    var ok = await confirmDialog({
      title: 'Appliquer ces paramètres ?',
      text: 'Les paramètres actuels seront remplacés par ceux du fichier « ' + file.name + ' ». L’évaluation en cours sera recalculée.',
      ok: 'Appliquer'
    });
    if (!ok) return;
    state.settings = parsed.settings;
    fillSettingsInputs();
    update();
    toast('Paramètres importés.');
  }

  function fillCoefTable() {
    S.FC_STATS.forEach(function (st) {
      refs.coefInputs[st.key].coef._fill();
      refs.coefInputs[st.key].seuil._fill();
    });
  }

  function fillSettingsInputs() {
    refs.settings.inputs.forEach(function (i) { i._fill(); });
    $('set-sessions-actif').checked = state.settings.sessions.actif;
    document.querySelectorAll('input[name="rule-pos"]').forEach(function (r) { r.checked = r.value === state.settings.normalisation.statsPositives; });
    document.querySelectorAll('input[name="rule-neg"]').forEach(function (r) { r.checked = r.value === state.settings.normalisation.ballonsPerdus; });
  }

  function totalLine(el, total, expected, unit) {
    var ok = isFinite(total) && Math.abs(total - expected) <= 0.01;
    el.className = 'total-line ' + (ok ? 'ok' : 'err');
    el.replaceChildren(
      h('span', null, 'Total'),
      h('strong', null, fmt(total) + ' ' + unit + ' / ' + expected + ' ' + unit),
      h('span', { class: 'tl-state' }, ok ? '✓ Valide' : (total > expected ? '✕ Trop élevé de ' + fmt(total - expected) : '✕ Il manque ' + fmt(expected - total))));
  }

  function renderSettingsStatus() {
    var s = state.settings;
    var errors = state.result.erreursParametres;
    var p = state.settingsPoste;

    // Résumé global
    var summary = $('settings-summary');
    var modified = JSON.stringify(s) !== JSON.stringify(S.defaultSettings());
    if (errors.length) {
      var ul = h('ul', null);
      errors.slice(0, 6).forEach(function (e) { ul.append(h('li', null, e.message)); });
      if (errors.length > 6) ul.append(h('li', null, 'et ' + (errors.length - 6) + ' autre(s).'));
      summary.className = 'settings-summary err';
      summary.replaceChildren(h('p', null, h('strong', null, errors.length + ' problème(s) à corriger.'), ' Tant qu’ils subsistent, le score est signalé comme non fiable.'), ul);
    } else {
      summary.className = 'settings-summary ok';
      summary.replaceChildren(h('p', null, h('strong', null, '✓ Paramètres valides.'), modified ? ' Modifiés pour cette session uniquement — exportez-les pour les réutiliser.' : ' Valeurs initiales chargées.'));
    }

    // Messages par section
    document.querySelectorAll('#settings-form [data-errors]').forEach(function (el) {
      var section = el.getAttribute('data-errors');
      var msgs = errors.filter(function (e) {
        if (section === 'poste') return (e.section === 'coefficients' || e.section === 'seuils') && e.poste === p;
        return e.section === section;
      }).map(function (e) { return e.message; });
      el.textContent = msgs.join(' ');
      el.className = 'field-msg' + (msgs.length ? ' error' : '');
    });

    // Échelle des étoiles
    var scale = $('star-scale');
    var d = s.etoiles.deux, t = s.etoiles.trois;
    if (isFinite(d) && isFinite(t) && d <= t && d >= 0 && t <= 100) {
      var segs = [[0, d, '1 ★', 'Développement'], [d, t, '2 ★', 'Compétent'], [t, 100, '3 ★', 'Confirmé']];
      scale.replaceChildren.apply(scale, segs.map(function (sg, i) {
        var seg = h('div', { class: 'ss-seg ss-' + (i + 1) }, h('strong', null, sg[2]), h('span', null, fmt(sg[0]) + '–' + (i === 2 ? '100' : '<' + fmt(sg[1]))));
        seg.style.flexGrow = String(Math.max(sg[1] - sg[0], 0.0001));
        return seg;
      }));
      scale.hidden = false;
    } else {
      scale.hidden = true;
    }

    $('zone-field').hidden = s.normalisation.ballonsPerdus !== 'zone';
    $('set-sessions-min').disabled = !s.sessions.actif;

    // Aperçu normalisation (poste sélectionné)
    var bp = s.seuils[p].ballonsPerdus;
    var buts = s.seuils[p].buts;
    var prev = $('norm-preview');
    if (isFinite(bp) && bp > 0 && isFinite(buts) && buts > 0) {
      var rows = [0, bp * 0.25, bp * 0.5, bp * 0.75, bp].map(function (v) {
        return h('tr', null, h('td', null, fmt(v)), h('td', null, fmt(S.normalizeStat(v, bp, false, s.normalisation), 0) + '/100'));
      });
      var rowsB = [buts * 0.25, buts * 0.5, buts, buts * 1.5].map(function (v) {
        return h('tr', null, h('td', null, fmt(v)), h('td', null, fmt(S.normalizeStat(v, buts, true, s.normalisation), 0) + '/100'));
      });
      prev.replaceChildren(
        h('p', { class: 'np-title' }, 'Aperçu pour le poste ' + p),
        h('div', { class: 'np-tables' },
          h('table', null, h('caption', null, 'Ballons perdus (seuil ' + fmt(bp) + ')'), h('tbody', null, rows)),
          h('table', null, h('caption', null, 'Buts par match (seuil ' + fmt(buts) + ')'), h('tbody', null, rowsB))));
    } else {
      prev.replaceChildren(h('p', { class: 'help' }, 'Aperçu indisponible : seuils du poste ' + p + ' invalides.'));
    }

    // Postes : état de chaque poste
    S.POSITIONS.forEach(function (q) {
      var btn = refs.posteSettings[q];
      var bad = errors.some(function (e) { return e.poste === q; });
      btn.setAttribute('aria-checked', String(q === p));
      btn.classList.toggle('has-error', bad);
      btn.title = S.POSITION_LABELS[q] + (bad ? ' — à corriger' : ' — valide');
    });

    totalLine($('coef-total'), S.coefficientTotal(s, p), 100, '%');
    totalLine($('w-perf-total'), S.weightTotal(s.poidsPerformance, S.PERF_CRITERIA), 50, 'pts');
    totalLine($('w-cons-total'), S.weightTotal(s.poidsConsignes, S.CONSIGNES_CRITERIA), 20, 'pts');
  }

  /* ------------------------------------------------------------------ */
  /* Navigation, barre de score, service worker                           */
  /* ------------------------------------------------------------------ */

  function showView(view) {
    state.view = view;
    ['eval', 'settings'].forEach(function (v) {
      $('view-' + v).hidden = v !== view;
      $('tab-' + v).setAttribute('aria-selected', String(v === view));
    });
    document.body.setAttribute('data-view', view);
    window.scrollTo(0, 0);
    updateScorebar();
  }

  var resultVisible = false;
  function updateScorebar() {
    $('scorebar').classList.toggle('show', state.view === 'settings' || !resultVisible);
  }

  function setupScorebar() {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        resultVisible = entries[0].isIntersecting;
        updateScorebar();
      }, { threshold: 0.15 }).observe($('result-card'));
    }
    $('scorebar').addEventListener('click', function () {
      if (state.view !== 'eval') showView('eval');
      $('result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function setupServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function (reg) {
        function offer(worker) {
          toast('Nouvelle version disponible.', {
            sticky: true,
            action: {
              label: 'Mettre à jour',
              fn: async function () {
                if (hasEvaluationData()) {
                  var ok = await confirmDialog({ title: 'Mettre à jour maintenant ?', text: 'La page va se recharger : la saisie en cours sera effacée.', ok: 'Mettre à jour', danger: true });
                  if (!ok) return;
                }
                worker.postMessage({ type: 'SKIP_WAITING' });
              }
            }
          });
        }
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', function () {
          var w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', function () {
            if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
          });
        });
      }).catch(function () { /* mode hors ligne indisponible : l'application fonctionne quand même */ });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Initialisation                                                       */
  /* ------------------------------------------------------------------ */

  function init() {
    document.body.setAttribute('data-view', 'eval');
    ['eval-form', 'settings-form'].forEach(function (id) {
      $(id).addEventListener('submit', function (e) { e.preventDefault(); });
    });

    refs.posteEval = buildPosteGrid($('poste-grid'), setPoste, false);
    buildFcList();
    buildCriteria('perf-list', S.PERF_CRITERIA, 'perf');
    buildCriteria('cons-list', S.CONSIGNES_CRITERIA, 'consignes');
    buildResultBlocks();
    C.SCALE.forEach(function (s) { $('scale-list').append(h('li', null, h('strong', null, String(s.note)), ' ', s.label)); });

    $('joueur').addEventListener('input', function (e) { state.evaluation.joueur = e.target.value; renderResult(); });
    $('date-eval').addEventListener('input', function (e) { state.evaluation.date = e.target.value; renderResult(); });
    $('sessions').addEventListener('input', function (e) { state.evaluation.sessions = e.target.value; update(); });

    // Entrée = champ suivant (pratique au clavier mobile)
    $('fc-list').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      var inputs = Array.prototype.slice.call(document.querySelectorAll('#fc-list input:not([disabled])'));
      var next = inputs[inputs.indexOf(e.target) + 1];
      if (next) next.focus(); else e.target.blur();
    });

    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { showView(t.getAttribute('data-view')); });
    });

    $('btn-print').addEventListener('click', printSheet);
    $('btn-capture').addEventListener('click', openCapture);
    $('btn-export-eval').addEventListener('click', exportEvaluation);
    $('btn-new').addEventListener('click', newEvaluation);
    $('capture-close').addEventListener('click', function () { $('dlg-capture').close(); });
    $('capture-print').addEventListener('click', function () { $('dlg-capture').close(); printSheet(); });
    $('dlg-capture').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); });

    // Ctrl+P / impression depuis le menu du navigateur : toujours la fiche à jour.
    window.addEventListener('beforeprint', function () { $('print-root').replaceChildren(buildSheet()); });

    // Avertit avant de quitter si une saisie est en cours (rien n'est sauvegardé).
    window.addEventListener('beforeunload', function (e) {
      if (hasEvaluationData()) { e.preventDefault(); e.returnValue = ''; }
    });

    buildSettings();
    // Les navigateurs peuvent restaurer des champs après actualisation : on force l'état vierge.
    fillEvalInputs();
    fillSettingsInputs();
    update();
    setupScorebar();
    setupServiceWorker();
  }

  // Exposé uniquement pour les tests automatisés dans le navigateur (lecture seule de l'état courant).
  window.BabiApp = {
    getState: function () { return { settings: S.cloneSettings(state.settings), evaluation: JSON.parse(JSON.stringify(state.evaluation)), result: state.result }; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
