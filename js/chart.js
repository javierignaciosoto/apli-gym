/*
 * Gráfico de líneas en SVG, sin dependencias.
 * GymChart.render(container, series, { unit })
 *   series: [{ label, color, points: [{ date: 'YYYY-MM-DD', value: Number, detail: String }] }]
 */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var DAY = 86400000;

  function el(name, attrs, text) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text != null) node.textContent = text;
    return node;
  }

  function toTime(date) {
    var p = date.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }

  function formatDate(t, withYear) {
    var d = new Date(t);
    var months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    var s = d.getUTCDate() + ' ' + months[d.getUTCMonth()];
    return withYear ? s + ' ' + String(d.getUTCFullYear()).slice(2) : s;
  }

  function niceStep(range, targetTicks) {
    var rough = range / targetTicks;
    var pow = Math.pow(10, Math.floor(Math.log10(rough)));
    var n = rough / pow;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * pow;
  }

  function fmt(v) {
    return Math.round(v * 10) / 10 + '';
  }

  function render(container, series, opts) {
    opts = opts || {};
    var unit = opts.unit || '';
    container.innerHTML = '';

    var all = [];
    series.forEach(function (s) { s.points.forEach(function (p) { all.push(p); }); });
    if (!all.length) {
      var empty = document.createElement('p');
      empty.className = 'chart-empty';
      empty.textContent = opts.emptyText || 'Aún no hay datos para graficar.';
      container.appendChild(empty);
      return;
    }

    var width = Math.max(container.clientWidth || 600, 280);
    var height = opts.height || 300;
    var m = { top: 16, right: 18, bottom: 36, left: 48 };
    var w = width - m.left - m.right;
    var h = height - m.top - m.bottom;

    var times = all.map(function (p) { return toTime(p.date); });
    var tMin = Math.min.apply(null, times);
    var tMax = Math.max.apply(null, times);
    if (tMin === tMax) { tMin -= 3 * DAY; tMax += 3 * DAY; }

    var values = all.map(function (p) { return p.value; });
    var vMin = Math.min.apply(null, values);
    var vMax = Math.max.apply(null, values);
    var pad = (vMax - vMin) * 0.15 || Math.max(vMax * 0.1, 1);
    vMin = Math.max(0, vMin - pad);
    vMax = vMax + pad;
    var step = niceStep(vMax - vMin, 5);
    vMin = Math.floor(vMin / step) * step;
    vMax = Math.ceil(vMax / step) * step;

    function x(t) { return m.left + ((t - tMin) / (tMax - tMin)) * w; }
    function y(v) { return m.top + h - ((v - vMin) / (vMax - vMin)) * h; }

    var svg = el('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      width: '100%',
      height: height,
      role: 'img',
      'aria-label': opts.ariaLabel || 'Gráfico de progreso',
      class: 'chart-svg'
    });

    // Grilla y eje Y
    for (var v = vMin; v <= vMax + step / 2; v += step) {
      svg.appendChild(el('line', { x1: m.left, x2: m.left + w, y1: y(v), y2: y(v), class: 'grid' }));
      svg.appendChild(el('text', { x: m.left - 8, y: y(v) + 4, class: 'axis-label', 'text-anchor': 'end' }, fmt(v)));
    }
    svg.appendChild(el('text', { x: 4, y: m.top - 4, class: 'axis-unit' }, unit));

    // Eje X: hasta ~6 etiquetas de fecha
    var spanDays = (tMax - tMin) / DAY;
    var withYear = new Date(tMin).getUTCFullYear() !== new Date(tMax).getUTCFullYear();
    var ticks = Math.min(6, Math.max(2, Math.floor(w / 90)));
    for (var i = 0; i <= ticks; i++) {
      var t = tMin + (spanDays * DAY * i) / ticks;
      t = Math.round(t / DAY) * DAY;
      svg.appendChild(el('text', { x: x(t), y: m.top + h + 22, class: 'axis-label', 'text-anchor': 'middle' }, formatDate(t, withYear)));
    }
    svg.appendChild(el('line', { x1: m.left, x2: m.left + w, y1: m.top + h, y2: m.top + h, class: 'axis' }));

    // Tooltip
    var tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;

    function showTip(evt, s, p) {
      tip.innerHTML = '';
      var title = document.createElement('strong');
      title.textContent = fmt(p.value) + ' ' + unit;
      var line1 = document.createElement('div');
      line1.textContent = formatDate(toTime(p.date), true) + ' · ' + s.label;
      tip.appendChild(title);
      tip.appendChild(line1);
      if (p.detail) {
        var line2 = document.createElement('div');
        line2.textContent = p.detail;
        tip.appendChild(line2);
      }
      tip.hidden = false;
      var box = container.getBoundingClientRect();
      var cx = (evt.clientX || box.left + box.width / 2) - box.left;
      var cy = (evt.clientY || box.top) - box.top;
      tip.style.left = Math.min(Math.max(cx, 70), box.width - 70) + 'px';
      tip.style.top = Math.max(cy - 12, 0) + 'px';
    }

    series.forEach(function (s) {
      var pts = s.points.slice().sort(function (a, b) { return toTime(a.date) - toTime(b.date); });
      if (pts.length > 1) {
        var d = pts.map(function (p, idx) {
          return (idx ? 'L' : 'M') + x(toTime(p.date)).toFixed(1) + ',' + y(p.value).toFixed(1);
        }).join(' ');
        svg.appendChild(el('path', { d: d, class: 'line', stroke: s.color }));
      }
      pts.forEach(function (p) {
        var cx = x(toTime(p.date));
        var cy = y(p.value);
        var dot = el('circle', { cx: cx, cy: cy, r: 4.5, class: 'dot', fill: s.color });
        var hit = el('circle', { cx: cx, cy: cy, r: 14, class: 'hit', tabindex: 0 });
        var handler = function (evt) { showTip(evt, s, p); };
        hit.addEventListener('mouseenter', handler);
        hit.addEventListener('click', handler);
        hit.addEventListener('focus', function () {
          var r = hit.getBoundingClientRect();
          showTip({ clientX: r.left + r.width / 2, clientY: r.top }, s, p);
        });
        hit.addEventListener('mouseleave', function () { tip.hidden = true; });
        hit.addEventListener('blur', function () { tip.hidden = true; });
        svg.appendChild(dot);
        svg.appendChild(hit);
      });
    });

    container.appendChild(svg);
    container.appendChild(tip);

    // Leyenda (solo si hay más de una serie)
    if (series.length > 1) {
      var legend = document.createElement('div');
      legend.className = 'chart-legend';
      series.forEach(function (s) {
        var item = document.createElement('span');
        var sw = document.createElement('i');
        sw.style.background = s.color;
        item.appendChild(sw);
        item.appendChild(document.createTextNode(s.label));
        legend.appendChild(item);
      });
      container.appendChild(legend);
    }
  }

  global.GymChart = { render: render };
})(window);
