/*
 * Funciones de app instalable (PWA):
 *  - registra el service worker (uso sin internet)
 *  - muestra el botón "Instalar" (Android/Chrome/Edge) o instrucciones (iPhone)
 *  - pide almacenamiento persistente para que el navegador no borre los datos
 */
(function () {
  'use strict';

  var DISMISS_KEY = 'apli-gym:install-dismissed';
  var isHttp = location.protocol === 'https:' || location.protocol === 'http:';
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if ('serviceWorker' in navigator && isHttp) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        console.warn('No se pudo registrar el service worker', e);
      });
    });
  }

  // Pide que los datos no se borren automáticamente (sobre todo en móviles con poco espacio).
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(function (already) {
      if (!already) navigator.storage.persist();
    }).catch(function () {});
  }

  if (isStandalone) return;

  var bar = document.getElementById('install-bar');
  var btn = document.getElementById('btn-install');
  var hint = document.getElementById('ios-hint');
  var dismissed = false;
  try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) {}
  var deferredPrompt = null;

  function hide() {
    bar.hidden = true;
  }

  document.getElementById('btn-install-close').addEventListener('click', function () {
    hide();
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
  });

  // Android / Chrome / Edge: el navegador avisa cuando la app se puede instalar.
  window.addEventListener('beforeinstallprompt', function (evt) {
    evt.preventDefault();
    deferredPrompt = evt;
    if (dismissed) return;
    btn.hidden = false;
    hint.hidden = true;
    bar.hidden = false;
  });

  btn.addEventListener('click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(function () {
      deferredPrompt = null;
      hide();
    });
  });

  window.addEventListener('appinstalled', hide);

  // iPhone/iPad (Safari): no hay botón de instalación, se muestran instrucciones.
  var ua = navigator.userAgent;
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && !dismissed && isHttp) {
    hint.hidden = false;
    bar.hidden = false;
  }
})();
