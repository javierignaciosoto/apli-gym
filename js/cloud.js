/*
 * Sincronización en la nube de Apli-Gym (Supabase), sin librerías externas.
 *
 * - Inicio de sesión con código de un solo uso enviado por correo.
 * - "Offline first": la app siempre trabaja con los datos locales; esto solo
 *   sube los cambios pendientes y baja los de otros dispositivos.
 * - Conflictos: gana la versión con el cambio más reciente (updatedAt).
 * - Se sincroniza al abrir, al guardar algo, al recuperar internet y al volver a la app.
 */
(function (global) {
  'use strict';

  var S = global.GymStorage;
  var CONFIG_KEY = 'apli-gym:cloud-config';
  var SESSION_KEY = 'apli-gym:session';
  var LAST_SYNC_KEY = 'apli-gym:last-sync';
  var PAGE = 1000;

  // ---------- Configuración ----------
  function getConfig() {
    var base = global.APLI_GYM_CONFIG || {};
    var local = readJson(CONFIG_KEY) || {};
    var url = (local.supabaseUrl || base.supabaseUrl || '').trim().replace(/\/+$/, '');
    var key = (local.supabaseKey || base.supabaseKey || '').trim();
    return url && key ? { url: url, key: key, fromFile: !local.supabaseUrl } : null;
  }

  function setConfig(url, key) {
    url = String(url || '').trim().replace(/\/+$/, '');
    key = String(key || '').trim();
    if (!/^https:\/\/[^\s/]+$/.test(url)) throw new Error('La URL debe ser como https://xxxx.supabase.co');
    if (key.length < 20) throw new Error('La clave pública no parece válida.');
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ supabaseUrl: url, supabaseKey: key }));
  }

  function clearConfig() { localStorage.removeItem(CONFIG_KEY); }

  function readJson(k) {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }

  // ---------- Sesión ----------
  function getSession() { return readJson(SESSION_KEY); }

  function saveSession(res, email) {
    var s = {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      expires_at: res.expires_at || Math.floor(Date.now() / 1000) + (res.expires_in || 3600),
      email: (res.user && res.user.email) || email
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    return s;
  }

  function CloudError(message, status, code) {
    var e = new Error(message);
    e.status = status;
    e.code = code;
    return e;
  }

  function request(path, opts) {
    var cfg = getConfig();
    if (!cfg) return Promise.reject(CloudError('La nube no está configurada.'));
    opts = opts || {};
    var headers = Object.assign({ apikey: cfg.key, 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(cfg.url + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
        if (!res.ok) {
          var msg = (data && (data.msg || data.message || data.error_description || data.error)) || ('Error ' + res.status);
          throw CloudError(msg, res.status, data && (data.code || data.error_code));
        }
        return data;
      });
    }, function () {
      throw CloudError('Sin conexión con el servidor.', 0, 'network');
    });
  }

  function refreshSession(s) {
    return request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: { refresh_token: s.refresh_token }
    }).then(function (res) { return saveSession(res, s.email); }, function (err) {
      if (err.status >= 400 && err.status < 500) {
        localStorage.removeItem(SESSION_KEY);
        throw CloudError('Tu sesión expiró. Vuelve a entrar.', 401, 'session_expired');
      }
      throw err;
    });
  }

  function validSession(force) {
    var s = getSession();
    if (!s) return Promise.reject(CloudError('No has iniciado sesión.', 401, 'no_session'));
    if (!force && s.expires_at - 60 > Date.now() / 1000) return Promise.resolve(s);
    return refreshSession(s);
  }

  function authed(path, opts) {
    function run(s) {
      var o = Object.assign({}, opts);
      o.headers = Object.assign({ Authorization: 'Bearer ' + s.access_token }, (opts && opts.headers) || {});
      return request(path, o);
    }
    return validSession(false).then(function (s) {
      return run(s).catch(function (err) {
        if (err.status === 401) return validSession(true).then(run);
        throw err;
      });
    });
  }

  // ---------- Autenticación ----------
  function sendCode(email) {
    return request('/auth/v1/otp', { method: 'POST', body: { email: email, create_user: true } });
  }

  function verifyCode(email, code) {
    return request('/auth/v1/verify', {
      method: 'POST', body: { type: 'email', email: email, token: String(code).trim() }
    }).then(function (res) {
      saveSession(res, email);
      S.resetSyncState(); // lo local se sube a la cuenta y se baja todo lo de la nube
      emit();
      return sync();
    });
  }

  /*
   * Cerrar sesión: primero intenta subir lo pendiente; luego borra los datos de este
   * dispositivo (quedan en la nube), para que no se mezclen con otra cuenta.
   * Si quedan cambios sin subir y no se pasa force, falla con code 'pending'.
   */
  function signOut(opts) {
    var force = opts && opts.force;
    return sync().then(function () {
      var pending = S.pendingCount();
      if (pending && !force) throw CloudError('Hay ' + pending + ' cambios sin subir.', 0, 'pending');
      var s = getSession();
      var done = function () {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(LAST_SYNC_KEY);
        status.lastSync = null;
        S.clearAll();
        status.state = 'signed_out';
        status.message = '';
        dataListeners.forEach(function (fn) { fn(); });
        emit();
      };
      if (!s) { done(); return; }
      return request('/auth/v1/logout', {
        method: 'POST', headers: { Authorization: 'Bearer ' + s.access_token }
      }).then(done, done);
    });
  }

  // ---------- Conversión local <-> nube ----------
  function iso(t) { return t ? new Date(t).toISOString() : t; }

  var MAP = {
    entries: {
      toRemote: function (r) {
        return { id: r.id, date: r.date, exercise: r.exercise, equipment: r.equipment, weight: r.weight,
          sets: r.sets, reps: r.reps, notes: r.notes || '', created_at: r.createdAt, updated_at: r.updatedAt, deleted: !!r.deleted };
      },
      toLocal: function (r) {
        return { id: r.id, date: r.date, exercise: r.exercise, equipment: r.equipment, weight: Number(r.weight),
          sets: Number(r.sets), reps: Number(r.reps), notes: r.notes || '', createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), deleted: !!r.deleted };
      }
    },
    goals: {
      toRemote: function (r) {
        return { id: r.id, exercise: r.exercise, equipment: r.equipment, metric: r.metric, target: r.target,
          deadline: r.deadline || null, created_at: r.createdAt, updated_at: r.updatedAt, deleted: !!r.deleted };
      },
      toLocal: function (r) {
        return { id: r.id, exercise: r.exercise, equipment: r.equipment, metric: r.metric, target: Number(r.target),
          deadline: r.deadline || '', createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), deleted: !!r.deleted };
      }
    }
  };

  function pull(collection) {
    var changed = 0;
    function page(since) {
      var q = '/rest/v1/' + collection + '?select=*&order=synced_at.asc&limit=' + PAGE +
        (since ? '&synced_at=gt.' + encodeURIComponent(since) : '');
      return authed(q).then(function (rows) {
        rows = rows || [];
        var last = rows.length ? rows[rows.length - 1].synced_at : since;
        changed += S.applyRemote(collection, rows.map(MAP[collection].toLocal), last);
        return rows.length === PAGE ? page(last) : changed;
      });
    }
    return page(S.getLastPull(collection));
  }

  function push(collection) {
    var dirty = S.getDirty(collection);
    if (!dirty.length) return Promise.resolve(0);
    var chunks = [];
    for (var i = 0; i < dirty.length; i += 500) chunks.push(dirty.slice(i, i + 500));
    return chunks.reduce(function (p, chunk) {
      return p.then(function () {
        return authed('/rest/v1/' + collection + '?on_conflict=id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: chunk.map(MAP[collection].toRemote)
        }).then(function () { S.markSynced(collection, chunk); });
      });
    }, Promise.resolve()).then(function () { return dirty.length; });
  }

  // ---------- Estado y sincronización ----------
  var status = { state: 'idle', message: '', lastSync: localStorage.getItem(LAST_SYNC_KEY) };
  var listeners = [];
  var dataListeners = [];
  var running = null;
  var again = false;

  function snapshot() {
    var cfg = getConfig();
    var s = getSession();
    var state = status.state;
    if (!cfg) state = 'unconfigured';
    else if (!s) state = 'signed_out';
    else if (state === 'signed_out' || state === 'unconfigured' || state === 'idle') state = 'ok';
    return {
      state: state,
      message: status.message,
      email: s && s.email,
      lastSync: status.lastSync,
      pending: S.pendingCount(),
      config: cfg
    };
  }

  function emit() {
    var snap = snapshot();
    listeners.forEach(function (fn) { try { fn(snap); } catch (e) { console.error(e); } });
  }

  function friendly(err) {
    if (err.code === 'network') return 'Sin conexión. Los cambios se subirán al volver internet.';
    if (err.code === 'PGRST205' || err.code === '42P01' || err.status === 404) {
      return 'Faltan las tablas en Supabase: ejecuta supabase/schema.sql en el SQL Editor.';
    }
    return 'No se pudo sincronizar (' + (err.message || 'error desconocido') + '). Se reintentará automáticamente.';
  }

  function sync() {
    if (!getConfig() || !getSession()) { emit(); return Promise.resolve(); }
    if (running) { again = true; return running; }
    if (navigator.onLine === false) {
      status.state = 'offline';
      status.message = 'Sin conexión. Los cambios se subirán al volver internet.';
      emit();
      return Promise.resolve();
    }
    status.state = 'syncing';
    status.message = '';
    emit();

    var changed = 0;
    running = S.COLLECTIONS.reduce(function (p, c) {
      return p.then(function () { return pull(c); }).then(function (n) { changed += n; });
    }, Promise.resolve()).then(function () {
      return S.COLLECTIONS.reduce(function (p, c) {
        return p.then(function () { return push(c); });
      }, Promise.resolve());
    }).then(function () {
      status.state = 'ok';
      status.lastSync = new Date().toISOString();
      localStorage.setItem(LAST_SYNC_KEY, status.lastSync);
    }, function (err) {
      console.warn('Sincronización', err);
      status.state = err.code === 'network' ? 'offline' : 'error';
      status.message = friendly(err);
    }).then(function () {
      running = null;
      if (changed) dataListeners.forEach(function (fn) { fn(); });
      emit();
      if (again) { again = false; return sync(); }
    });
    return running;
  }

  // Sincronización automática
  var timer = null;
  function scheduleSync(ms) {
    clearTimeout(timer);
    timer = setTimeout(sync, ms == null ? 1500 : ms);
  }

  S.onChange(function () { emit(); scheduleSync(); });
  global.addEventListener('online', function () { scheduleSync(0); });
  global.addEventListener('offline', function () { status.state = 'offline'; emit(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') scheduleSync(0);
  });
  setInterval(function () { if (document.visibilityState === 'visible') sync(); }, 5 * 60 * 1000);

  global.GymCloud = {
    getConfig: getConfig,
    setConfig: function (url, key) { setConfig(url, key); emit(); scheduleSync(0); },
    clearConfig: function () { clearConfig(); emit(); },
    sendCode: sendCode,
    verifyCode: verifyCode,
    signOut: signOut,
    sync: sync,
    status: snapshot,
    onStatus: function (fn) { listeners.push(fn); fn(snapshot()); },
    onRemoteData: function (fn) { dataListeners.push(fn); },
    start: function () { scheduleSync(0); }
  };
})(window);
