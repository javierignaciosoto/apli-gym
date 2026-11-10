/* Interfaz de la sección "Sincronización" y del indicador del encabezado. */
(function () {
  'use strict';

  var C = window.GymCloud;
  var $ = function (id) { return document.getElementById(id); };
  var pendingEmail = '';

  function setMsg(text, kind) {
    var m = $('cloud-msg');
    m.className = 'msg' + (kind ? ' ' + kind : '');
    m.textContent = text || '';
  }

  function busy(form, on) {
    form.querySelectorAll('button, input').forEach(function (el) { el.disabled = on; });
  }

  function ago(isoStr) {
    if (!isoStr) return 'nunca';
    var s = Math.round((Date.now() - Date.parse(isoStr)) / 1000);
    if (s < 60) return 'hace un momento';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    return new Date(isoStr).toLocaleString('es');
  }

  function render(st) {
    $('cloud-config').hidden = st.state !== 'unconfigured';
    $('cloud-login').hidden = st.state !== 'signed_out';
    $('cloud-account').hidden = !st.email;
    $('cloud-advanced').hidden = !st.config || !!st.email;
    $('cloud-reset-config').hidden = !st.config || st.config.fromFile;
    if (st.config) {
      $('cloud-server').textContent = 'Proyecto: ' + st.config.url +
        (st.config.fromFile ? ' (definido en js/config.js)' : ' (guardado en este dispositivo)');
    }

    if (st.email) {
      $('cloud-user').textContent = st.email;
      var detail = 'Última sincronización: ' + ago(st.lastSync) + '.';
      if (st.pending) detail += ' Cambios pendientes de subir: ' + st.pending + '.';
      $('cloud-detail').textContent = detail;
      $('cloud-sync-now').disabled = st.state === 'syncing';
      if (st.state === 'error' || st.state === 'offline') setMsg(st.message, 'error');
      else if (st.state === 'syncing') setMsg('Sincronizando…');
      else if (st.state === 'ok') setMsg('');
    }

    // Indicador del encabezado
    var chip = $('sync-chip');
    chip.hidden = !st.email;
    var label = {
      syncing: '🔄 Sincronizando…',
      offline: '📴 Sin conexión' + (st.pending ? ' · ' + st.pending + ' pendientes' : ''),
      error: '⚠️ Error de sincronización',
      ok: st.pending ? '⏳ ' + st.pending + ' cambios pendientes' : '☁️ Sincronizado'
    }[st.state] || '☁️ Nube';
    chip.textContent = label;
    chip.className = 'sync-chip ' + st.state;
  }

  function init() {
    $('cloud-config-form').addEventListener('submit', function (e) {
      e.preventDefault();
      try {
        C.setConfig($('cloud-url').value, $('cloud-key').value);
        setMsg('Configuración guardada. Ahora entra con tu correo.', 'ok');
      } catch (err) {
        setMsg(err.message, 'error');
      }
    });

    $('cloud-email-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target;
      var email = $('cloud-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMsg('Escribe un correo válido.', 'error'); return; }
      busy(form, true);
      setMsg('Enviando código…');
      C.sendCode(email).then(function () {
        pendingEmail = email;
        $('cloud-email-form').hidden = true;
        $('cloud-code-form').hidden = false;
        $('cloud-code').value = '';
        $('cloud-code').focus();
        setMsg('Te enviamos un código a ' + email + '. Revisa también la carpeta de spam.', 'ok');
      }, function (err) {
        setMsg('No se pudo enviar el código: ' + err.message, 'error');
      }).then(function () { busy(form, false); });
    });

    $('cloud-code-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target;
      var code = $('cloud-code').value.replace(/\s+/g, '');
      if (!/^\d{6,10}$/.test(code)) { setMsg('El código son solo números (6 dígitos o más).', 'error'); return; }
      busy(form, true);
      setMsg('Verificando…');
      C.verifyCode(pendingEmail, code).then(function () {
        $('cloud-email-form').hidden = false;
        $('cloud-code-form').hidden = true;
        setMsg('¡Listo! Tus datos ahora se sincronizan.', 'ok');
      }, function (err) {
        setMsg('Código incorrecto o vencido: ' + err.message, 'error');
      }).then(function () { busy(form, false); });
    });

    $('cloud-code-back').addEventListener('click', function () {
      $('cloud-email-form').hidden = false;
      $('cloud-code-form').hidden = true;
      setMsg('');
    });

    $('cloud-sync-now').addEventListener('click', function () { C.sync(); });
    $('cloud-signout').addEventListener('click', function () {
      if (!confirm('¿Cerrar sesión? Tus datos quedan guardados en la nube y se borran de este dispositivo.')) return;
      var done = function () { setMsg('Sesión cerrada. Tus datos siguen en la nube.', 'ok'); };
      C.signOut().then(done, function (err) {
        if (err.code !== 'pending') { setMsg(err.message, 'error'); return; }
        if (confirm(err.message + ' Si cierras sesión ahora se perderán. ¿Cerrar de todas formas?')) {
          C.signOut({ force: true }).then(done, function (e) { setMsg(e.message, 'error'); });
        }
      });
    });
    $('cloud-reset-config').addEventListener('click', function () {
      if (confirm('¿Borrar la configuración de Supabase de este dispositivo?')) C.clearConfig();
    });
    $('sync-chip').addEventListener('click', function () {
      $('cloud-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      C.sync();
    });

    C.onRemoteData(function () { if (window.GymApp) window.GymApp.refresh(); });
    C.onStatus(render);
    setInterval(function () { render(C.status()); }, 30000); // refresca "hace X min"
    C.start();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
