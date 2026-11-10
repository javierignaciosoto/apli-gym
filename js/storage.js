/*
 * Capa de almacenamiento de Apli-Gym.
 * Es el ÚNICO archivo que conoce dónde viven los datos (hoy: localStorage).
 * Para migrar a IndexedDB o a un backend, basta con reimplementar esta API.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'apli-gym:data';
  var SCHEMA_VERSION = 1;
  var EQUIPMENT = ['barra', 'mancuernas', 'peso_corporal'];
  var GOAL_METRICS = ['weight', 'e1rm', 'reps'];

  function emptyData() {
    return { schemaVersion: SCHEMA_VERSION, entries: [], goals: [] };
  }

  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function migrate(data) {
    // Punto único para futuras migraciones de esquema (v1 -> v2, etc.).
    if (!data || typeof data !== 'object') return emptyData();
    if (!Array.isArray(data.entries)) data.entries = [];
    if (!Array.isArray(data.goals)) data.goals = [];
    data.schemaVersion = SCHEMA_VERSION;
    return data;
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      return raw ? migrate(JSON.parse(raw)) : emptyData();
    } catch (e) {
      console.error('No se pudieron leer los datos guardados', e);
      return emptyData();
    }
  }

  function save(data) {
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function toNumber(value, fallback) {
    var n = parseFloat(String(value).replace(',', '.'));
    return isFinite(n) ? n : fallback;
  }

  function normalizeExercise(name) {
    var trimmed = String(name || '').trim().replace(/\s+/g, ' ');
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }

  function validateEntry(input) {
    var errors = [];
    var entry = {
      date: String(input.date || ''),
      exercise: normalizeExercise(input.exercise),
      equipment: String(input.equipment || ''),
      weight: toNumber(input.weight, 0),
      sets: Math.round(toNumber(input.sets, 1)),
      reps: Math.round(toNumber(input.reps, 0)),
      notes: String(input.notes || '').trim()
    };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) errors.push('La fecha no es válida.');
    if (!entry.exercise) errors.push('Indica el ejercicio.');
    if (EQUIPMENT.indexOf(entry.equipment) === -1) errors.push('Elige el implemento.');
    if (entry.weight < 0) errors.push('El peso no puede ser negativo.');
    if (entry.equipment !== 'peso_corporal' && entry.weight <= 0) {
      errors.push('Indica el peso levantado.');
    }
    if (entry.sets < 1) errors.push('Las series deben ser al menos 1.');
    if (entry.reps < 1) errors.push('Las repeticiones deben ser al menos 1.');

    return { entry: entry, errors: errors };
  }

  function validateGoal(input) {
    var errors = [];
    var goal = {
      exercise: normalizeExercise(input.exercise),
      equipment: String(input.equipment || ''),
      metric: String(input.metric || 'weight'),
      target: toNumber(input.target, 0),
      deadline: String(input.deadline || '')
    };
    if (!goal.exercise) errors.push('Indica el ejercicio del objetivo.');
    if (EQUIPMENT.indexOf(goal.equipment) === -1) errors.push('Elige el implemento.');
    if (GOAL_METRICS.indexOf(goal.metric) === -1) errors.push('Elige la métrica.');
    if (!(goal.target > 0)) errors.push('La meta debe ser mayor que 0.');
    if (goal.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(goal.deadline)) errors.push('La fecha límite no es válida.');
    return { goal: goal, errors: errors };
  }

  function byDateDesc(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1;
  }

  var GymStorage = {
    EQUIPMENT: EQUIPMENT,
    GOAL_METRICS: GOAL_METRICS,

    listEntries: function () {
      return load().entries.slice().sort(byDateDesc);
    },

    listExercises: function () {
      var seen = {};
      load().entries.forEach(function (e) { seen[e.exercise] = true; });
      return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    },

    addEntry: function (input) {
      var result = validateEntry(input);
      if (result.errors.length) return { ok: false, errors: result.errors };
      var data = load();
      var entry = Object.assign({ id: uuid(), createdAt: new Date().toISOString() }, result.entry);
      data.entries.push(entry);
      save(data);
      return { ok: true, entry: entry };
    },

    deleteEntry: function (id) {
      var data = load();
      data.entries = data.entries.filter(function (e) { return e.id !== id; });
      save(data);
    },

    listGoals: function () {
      return load().goals.slice().sort(function (a, b) {
        // Primero los que tienen fecha límite más cercana; sin fecha al final.
        if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
        if (!!a.deadline !== !!b.deadline) return a.deadline ? -1 : 1;
        return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
      });
    },

    addGoal: function (input) {
      var result = validateGoal(input);
      if (result.errors.length) return { ok: false, errors: result.errors };
      var data = load();
      var goal = Object.assign({ id: uuid(), createdAt: new Date().toISOString() }, result.goal);
      data.goals.push(goal);
      save(data);
      return { ok: true, goal: goal };
    },

    deleteGoal: function (id) {
      var data = load();
      data.goals = data.goals.filter(function (g) { return g.id !== id; });
      save(data);
    },

    exportData: function () {
      return JSON.stringify(load(), null, 2);
    },

    importData: function (json, mode) {
      var incoming = migrate(JSON.parse(json));
      var valid = [];
      incoming.entries.forEach(function (raw) {
        var r = validateEntry(raw);
        if (!r.errors.length) {
          valid.push(Object.assign({ id: raw.id || uuid(), createdAt: raw.createdAt || new Date().toISOString() }, r.entry));
        }
      });
      var data = mode === 'replace' ? emptyData() : load();
      var existing = {};
      data.entries.forEach(function (e) { existing[e.id] = true; });
      var added = 0;
      valid.forEach(function (e) {
        if (!existing[e.id]) { data.entries.push(e); added++; }
      });
      var existingGoals = {};
      data.goals.forEach(function (g) { existingGoals[g.id] = true; });
      var goalsAdded = 0;
      incoming.goals.forEach(function (raw) {
        var r = validateGoal(raw);
        var id = raw.id || uuid();
        if (!r.errors.length && !existingGoals[id]) {
          data.goals.push(Object.assign({ id: id, createdAt: raw.createdAt || new Date().toISOString() }, r.goal));
          goalsAdded++;
        }
      });
      save(data);
      return { added: added, skipped: incoming.entries.length - added, goalsAdded: goalsAdded };
    },

    clearAll: function () {
      save(emptyData());
    }
  };

  global.GymStorage = GymStorage;
})(window);
