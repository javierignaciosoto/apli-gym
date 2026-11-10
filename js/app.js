/* Lógica de interfaz de Apli-Gym. */
(function () {
  'use strict';

  var S = window.GymStorage;

  var EQUIPMENT_LABEL = { barra: 'Barra', mancuernas: 'Mancuernas', peso_corporal: 'Peso corporal' };
  var EQUIPMENT_COLOR = { barra: '#2563eb', mancuernas: '#d97706', peso_corporal: '#059669' };

  var METRICS = {
    weight: { label: 'Peso máximo', unit: 'kg' },
    e1rm: { label: '1RM estimado', unit: 'kg' },
    volume: { label: 'Volumen (series × reps × kg)', unit: 'kg' },
    reps: { label: 'Repeticiones máximas', unit: 'reps' }
  };

  var $ = function (id) { return document.getElementById(id); };

  // ---------- Utilidades ----------
  function today() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  function epley(weight, reps) { return reps <= 1 ? weight : weight * (1 + reps / 30); }

  function formatDate(iso) {
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function describe(e) {
    var w = e.equipment === 'peso_corporal'
      ? (e.weight > 0 ? 'PC + ' + e.weight + ' kg' : 'Peso corporal')
      : e.weight + ' kg' + (e.equipment === 'mancuernas' ? ' c/u' : '');
    return e.sets + '×' + e.reps + ' · ' + w;
  }

  function metricValue(e, metric) {
    switch (metric) {
      case 'e1rm': return epley(e.weight, e.reps);
      case 'volume': return e.sets * e.reps * e.weight;
      case 'reps': return e.reps;
      default: return e.weight;
    }
  }

  // Agrupa por implemento y por día, quedándose con el mejor valor del día.
  function buildSeries(entries, metric) {
    var groups = {};
    entries.forEach(function (e) {
      var g = groups[e.equipment] || (groups[e.equipment] = {});
      var value = metricValue(e, metric);
      if (metric === 'volume') {
        var acc = g[e.date] || { date: e.date, value: 0, parts: [] };
        acc.value += value;
        acc.parts.push(describe(e));
        g[e.date] = acc;
      } else if (!g[e.date] || value > g[e.date].value) {
        g[e.date] = { date: e.date, value: value, parts: [describe(e)] };
      }
    });
    return Object.keys(groups).map(function (eq) {
      return {
        label: EQUIPMENT_LABEL[eq],
        color: EQUIPMENT_COLOR[eq],
        points: Object.keys(groups[eq]).map(function (d) {
          var p = groups[eq][d];
          return { date: p.date, value: round1(p.value), detail: p.parts.join(' | ') };
        })
      };
    });
  }

  // ---------- Formulario ----------
  function updateWeightHint() {
    var eq = document.querySelector('input[name="equipment"]:checked');
    var hint = $('weight-hint');
    var weight = $('weight');
    if (!eq) return;
    if (eq.value === 'mancuernas') {
      hint.textContent = 'Peso de UNA mancuerna (kg).';
      weight.required = true;
    } else if (eq.value === 'peso_corporal') {
      hint.textContent = 'Lastre adicional en kg (deja 0 si no usas).';
      weight.required = false;
      if (!weight.value) weight.value = '0';
    } else {
      hint.textContent = 'Peso total de la barra con discos (kg).';
      weight.required = true;
    }
  }

  function onSubmit(evt) {
    evt.preventDefault();
    var form = evt.target;
    var eq = form.querySelector('input[name="equipment"]:checked');
    var result = S.addEntry({
      date: form.date.value,
      exercise: form.exercise.value,
      equipment: eq ? eq.value : '',
      weight: form.weight.value || 0,
      sets: form.sets.value,
      reps: form.reps.value,
      notes: form.notes.value
    });
    var msg = $('form-msg');
    if (!result.ok) {
      msg.className = 'msg error';
      msg.textContent = result.errors.join(' ');
      return;
    }
    msg.className = 'msg ok';
    msg.textContent = 'Guardado: ' + result.entry.exercise + ' — ' + describe(result.entry);
    // Mantener fecha, ejercicio e implemento para registrar rápido la siguiente serie.
    form.notes.value = '';
    state.chartExercise = result.entry.exercise;
    refresh();
  }

  // ---------- Estado y render ----------
  var state = { chartExercise: '', metric: 'weight', historyFilter: '' };

  function fillSelect(select, options, selected, placeholder) {
    select.innerHTML = '';
    if (placeholder) {
      var ph = document.createElement('option');
      ph.value = '';
      ph.textContent = placeholder;
      select.appendChild(ph);
    }
    options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      select.appendChild(opt);
    });
    select.value = options.indexOf(selected) !== -1 ? selected : (placeholder ? '' : options[0] || '');
  }

  function renderExerciseLists(exercises) {
    var dl = $('exercise-list');
    dl.innerHTML = '';
    var defaults = ['Press banca', 'Sentadilla', 'Peso muerto', 'Press militar', 'Remo', 'Dominadas',
      'Fondos', 'Curl de bíceps', 'Extensión de tríceps', 'Elevaciones laterales', 'Zancadas', 'Hip thrust'];
    defaults.concat(exercises).filter(function (v, i, a) { return a.indexOf(v) === i; })
      .forEach(function (name) {
        var opt = document.createElement('option');
        opt.value = name;
        dl.appendChild(opt);
      });

    if (!state.chartExercise || exercises.indexOf(state.chartExercise) === -1) {
      state.chartExercise = exercises[0] || '';
    }
    fillSelect($('chart-exercise'), exercises, state.chartExercise);
    fillSelect($('history-filter'), exercises, state.historyFilter, 'Todos los ejercicios');
  }

  function renderStats(entries) {
    var box = $('stats');
    box.innerHTML = '';
    if (!entries.length) return;

    // Las cifras de barra y mancuernas no son comparables: resumen separado por implemento.
    var groups = {};
    entries.forEach(function (e) { (groups[e.equipment] = groups[e.equipment] || []).push(e); });
    var keys = S.EQUIPMENT.filter(function (k) { return groups[k]; });
    keys.forEach(function (eq) {
      if (keys.length > 1) {
        var title = document.createElement('h3');
        title.className = 'stats-title';
        title.textContent = EQUIPMENT_LABEL[eq];
        title.style.borderColor = EQUIPMENT_COLOR[eq];
        box.appendChild(title);
      }
      statCards(groups[eq]).forEach(function (card) { box.appendChild(card); });
    });
  }

  function statCards(entries) {
    var sorted = entries.slice().sort(function (a, b) {
      return a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.createdAt < b.createdAt ? -1 : 1);
    });
    var metric = state.metric;
    var unit = METRICS[metric].unit;
    var best = sorted.reduce(function (acc, e) {
      var v = metricValue(e, metric);
      return !acc || v > acc.v ? { v: v, e: e } : acc;
    }, null);
    var last = sorted[sorted.length - 1];
    var first = sorted[0];
    var lastV = metricValue(last, metric);
    var firstV = metricValue(first, metric);
    var diff = lastV - firstV;
    var sessions = {};
    sorted.forEach(function (e) { sessions[e.date] = true; });

    var cards = [
      { label: 'Récord (' + METRICS[metric].label.toLowerCase() + ')', value: round1(best.v) + ' ' + unit, sub: formatDate(best.e.date) },
      { label: 'Último registro', value: round1(lastV) + ' ' + unit, sub: formatDate(last.date) + ' · ' + describe(last) },
      { label: 'Progreso desde el inicio', value: (diff >= 0 ? '+' : '') + round1(diff) + ' ' + unit,
        sub: firstV ? (diff >= 0 ? '+' : '') + Math.round((diff / firstV) * 100) + '% vs ' + formatDate(first.date) : '', trend: diff > 0 ? 'up' : diff < 0 ? 'down' : '' },
      { label: 'Días entrenados', value: Object.keys(sessions).length, sub: 'con este ejercicio' }
    ];
    return cards.map(function (c) {
      var card = document.createElement('div');
      card.className = 'stat' + (c.trend ? ' ' + c.trend : '');
      var l = document.createElement('span'); l.className = 'stat-label'; l.textContent = c.label;
      var v = document.createElement('strong'); v.textContent = c.value;
      var s = document.createElement('span'); s.className = 'stat-sub'; s.textContent = c.sub;
      card.appendChild(l); card.appendChild(v); card.appendChild(s);
      return card;
    });
  }

  function renderChart(allEntries) {
    var entries = allEntries.filter(function (e) { return e.exercise === state.chartExercise; });
    // Peso corporal sin lastre: graficar kg no tiene sentido, se cambia a repeticiones.
    var noLoad = entries.length && entries.every(function (e) { return e.equipment === 'peso_corporal' && !e.weight; });
    if (noLoad && state.metric !== 'reps') {
      state.autoSwitchedFrom = state.metric;
      state.metric = 'reps';
      $('chart-metric').value = 'reps';
    } else if (!noLoad && state.autoSwitchedFrom) {
      state.metric = state.autoSwitchedFrom;
      $('chart-metric').value = state.metric;
    }
    if (!noLoad) state.autoSwitchedFrom = null;
    var metric = state.metric;
    var goalLines = S.listGoals().filter(function (g) {
      return g.exercise === state.chartExercise && g.metric === metric;
    }).map(function (g) {
      return { value: g.target, color: EQUIPMENT_COLOR[g.equipment],
        label: 'Meta ' + EQUIPMENT_LABEL[g.equipment].toLowerCase() + ': ' + g.target + ' ' + METRICS[metric].unit };
    });
    GymChart.render($('chart'), buildSeries(entries, metric), {
      unit: METRICS[metric].unit,
      goals: entries.length ? goalLines : [],
      ariaLabel: METRICS[metric].label + ' de ' + state.chartExercise,
      emptyText: allEntries.length ? 'Sin datos para este ejercicio.' : 'Registra tu primer ejercicio para ver tu progreso aquí.'
    });
    renderStats(entries);
  }

  function renderHistory(allEntries) {
    var tbody = $('history-body');
    tbody.innerHTML = '';
    var rows = state.historyFilter
      ? allEntries.filter(function (e) { return e.exercise === state.historyFilter; })
      : allEntries;
    $('history-empty').hidden = rows.length > 0;
    rows.forEach(function (e) {
      var tr = document.createElement('tr');
      [formatDate(e.date), e.exercise, EQUIPMENT_LABEL[e.equipment],
        e.equipment === 'peso_corporal' && !e.weight ? '—' : e.weight + ' kg',
        e.sets + '×' + e.reps, e.notes].forEach(function (text, i) {
        var td = document.createElement('td');
        td.textContent = text;
        td.setAttribute('data-label', ['Fecha', 'Ejercicio', 'Implemento', 'Peso', 'Series×Reps', 'Notas'][i]);
        tr.appendChild(td);
      });
      var td = document.createElement('td');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-icon';
      btn.title = 'Eliminar registro';
      btn.setAttribute('aria-label', 'Eliminar registro de ' + e.exercise + ' del ' + formatDate(e.date));
      btn.textContent = '✕';
      btn.addEventListener('click', function () {
        if (confirm('¿Eliminar ' + e.exercise + ' del ' + formatDate(e.date) + '?')) {
          S.deleteEntry(e.id);
          refresh();
        }
      });
      td.appendChild(btn);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
  }

  // ---------- Objetivos ----------
  var DAY_MS = 86400000;

  function daysBetween(fromIso, toIso) {
    return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / DAY_MS);
  }

  // Calcula el estado de un objetivo a partir de los registros.
  function goalProgress(goal, allEntries) {
    var unit = METRICS[goal.metric].unit;
    var matching = allEntries.filter(function (e) {
      return e.exercise === goal.exercise && e.equipment === goal.equipment;
    }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    var best = null;
    var achievedOn = null;
    matching.forEach(function (e) {
      var v = metricValue(e, goal.metric);
      if (!best || v > best.value) best = { value: v, date: e.date };
      if (!achievedOn && v >= goal.target) achievedOn = e.date;
    });

    var current = best ? round1(best.value) : 0;
    var pct = Math.min(100, Math.round((current / goal.target) * 100));
    var remaining = round1(Math.max(0, goal.target - current));
    var t = today();
    var daysLeft = goal.deadline ? daysBetween(t, goal.deadline) : null;

    var status, message;
    if (achievedOn) {
      status = 'done';
      message = '¡Logrado el ' + formatDate(achievedOn) + '!';
    } else if (daysLeft !== null && daysLeft < 0) {
      status = 'overdue';
      message = 'Venció el ' + formatDate(goal.deadline) + '. Te faltaron ' + remaining + ' ' + unit + '.';
    } else {
      status = 'active';
      message = 'Te faltan ' + remaining + ' ' + unit + '.';
      if (daysLeft !== null) {
        var weeks = Math.max(daysLeft / 7, 1 / 7);
        message += ' Quedan ' + daysLeft + (daysLeft === 1 ? ' día' : ' días');
        if (current > 0) message += ' (≈ +' + round1(remaining / weeks) + ' ' + unit + '/semana)';
        message += '.';
      }
      if (!matching.length) message = 'Sin registros todavía para ' + goal.exercise + ' con ' + EQUIPMENT_LABEL[goal.equipment].toLowerCase() + '.';
    }
    return { current: current, pct: achievedOn ? 100 : pct, status: status, message: message, unit: unit };
  }

  function renderGoals(allEntries) {
    var list = $('goals-list');
    list.innerHTML = '';
    var goals = S.listGoals();
    $('goals-empty').hidden = goals.length > 0;
    $('goal-details').open = goals.length === 0 || $('goal-details').open;

    goals.forEach(function (g) {
      var p = goalProgress(g, allEntries);
      var card = document.createElement('article');
      card.className = 'goal ' + p.status;

      var head = document.createElement('div');
      head.className = 'goal-head';
      var title = document.createElement('strong');
      title.textContent = g.exercise + ' · ' + EQUIPMENT_LABEL[g.equipment];
      var meta = document.createElement('span');
      meta.className = 'goal-meta';
      meta.textContent = METRICS[g.metric].label + ': ' + g.target + ' ' + p.unit +
        (g.deadline ? ' · hasta ' + formatDate(g.deadline) : '');
      var titleBox = document.createElement('div');
      titleBox.appendChild(title);
      titleBox.appendChild(meta);

      var actions = document.createElement('div');
      actions.className = 'goal-actions';
      var view = document.createElement('button');
      view.type = 'button';
      view.textContent = 'Ver en gráfico';
      view.addEventListener('click', function () {
        state.chartExercise = g.exercise;
        state.metric = g.metric;
        state.autoSwitchedFrom = null;
        $('chart-metric').value = g.metric;
        refresh();
        $('chart-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn-icon';
      del.textContent = '✕';
      del.title = 'Eliminar objetivo';
      del.setAttribute('aria-label', 'Eliminar objetivo de ' + g.exercise);
      del.addEventListener('click', function () {
        if (confirm('¿Eliminar el objetivo de ' + g.exercise + '?')) { S.deleteGoal(g.id); refresh(); }
      });
      var hasEntries = allEntries.some(function (e) { return e.exercise === g.exercise; });
      if (hasEntries) actions.appendChild(view);
      actions.appendChild(del);
      head.appendChild(titleBox);
      head.appendChild(actions);

      var bar = document.createElement('div');
      bar.className = 'goal-bar';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-valuenow', String(p.pct));
      var fill = document.createElement('span');
      fill.style.width = p.pct + '%';
      bar.appendChild(fill);

      var foot = document.createElement('div');
      foot.className = 'goal-foot';
      var nums = document.createElement('span');
      nums.className = 'goal-nums';
      nums.textContent = p.current + ' / ' + g.target + ' ' + p.unit + ' · ' + p.pct + '%';
      var msg = document.createElement('span');
      msg.textContent = p.message;
      foot.appendChild(nums);
      foot.appendChild(msg);

      card.appendChild(head);
      card.appendChild(bar);
      card.appendChild(foot);
      list.appendChild(card);
    });
  }

  function onGoalSubmit(evt) {
    evt.preventDefault();
    var form = evt.target;
    var result = S.addGoal({
      exercise: form.exercise.value,
      equipment: form.equipment.value,
      metric: form.metric.value,
      target: form.target.value,
      deadline: form.deadline.value
    });
    var msg = $('goal-msg');
    if (!result.ok) {
      msg.className = 'msg error';
      msg.textContent = result.errors.join(' ');
      return;
    }
    if (result.goal.deadline && result.goal.deadline < today()) {
      msg.className = 'msg error';
      msg.textContent = 'Objetivo creado, pero la fecha límite ya pasó.';
    } else {
      msg.className = 'msg ok';
      msg.textContent = 'Objetivo creado: ' + result.goal.exercise + ' ' + result.goal.target + ' ' + METRICS[result.goal.metric].unit;
    }
    form.target.value = '';
    form.deadline.value = '';
    state.chartExercise = result.goal.exercise;
    refresh();
  }

  function refresh() {
    var entries = S.listEntries();
    renderExerciseLists(S.listExercises());
    renderChart(entries);
    renderGoals(entries);
    renderHistory(entries);
  }

  // ---------- Respaldo ----------
  function exportJson() {
    var blob = new Blob([S.exportData()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'apli-gym-respaldo-' + today() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var r = S.importData(String(reader.result), 'merge');
        alert('Importados ' + r.added + ' registros nuevos' + (r.skipped ? ' (' + r.skipped + ' omitidos por duplicados o inválidos)' : '') +
          (r.goalsAdded ? ' y ' + r.goalsAdded + ' objetivos.' : '.'));
        refresh();
      } catch (e) {
        alert('El archivo no es un respaldo válido de Apli-Gym.');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Inicio ----------
  function init() {
    $('date').value = today();
    $('entry-form').addEventListener('submit', onSubmit);
    document.querySelectorAll('input[name="equipment"]').forEach(function (r) {
      r.addEventListener('change', updateWeightHint);
    });
    updateWeightHint();

    var metricSel = $('chart-metric');
    Object.keys(METRICS).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = METRICS[k].label;
      metricSel.appendChild(o);
    });
    metricSel.value = state.metric;
    metricSel.addEventListener('change', function () { state.metric = metricSel.value; state.autoSwitchedFrom = null; refresh(); });
    $('chart-exercise').addEventListener('change', function (e) { state.chartExercise = e.target.value; refresh(); });
    $('history-filter').addEventListener('change', function (e) { state.historyFilter = e.target.value; refresh(); });

    $('goal-form').addEventListener('submit', onGoalSubmit);
    // Sugerir el implemento y el ejercicio que se está mirando en el gráfico.
    $('goal-details').addEventListener('toggle', function () {
      if ($('goal-details').open && !$('goal-exercise').value && state.chartExercise) {
        $('goal-exercise').value = state.chartExercise;
      }
    });
    $('goal-metric').addEventListener('change', function (e) {
      $('goal-target').step = e.target.value === 'reps' ? '1' : '0.5';
    });

    $('btn-export').addEventListener('click', exportJson);
    $('btn-import').addEventListener('click', function () { $('file-import').click(); });
    $('file-import').addEventListener('change', function (e) {
      if (e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { renderChart(S.listEntries()); }, 150);
    });

    refresh();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
