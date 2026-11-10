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

  function byDateDesc(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1;
  }

  var GymStorage = {
    EQUIPMENT: EQUIPMENT,

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
      if (mode === 'replace') data.goals = incoming.goals;
      save(data);
      return { added: added, skipped: incoming.entries.length - added };
    },

    clearAll: function () {
      save(emptyData());
    }
  };

  global.GymStorage = GymStorage;
})(window);
