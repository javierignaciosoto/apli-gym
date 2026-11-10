/*
 * Capa de almacenamiento de Apli-Gym.
 * Es el ÚNICO archivo que conoce dónde viven los datos locales (localStorage).
 *
 * Esquema v2 (sincronización): cada registro y objetivo lleva
 *   updatedAt  -> fecha ISO de su último cambio (para "gana el más reciente")
 *   deleted    -> borrado suave, para que el borrado llegue a otros dispositivos
 *   _dirty     -> cambio local aún no subido a la nube
 * Los registros con deleted=true nunca se muestran ni se exportan.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'apli-gym:data';
  var SCHEMA_VERSION = 2;
  var EQUIPMENT = ['barra', 'mancuernas', 'peso_corporal'];
  var GOAL_METRICS = ['weight', 'e1rm', 'reps'];
  var listeners = [];

  function emptyData() {
    return { schemaVersion: SCHEMA_VERSION, entries: [], goals: [], sync: { lastPull: {} } };
  }

  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function nowIso() { return new Date().toISOString(); }

  function migrate(data) {
    if (!data || typeof data !== 'object') return emptyData();
    if (!Array.isArray(data.entries)) data.entries = [];
    if (!Array.isArray(data.goals)) data.goals = [];
    if (!data.sync || typeof data.sync !== 'object') data.sync = {};
    if (!data.sync.lastPull || typeof data.sync.lastPull !== 'object') data.sync.lastPull = {};

    // v1 -> v2: todo lo existente queda pendiente de subir en la primera sincronización.
    if (!data.schemaVersion || data.schemaVersion < 2) {
      data.entries.concat(data.goals).forEach(function (r) {
        if (!r.updatedAt) r.updatedAt = r.createdAt || nowIso();
        if (r.deleted == null) r.deleted = false;
        r._dirty = true;
      });
    }
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

  function save(data, opts) {
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (!(opts && opts.silent)) {
      listeners.forEach(function (fn) {
        try { fn(); } catch (e) { console.error(e); }
      });
    }
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

  function alive(r) { return !r.deleted; }

  // Quita los campos internos antes de entregar un registro a la interfaz o al exportar.
  function publicCopy(r) {
    var c = Object.assign({}, r);
    delete c._dirty;
    delete c.deleted;
    return c;
  }

  function byDateDesc(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1;
  }

  function newRecord(fields) {
    var t = nowIso();
    return Object.assign({ id: uuid(), createdAt: t }, fields, { updatedAt: t, deleted: false, _dirty: true });
  }

  function softDelete(list, id) {
    list.forEach(function (r) {
      if (r.id === id && !r.deleted) {
        r.deleted = true;
        r.updatedAt = nowIso();
        r._dirty = true;
      }
    });
  }

  var COLLECTIONS = ['entries', 'goals'];

  var GymStorage = {
    EQUIPMENT: EQUIPMENT,
    GOAL_METRICS: GOAL_METRICS,
    COLLECTIONS: COLLECTIONS,

    /** Avisa cada vez que cambian los datos (se usa para sincronizar). */
    onChange: function (fn) { listeners.push(fn); },

    listEntries: function () {
      return load().entries.filter(alive).map(publicCopy).sort(byDateDesc);
    },

    listExercises: function () {
      var seen = {};
      load().entries.filter(alive).forEach(function (e) { seen[e.exercise] = true; });
      return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    },

    addEntry: function (input) {
      var result = validateEntry(input);
      if (result.errors.length) return { ok: false, errors: result.errors };
      var data = load();
      var entry = newRecord(result.entry);
      data.entries.push(entry);
      save(data);
      return { ok: true, entry: publicCopy(entry) };
    },

    deleteEntry: function (id) {
      var data = load();
      softDelete(data.entries, id);
      save(data);
    },

    listGoals: function () {
      return load().goals.filter(alive).map(publicCopy).sort(function (a, b) {
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
      var goal = newRecord(result.goal);
      data.goals.push(goal);
      save(data);
      return { ok: true, goal: publicCopy(goal) };
    },

    deleteGoal: function (id) {
      var data = load();
      softDelete(data.goals, id);
      save(data);
    },

    exportData: function () {
      var data = load();
      return JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        entries: data.entries.filter(alive).map(publicCopy),
        goals: data.goals.filter(alive).map(publicCopy)
      }, null, 2);
    },

    importData: function (json, mode) {
      var incoming = JSON.parse(json);
      if (!incoming || typeof incoming !== 'object') throw new Error('Formato inválido');
      var inEntries = Array.isArray(incoming.entries) ? incoming.entries.filter(alive) : [];
      var inGoals = Array.isArray(incoming.goals) ? incoming.goals.filter(alive) : [];

      var data = load();
      if (mode === 'replace') {
        COLLECTIONS.forEach(function (c) { data[c].forEach(function (r) { softDelete(data[c], r.id); }); });
      }

      function merge(list, items, validate, key) {
        var existing = {};
        list.forEach(function (r) { if (!r.deleted) existing[r.id] = true; });
        var added = 0;
        items.forEach(function (raw) {
          var r = validate(raw);
          var id = raw.id || uuid();
          if (r.errors.length || existing[id]) return;
          // Si existía borrado con el mismo id, se reemplaza.
          for (var i = list.length - 1; i >= 0; i--) if (list[i].id === id) list.splice(i, 1);
          list.push(Object.assign({ id: id, createdAt: raw.createdAt || nowIso() }, r[key],
            { updatedAt: nowIso(), deleted: false, _dirty: true }));
          existing[id] = true;
          added++;
        });
        return added;
      }

      var added = merge(data.entries, inEntries, validateEntry, 'entry');
      var goalsAdded = merge(data.goals, inGoals, validateGoal, 'goal');
      save(data);
      return { added: added, skipped: inEntries.length - added, goalsAdded: goalsAdded };
    },

    clearAll: function () {
      save(emptyData());
    },

    // ---------- API para la sincronización (js/cloud.js) ----------

    /** Registros con cambios locales aún no subidos, por colección. */
    getDirty: function (collection) {
      return load()[collection].filter(function (r) { return r._dirty; }).map(function (r) {
        var c = Object.assign({}, r);
        delete c._dirty;
        return c;
      });
    },

    /** Marca como subidos los registros indicados, si no cambiaron mientras se subían. */
    markSynced: function (collection, records) {
      var data = load();
      var sent = {};
      records.forEach(function (r) { sent[r.id] = r.updatedAt; });
      data[collection].forEach(function (r) {
        if (r._dirty && sent[r.id] === r.updatedAt) delete r._dirty;
      });
      save(data, { silent: true });
    },

    /**
     * Aplica cambios bajados de la nube. Regla: gana la versión con updatedAt más reciente.
     * Devuelve cuántos registros cambiaron localmente.
     */
    applyRemote: function (collection, records, lastPull) {
      var data = load();
      var byId = {};
      data[collection].forEach(function (r, i) { byId[r.id] = i; });
      var changed = 0;
      records.forEach(function (remote) {
        var i = byId[remote.id];
        var local = i == null ? null : data[collection][i];
        if (local && local.updatedAt >= remote.updatedAt) return;
        var copy = Object.assign({}, remote);
        if (i == null) {
          byId[copy.id] = data[collection].length;
          data[collection].push(copy);
        } else {
          data[collection][i] = copy;
        }
        changed++;
      });
      if (lastPull) data.sync.lastPull[collection] = lastPull;
      save(data, { silent: true });
      return changed;
    },

    getLastPull: function (collection) {
      return load().sync.lastPull[collection] || null;
    },

    /** Al iniciar sesión: todo lo local queda pendiente de subir y se vuelve a bajar todo. */
    resetSyncState: function () {
      var data = load();
      data.sync.lastPull = {};
      COLLECTIONS.forEach(function (c) { data[c].forEach(function (r) { r._dirty = true; }); });
      save(data, { silent: true });
    },

    pendingCount: function () {
      var data = load();
      return data.entries.concat(data.goals).filter(function (r) { return r._dirty; }).length;
    }
  };

  global.GymStorage = GymStorage;
})(window);
