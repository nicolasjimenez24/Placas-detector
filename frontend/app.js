/* ==========================================================================
   PlacaVision — SPA sin frameworks ni dependencias.
   Organización: utilidades → formato → API → estado → componentes (visor,
   gráficos, toasts, diálogos) → vistas → atajos → arranque.
   Regla: nunca se inserta texto de datos con innerHTML; todo pasa por
   createElement/textContent (función h()).
   ========================================================================== */
'use strict';

(function () {

  /* ------------------------------------------------------------------ */
  /* Utilidades DOM                                                       */
  /* ------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const SVGNS = 'http://www.w3.org/2000/svg';

  /** Crea un elemento HTML. props: className, text, attrs, dataset, style, on, y cualquier propiedad DOM. */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    applyProps(el, props);
    appendChildren(el, children);
    return el;
  }

  /** Crea un elemento SVG (atributos vía setAttribute). */
  function s(tag, attrs, ...children) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
        else if (k === 'text') el.textContent = String(v);
        else el.setAttribute(k, String(v));
      }
    }
    appendChildren(el, children);
    return el;
  }

  function applyProps(el, props) {
    if (!props) return;
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      switch (k) {
        case 'className': el.className = v; break;
        case 'text': el.textContent = String(v); break;
        case 'attrs': for (const [a, av] of Object.entries(v)) if (av !== null && av !== undefined && av !== false) el.setAttribute(a, av === true ? '' : String(av)); break;
        case 'dataset': Object.assign(el.dataset, v); break;
        case 'style': if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); break;
        case 'on': for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn); break;
        default: el[k] = v;
      }
    }
  }

  function appendChildren(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false || c === '') continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }

  function icon(name, cls = '') {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', ('icon ' + cls).trim());
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(SVGNS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.append(use);
    return svg;
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let uidCounter = 0;
  const uid = (p = 'u') => `${p}-${++uidCounter}`;

  /* ------------------------------------------------------------------ */
  /* Formato (es-CO)                                                      */
  /* ------------------------------------------------------------------ */
  const LOCALE = 'es-CO';
  const nfPct = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 });
  const nfPct0 = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 });
  const nfMs = new Intl.NumberFormat(LOCALE, { style: 'unit', unit: 'millisecond', unitDisplay: 'short', maximumFractionDigits: 1 });
  const nfMs0 = new Intl.NumberFormat(LOCALE, { style: 'unit', unit: 'millisecond', unitDisplay: 'short', maximumFractionDigits: 0 });
  const nfSec = new Intl.NumberFormat(LOCALE, { style: 'unit', unit: 'second', unitDisplay: 'short', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nfInt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
  const nfDec = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
  const dfDate = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
  const dfTime = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const fmt = {
    pct: (v) => nfPct.format(num(v)),
    pct0: (v) => nfPct0.format(num(v)),
    ms: (v) => nfMs.format(num(v)),
    ms0: (v) => nfMs0.format(num(v)),
    sec: (v) => nfSec.format(num(v)),
    int: (v) => nfInt.format(num(v)),
    dec: (v) => nfDec.format(num(v)),
    date: (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : dfDate.format(d); },
    time: (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : dfTime.format(d); },
    bytes: (b) => b < 1024 * 1024 ? `${nfDec.format(b / 1024)} KB` : `${nfDec.format(b / 1024 / 1024)} MB`,
  };

  const DIFF_LABEL = { easy: 'Fácil', medium: 'Media', hard: 'Difícil' };
  const SOURCE_LABEL = { simulated: 'Simulada', upload: 'Subida' };
  const diffLabel = (d) => DIFF_LABEL[d] || (d ? String(d) : '—');

  const STAGE_LABELS = {
    load: 'Carga', decode: 'Decodificación', read: 'Lectura',
    preprocess: 'Preprocesado', preprocessing: 'Preprocesado', preprocesado: 'Preprocesado', hsv: 'Conversión HSV',
    color: 'Segmentación por color', color_mask: 'Máscara de color', mask: 'Máscara de color', yellow_mask: 'Máscara amarilla',
    segmentation: 'Segmentación', segment: 'Segmentación', segmentacion: 'Segmentación', segmentacion_color: 'Segmentación por color',
    morphology: 'Morfología', contours: 'Contornos', candidates: 'Candidatos', detection: 'Detección', localization: 'Localización',
    filter: 'Filtrado', filtering: 'Filtrado', filtrado: 'Filtrado', filtrado_candidatos: 'Filtrado de candidatos',
    deskew: 'Enderezado', warp: 'Enderezado', rectify: 'Enderezado', rectification: 'Enderezado', enderezado: 'Enderezado',
    binarize: 'Binarización', binarization: 'Binarización', threshold: 'Binarización',
    chars: 'Segmentación de caracteres', char_segmentation: 'Segmentación de caracteres', segmentacion_caracteres: 'Segmentación de caracteres', characters: 'Segmentación de caracteres',
    ocr: 'OCR', recognition: 'Reconocimiento (OCR)', template_matching: 'OCR por plantillas',
    validation: 'Validación', validate: 'Validación', validacion: 'Validación', postprocess: 'Posprocesado',
    // Nombres reales que emite el backend (backend/app/detector.py)
    mascara_amarilla: 'Máscara amarilla', contornos_y_filtros: 'Contornos y filtros',
    binarizacion_segmentacion: 'Binarización y segmentación', ocr_plantillas: 'OCR por plantillas', anotacion: 'Anotación',
    annotate: 'Anotación', annotation: 'Anotación', render: 'Anotación', draw: 'Anotación', save: 'Guardado', io: 'E/S', total: 'Total',
  };
  function stageLabel(name) {
    const raw = String(name ?? '').trim();
    const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
    if (STAGE_LABELS[key]) return STAGE_LABELS[key];
    const t = raw.replace(/[_-]+/g, ' ');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Etapa';
  }

  function confLevel(c) {
    const v = num(c);
    if (v >= 0.85) return 'high';
    if (v >= 0.6) return 'mid';
    return 'low';
  }
  const LEVEL_LABEL = { high: 'alta', mid: 'media', low: 'baja' };

  const normPlate = (t) => String(t ?? '').toUpperCase().replace(/\s+/g, '');

  /* ------------------------------------------------------------------ */
  /* API                                                                  */
  /* ------------------------------------------------------------------ */
  class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }

  function detailToText(detail) {
    if (!detail) return '';
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => {
        if (typeof d === 'string') return d;
        const loc = Array.isArray(d.loc) ? d.loc.filter((x) => x !== 'body').join('.') : '';
        return (loc ? `${loc}: ` : '') + (d.msg || JSON.stringify(d));
      }).join(' · ');
    }
    if (typeof detail === 'object') return detail.message || JSON.stringify(detail);
    return String(detail);
  }

  async function request(path, { method = 'GET', body, form, timeout = 30000 } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const opts = { method, signal: ctrl.signal, headers: { Accept: 'application/json' } };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    if (form) opts.body = form;
    let res;
    try {
      res = await fetch(path, opts);
    } catch (e) {
      clearTimeout(timer);
      if (e && e.name === 'AbortError') throw new ApiError('La solicitud excedió el tiempo de espera.', 0);
      throw new ApiError('No se pudo conectar con el backend. Verifica que el servidor esté en ejecución.', 0);
    }
    try {
      const ct = res.headers.get('content-type') || '';
      let data = null;
      if (ct.includes('application/json')) data = await res.json().catch(() => null);
      else if (!res.ok) data = { detail: (await res.text().catch(() => '')).slice(0, 300) };
      if (!res.ok) {
        const msg = detailToText(data && data.detail) || `Error HTTP ${res.status}`;
        throw new ApiError(msg, res.status);
      }
      return data;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (e && e.name === 'AbortError') throw new ApiError('La solicitud excedió el tiempo de espera.', 0);
      throw new ApiError('Respuesta inválida del servidor.', res.status);
    } finally {
      clearTimeout(timer);
    }
  }

  const api = {
    health: () => request('/api/health', { timeout: 5000 }),
    simulate: (p) => request('/api/simulate', { method: 'POST', body: p, timeout: 60000 }),
    detect: (sceneId) => request('/api/detect', { method: 'POST', body: { scene_id: sceneId }, timeout: 60000 }),
    upload: (file) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      return request('/api/detect/upload', { method: 'POST', form: fd, timeout: 90000 });
    },
    batch: (p) => request('/api/detect/batch', { method: 'POST', body: p, timeout: 300000 }),
    scenes: (limit = 12) => request(`/api/scenes?limit=${encodeURIComponent(limit)}`),
    history: async (limit = 200) => {
      try { return await request(`/api/history?limit=${encodeURIComponent(limit)}`); }
      catch (e) { if (e.status === 422) return request('/api/history'); throw e; }
    },
    historyItem: (id) => request(`/api/history/${encodeURIComponent(id)}`),
    clearHistory: () => request('/api/history', { method: 'DELETE' }),
    stats: () => request('/api/stats'),
  };

  /* ------------------------------------------------------------------ */
  /* Estado                                                               */
  /* ------------------------------------------------------------------ */
  const state = {
    view: 'detector',
    health: { ok: null, version: null, everOk: false },
    // Detector
    scenes: [],
    selected: -1,
    dets: new Map(),       // scene_id -> Detection
    errors: new Map(),     // scene_id -> mensaje
    inflight: new Map(),   // scene_id -> Promise
    generating: false,
    detectAll: { running: false, done: 0, total: 0 },
    // Opciones del visor (compartidas)
    viewOpts: { mode: 'original', boxes: true, gt: true },
    // Subida
    upload: { file: null, url: null, det: null, busy: false },
    // Lotes
    batch: { data: null, busy: false, onlyErrors: false, params: null },
    // Historial
    history: { items: [], loaded: false, loading: false, q: '', source: 'all', result: 'all' },
    // Estadísticas
    stats: { data: null, loading: false },
  };

  /* ------------------------------------------------------------------ */
  /* Toasts                                                               */
  /* ------------------------------------------------------------------ */
  const TOAST_ICON = { success: 'check', error: 'alert', warn: 'alert', info: 'info' };
  function toast(type, title, message, timeout) {
    const host = $('#toasts');
    const el = h('div', { className: `toast toast--${type}`, attrs: { role: type === 'error' ? 'alert' : 'status' } },
      icon(TOAST_ICON[type] || 'info', 'toast__icon'),
      h('div', { className: 'toast__body' },
        h('div', { className: 'toast__title', text: title }),
        message ? h('div', { className: 'toast__msg', text: message }) : null),
      h('button', { className: 'toast__close', type: 'button', attrs: { 'aria-label': 'Cerrar notificación' }, on: { click: () => dismiss() } }, icon('x')));
    host.append(el);
    while (host.children.length > 4) host.firstElementChild.remove();
    let gone = false;
    const dismiss = () => {
      if (gone) return; gone = true;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), prefersReducedMotion() ? 0 : 200);
    };
    const t = timeout ?? (type === 'error' ? 7000 : 4200);
    let timer = setTimeout(dismiss, t);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 2000); });
    return dismiss;
  }
  const toastError = (title, err) => toast('error', title, err && err.message ? err.message : String(err || 'Error desconocido'));

  /* ------------------------------------------------------------------ */
  /* Botones: estado de carga                                             */
  /* ------------------------------------------------------------------ */
  function setBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = !!busy;
    btn.classList.toggle('is-loading', !!busy);
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  /* ------------------------------------------------------------------ */
  /* Estados vacíos / skeletons                                           */
  /* ------------------------------------------------------------------ */
  function emptyArt(kind) {
    const svg = s('svg', { class: 'empty__art', viewBox: '0 0 120 84', 'aria-hidden': 'true' });
    if (kind === 'plate') {
      svg.append(
        s('rect', { x: 14, y: 20, width: 92, height: 44, rx: 7, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5, 'stroke-dasharray': '6 5' }),
        s('rect', { x: 28, y: 32, width: 64, height: 12, rx: 3, fill: 'currentColor', opacity: '.25' }),
        s('rect', { x: 44, y: 50, width: 32, height: 4, rx: 2, fill: 'currentColor', opacity: '.25' }),
        s('path', { d: 'M4 14V5h9M107 5h9v9M116 70v9h-9M13 79H4v-9', fill: 'none', stroke: 'var(--det)', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    } else if (kind === 'chart') {
      svg.append(
        s('path', { d: 'M14 70h92', stroke: 'currentColor', 'stroke-width': 2, opacity: '.5' }),
        s('rect', { x: 24, y: 44, width: 14, height: 26, rx: 3, fill: 'currentColor', opacity: '.25' }),
        s('rect', { x: 46, y: 28, width: 14, height: 42, rx: 3, fill: 'currentColor', opacity: '.35' }),
        s('rect', { x: 68, y: 36, width: 14, height: 34, rx: 3, fill: 'var(--det)', opacity: '.7' }),
        s('rect', { x: 90, y: 16, width: 14, height: 54, rx: 3, fill: 'var(--accent)', opacity: '.8' }));
    } else if (kind === 'history') {
      svg.append(
        s('rect', { x: 18, y: 12, width: 84, height: 14, rx: 4, fill: 'currentColor', opacity: '.2' }),
        s('rect', { x: 18, y: 34, width: 84, height: 14, rx: 4, fill: 'currentColor', opacity: '.14' }),
        s('rect', { x: 18, y: 56, width: 84, height: 14, rx: 4, fill: 'currentColor', opacity: '.08' }),
        s('circle', { cx: 92, cy: 62, r: 14, fill: 'var(--surface)', stroke: 'var(--det)', 'stroke-width': 2.5 }),
        s('path', { d: 'M92 55v7l5 3', fill: 'none', stroke: 'var(--det)', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    } else {
      svg.append(
        s('rect', { x: 10, y: 10, width: 100, height: 64, rx: 8, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5 }),
        s('path', { d: 'M14 66l26-24 18 16 14-12 34 22', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5, 'stroke-linejoin': 'round', opacity: '.6' }),
        s('circle', { cx: 82, cy: 28, r: 7, fill: 'var(--accent)' }));
    }
    return svg;
  }

  function emptyState({ art = 'image', title, text, action, compact = false }) {
    return h('div', { className: 'empty' + (compact ? ' empty--compact' : '') },
      emptyArt(art),
      h('p', { className: 'empty__title', text: title }),
      text ? h('p', { className: 'empty__text', text }) : null,
      action || null);
  }

  const skel = (cls, style) => h('div', { className: `skeleton ${cls}`, style, attrs: { 'aria-hidden': 'true' } });

  /* ------------------------------------------------------------------ */
  /* Componentes de placa                                                 */
  /* ------------------------------------------------------------------ */
  function plateEl(text, { small = false, muted = false, label } = {}) {
    return h('div', {
      className: 'plate' + (small ? ' plate--sm' : '') + (muted ? ' plate--muted' : ''),
      attrs: { role: 'img', 'aria-label': label || `Placa ${text || 'sin lectura'}` },
    },
    h('span', { className: 'plate__text', text: text || '———' }),
    h('span', { className: 'plate__city', text: 'CIUDAD SIM' }));
  }

  function meterEl(label, value) {
    const lvl = confLevel(value);
    return h('div', { className: 'meter' },
      h('div', { className: 'meter__head' },
        h('span', { text: label }),
        h('span', { className: 'meter__value', text: fmt.pct(value) })),
      h('div', {
        className: 'meter__track',
        attrs: { role: 'meter', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(num(value) * 100), 'aria-valuetext': `${fmt.pct(value)} (${LEVEL_LABEL[lvl]})` },
      }, h('div', { className: `meter__fill lvl-${lvl}`, style: { width: `${clamp(num(value) * 100, 0, 100)}%` } })));
  }

  function charsEl(chars) {
    if (!Array.isArray(chars) || !chars.length) return h('p', { className: 'small muted', text: 'Sin información por carácter.' });
    return h('div', { className: 'chars', attrs: { role: 'list', 'aria-label': 'Confianza por carácter' } },
      chars.map((c, i) => {
        const lvl = confLevel(c.confidence);
        return h('span', {
          className: `char-chip lvl-${lvl}`,
          attrs: { role: 'listitem', title: `Carácter ${i + 1}: «${c.char}» — confianza ${fmt.pct(c.confidence)} (${LEVEL_LABEL[lvl]})`, 'aria-label': `${c.char}: ${fmt.pct(c.confidence)}` },
        },
        h('span', { className: 'char-chip__c', text: c.char }),
        h('span', { className: 'char-chip__p', text: nfPct0.format(num(c.confidence)) }));
      }));
  }

  /** Diff carácter a carácter (alineado por posición). */
  function diffEl(text, ref, label) {
    const a = String(text || ''), b = String(ref || '');
    const n = Math.max(a.length, b.length);
    const spans = [];
    for (let i = 0; i < n; i++) {
      const ch = a[i];
      if (ch === undefined) spans.push(h('span', { className: 'is-missing', text: '·', attrs: { title: 'Falta un carácter' } }));
      else spans.push(h('span', { className: ch === b[i] ? 'is-same' : 'is-diff', text: ch, attrs: ch === b[i] ? null : { title: `Esperado «${b[i] ?? '∅'}»` } }));
    }
    return h('span', { className: 'diff', attrs: { 'aria-label': `${label}: ${a || 'vacío'}` } }, spans);
  }

  /* ------------------------------------------------------------------ */
  /* Emparejamiento placa ↔ ground truth                                  */
  /* ------------------------------------------------------------------ */
  function iou(a, b) {
    if (!a || !b) return 0;
    const [ax, ay, aw, ah] = a, [bx, by, bw, bh] = b;
    const x1 = Math.max(ax, bx), y1 = Math.max(ay, by);
    const x2 = Math.min(ax + aw, bx + bw), y2 = Math.min(ay + ah, by + bh);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = aw * ah + bw * bh - inter;
    return union > 0 ? inter / union : 0;
  }

  function matchGT(plates, gts) {
    const res = { pairs: plates.map(() => -1), missed: [] };
    if (!Array.isArray(gts)) return res;
    const cands = [];
    plates.forEach((p, i) => gts.forEach((g, j) => { const v = iou(p.bbox, g.bbox); if (v > 0.15) cands.push([v, i, j]); }));
    cands.sort((x, y) => y[0] - x[0]);
    const usedG = new Set();
    for (const [, i, j] of cands) {
      if (res.pairs[i] !== -1 || usedG.has(j)) continue;
      res.pairs[i] = j; usedG.add(j);
    }
    plates.forEach((p, i) => {
      if (res.pairs[i] !== -1) return;
      const j = gts.findIndex((g, k) => !usedG.has(k) && normPlate(g.text) === normPlate(p.text));
      if (j >= 0) { res.pairs[i] = j; usedG.add(j); }
    });
    gts.forEach((g, j) => { if (!usedG.has(j)) res.missed.push(j); });
    return res;
  }

  const avgConfidence = (plates) => plates && plates.length ? plates.reduce((a, p) => a + num(p.confidence), 0) / plates.length : null;

  /* ------------------------------------------------------------------ */
  /* Visor de resultados (compartido por todas las vistas)                */
  /* ------------------------------------------------------------------ */
  /**
   * model = { det?, imageUrl, width?, height?, loading?, error?, title?, subtitle?, onRetry?, onRedetect? }
   */
  function renderViewer(host, model) {
    host._viewerModel = model;
    const det = model.det || null;
    const width = (det && det.width) || model.width || 960;
    const height = (det && det.height) || model.height || 600;
    const gts = det ? (Array.isArray(det.ground_truth) ? det.ground_truth : null) : (model.groundTruth || null);
    const plates = det && Array.isArray(det.plates) ? det.plates : [];
    const match = det ? matchGT(plates, gts) : { pairs: [], missed: [] };
    const hasAnnotated = !!(det && det.annotated_url);
    const vo = state.viewOpts;
    const radioName = uid('mode');

    const root = h('article', { className: 'viewer', attrs: { 'aria-label': 'Resultado de la detección', 'aria-busy': model.loading ? 'true' : 'false' } });

    /* --- Imagen + overlay --- */
    const img = h('img', {
      className: 'stage__img',
      alt: model.loading ? 'Imagen en proceso de detección' : (det ? `Imagen analizada con ${plates.length} placa(s) detectada(s)` : 'Imagen'),
      decoding: 'async',
      draggable: false,
    });
    img.addEventListener('error', () => { img.alt = 'No se pudo cargar la imagen'; img.style.minHeight = '200px'; });

    const overlay = s('svg', { class: 'stage__overlay', viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', role: 'group', 'aria-label': 'Cajas delimitadoras de las placas' });
    const fs = Math.max(13, Math.round(height * 0.03));

    if (gts) {
      gts.forEach((g, j) => {
        if (!Array.isArray(g.bbox)) return;
        const [x, y, w, hh] = g.bbox;
        const missed = match.missed.includes(j);
        overlay.append(s('rect', { class: 'gt-box' + (missed ? ' gt-box--missed' : '') + ' gt-layer', x, y, width: w, height: hh, rx: 3, 'vector-effect': 'non-scaling-stroke' }));
        if (missed) overlay.append(s('text', { class: 'gt-label gt-layer', x, y: y + hh + fs * 1.05, 'font-size': fs * 0.8, text: `No detectada: ${g.text}` }));
      });
    }

    plates.forEach((p, i) => {
      if (!Array.isArray(p.bbox)) return;
      const [x, y, w, hh] = p.bbox;
      const gi = match.pairs[i];
      const isErr = gts ? (gi < 0 || normPlate(gts[gi].text) !== normPlate(p.text)) : !p.valid_format;
      const label = `${i + 1} · ${p.text || '?'}`;
      const lw = label.length * fs * 0.64 + fs * 0.8;
      const lh = fs * 1.45;
      const ly = y - lh - 3 >= 0 ? y - lh - 3 : y + hh + 3;
      const c = Math.min(w, hh) * 0.28;
      const g = s('g', {
        class: 'box' + (isErr ? ' is-err' : ''), tabindex: 0, role: 'button', 'data-idx': i,
        'aria-label': `Placa ${i + 1}: ${p.text || 'sin lectura'}, confianza ${fmt.pct(p.confidence)}${isErr ? ', no coincide' : ''}`,
      },
      s('rect', { class: 'box__rect', x, y, width: w, height: hh, rx: 3, 'vector-effect': 'non-scaling-stroke' }),
      s('path', { class: 'box__corner', 'vector-effect': 'non-scaling-stroke', d: `M${x} ${y + c}V${y}H${x + c}M${x + w - c} ${y}H${x + w}V${y + c}M${x + w} ${y + hh - c}V${y + hh}H${x + w - c}M${x + c} ${y + hh}H${x}V${y + hh - c}` }),
      s('rect', { class: 'box__label-bg', x, y: ly, width: lw, height: lh, rx: 4 }),
      s('text', { class: 'box__label', x: x + fs * 0.4, y: ly + lh * 0.72, 'font-size': fs, text: label }),
      s('title', { text: `Placa ${i + 1}: ${p.text} (${fmt.pct(p.confidence)})` }));
      overlay.append(g);
    });

    const frame = h('div', { className: 'stage__frame', style: { maxWidth: `min(100%, calc(72vh * ${(width / height).toFixed(4)}))` } },
      img, overlay, h('div', { className: 'scanline', attrs: { 'aria-hidden': 'true' } }));

    const stage = h('div', { className: 'stage' + (model.loading ? ' is-scanning' : '') }, frame);
    if (model.loading) {
      stage.append(h('div', { className: 'stage__status', attrs: { role: 'status' } },
        h('span', { className: 'spinner', attrs: { 'aria-hidden': 'true' } }), 'Escaneando placas…'));
    }
    const tags = h('div', { className: 'stage__corner-tags' });
    if (det) {
      tags.append(h('span', { className: 'badge badge--solid' }, icon('target'), `${plates.length} placa${plates.length === 1 ? '' : 's'}`));
      if (det.evaluation) tags.append(det.evaluation.correct
        ? h('span', { className: 'badge badge--solid badge--ok' }, icon('check'), 'Correcta')
        : h('span', { className: 'badge badge--solid badge--err' }, icon('x'), 'Con errores'));
    }
    stage.append(tags);

    /* --- Barra de herramientas --- */
    const mkRadio = (value, text, disabled) => h('label', null,
      h('input', { type: 'radio', name: radioName, value, checked: vo.mode === value, disabled, on: { change: () => { state.viewOpts.mode = value; applyViewOpts(); } } }),
      h('span', { text }));
    const toolbar = h('div', { className: 'viewer__toolbar' },
      h('div', { className: 'viewer__heading' },
        h('h2', { className: 'card__title' }, icon(det && det.source === 'upload' ? 'upload' : 'car'), model.title || 'Resultado'),
        model.subtitle ? h('p', { className: 'xsmall muted', text: model.subtitle }) : null),
      h('div', { className: 'spacer' }),
      h('div', { className: 'segmented segmented--sm', attrs: { role: 'radiogroup', 'aria-label': 'Imagen mostrada (tecla O)' } },
        mkRadio('original', 'Original', false),
        mkRadio('annotated', 'Anotada', !hasAnnotated)),
      h('label', { className: 'toggle', attrs: { title: 'Mostrar cajas dibujadas en el cliente (B)' } },
        h('input', { type: 'checkbox', className: 'opt-boxes', checked: vo.boxes, on: { change: (e) => { state.viewOpts.boxes = e.target.checked; applyViewOpts(); } } }), 'Cajas'),
      gts ? h('label', { className: 'toggle', attrs: { title: 'Mostrar ground truth (cajas punteadas)' } },
        h('input', { type: 'checkbox', className: 'opt-gt', checked: vo.gt, on: { change: (e) => { state.viewOpts.gt = e.target.checked; applyViewOpts(); } } }), 'Ground truth') : null,
      model.onRedetect && det ? h('button', { className: 'icon-btn icon-btn--sm', type: 'button', on: { click: model.onRedetect }, attrs: { title: 'Volver a detectar (D)', 'aria-label': 'Volver a detectar (D)' } }, icon('refresh')) : null);

    const stageCard = h('div', { className: 'card stage-card' }, toolbar, stage);

    /* --- Resumen + pipeline --- */
    const main = h('div', { className: 'viewer__main' }, stageCard);
    if (det) {
      main.append(summaryEl(det, plates, gts), timelineEl(det));
    } else if (model.loading) {
      main.append(h('div', { className: 'summary' }, [0, 1, 2, 3].map(() => skel('skel-row'))), skel('skel-card', { height: '110px' }));
    } else if (model.error) {
      main.append(h('div', { className: 'card card__body' },
        h('p', { className: 'card__title' }, icon('alert'), 'No se pudo completar la detección'),
        h('p', { className: 'small muted', style: 'margin:6px 0 12px', text: model.error }),
        model.onRetry ? h('button', { className: 'btn btn--ghost btn--sm', type: 'button', on: { click: model.onRetry } }, icon('refresh'), h('span', { text: 'Reintentar' })) : null));
    }

    /* --- Panel lateral: placas --- */
    const side = h('div', { className: 'viewer__side' });
    if (det) {
      side.append(h('div', { className: 'plates-head' },
        h('h3', { className: 'section-title' }, 'Placas detectadas', h('span', { className: 'count-pill', text: String(plates.length) })),
        gts ? h('span', { className: 'small muted', text: `Esperadas: ${gts.length}` }) : null));
      if (!plates.length) {
        side.append(emptyState({
          art: 'plate', compact: true, title: 'No se detectaron placas',
          text: det.source === 'upload'
            ? 'El detector busca placas amarillas con formato AAA-123. Prueba con una imagen más nítida, mejor iluminada o con la placa más grande.'
            : 'El pipeline no encontró regiones candidatas válidas en esta escena.',
        }));
      }
      plates.forEach((p, i) => side.append(plateCardEl(p, i, plates.length, gts, match.pairs[i])));
      if (gts && match.missed.length) {
        side.append(h('div', { className: 'missed-card', attrs: { role: 'note' } },
          h('h4', null, icon('alert'), `${match.missed.length} placa${match.missed.length === 1 ? '' : 's'} sin detectar`),
          h('div', { className: 'list' }, match.missed.map((j) => plateEl(gts[j].text, { small: true, muted: true, label: `Placa esperada no detectada: ${gts[j].text}` })))));
      }
    } else if (model.loading) {
      side.append(h('div', { className: 'plates-head' }, h('h3', { className: 'section-title' }, 'Placas detectadas', h('span', { className: 'spinner', style: 'width:14px;height:14px', attrs: { 'aria-hidden': 'true' } }))));
      side.append(skel('skel-card'), skel('skel-card', { opacity: .6 }));
    }

    root.append(main, side);
    host.replaceChildren(root);

    /* --- Interacciones: resaltado cruzado caja ↔ tarjeta --- */
    const setHl = (idx, on) => {
      $$(`[data-idx="${idx}"]`, root).forEach((el) => el.classList.toggle('is-hl', on));
    };
    root.addEventListener('mouseover', (e) => { const t = e.target.closest('[data-idx]'); if (t && root.contains(t)) setHl(t.getAttribute('data-idx'), true); });
    root.addEventListener('mouseout', (e) => { const t = e.target.closest('[data-idx]'); if (t && !t.contains(e.relatedTarget)) setHl(t.getAttribute('data-idx'), false); });
    root.addEventListener('focusin', (e) => { const t = e.target.closest('[data-idx]'); if (t) setHl(t.getAttribute('data-idx'), true); });
    root.addEventListener('focusout', (e) => { const t = e.target.closest('[data-idx]'); if (t) setHl(t.getAttribute('data-idx'), false); });
    $$('.box', overlay).forEach((g) => {
      const go = () => {
        const card = $(`.plate-card[data-idx="${g.getAttribute('data-idx')}"]`, root);
        if (card) { card.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' }); card.focus({ preventScroll: true }); }
      };
      g.addEventListener('click', go);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });

    /* --- Aplicar opciones de visualización --- */
    function applyViewOpts() {
      const o = state.viewOpts;
      const useAnnotated = o.mode === 'annotated' && hasAnnotated;
      const src = useAnnotated ? det.annotated_url : ((det && det.image_url) || model.imageUrl || '');
      if (src && img.getAttribute('src') !== src) img.src = src;
      overlay.classList.toggle('is-ghost', !o.boxes || useAnnotated);
      $$('.gt-layer', overlay).forEach((el) => { el.style.display = o.gt && !useAnnotated ? '' : 'none'; });
      $$(`input[name="${radioName}"]`, root).forEach((r) => { r.checked = r.value === (useAnnotated ? 'annotated' : 'original'); });
      const cb = $('.opt-boxes', root); if (cb) cb.checked = o.boxes;
      const cg = $('.opt-gt', root); if (cg) cg.checked = o.gt;
    }
    root._applyViewOpts = applyViewOpts;
    applyViewOpts();
    return root;
  }

  /** Reaplica opciones (O / B) a todos los visores presentes. */
  function refreshViewOpts() {
    $$('.viewer').forEach((v) => v._applyViewOpts && v._applyViewOpts());
  }

  function summaryEl(det, plates, gts) {
    const ev = det.evaluation;
    const avgC = avgConfidence(plates);
    const metric = (iconName, label, value, cls = '') => h('div', { className: 'metric' },
      h('span', { className: 'metric__label' }, icon(iconName), label),
      h('span', { className: 'metric__value ' + cls, text: value }));
    return h('div', { className: 'summary' },
      metric('target', 'Placas detectadas', gts ? `${plates.length} / ${gts.length}` : String(plates.length)),
      ev ? metric('info', 'Resultado', ev.correct ? '✓ Correcta' : '✗ Errores', ev.correct ? 'is-ok' : 'is-err')
        : metric('info', 'Resultado', 'Sin evaluación'),
      ev ? metric('type', 'Precisión caracteres', fmt.pct(ev.char_accuracy)) : null,
      ev ? metric('check', 'Lecturas exactas', `${fmt.int(ev.exact_matches)} / ${fmt.int(ev.expected)}`) : null,
      metric('gauge', 'Confianza media', avgC === null ? '—' : fmt.pct(avgC)),
      metric('clock', 'Tiempo total', fmt.ms(det.processing_ms)));
  }

  function timelineEl(det) {
    const stages = Array.isArray(det.stages) ? det.stages.filter((st) => st && typeof st.ms === 'number') : [];
    const sum = stages.reduce((a, st) => a + Math.max(0, st.ms), 0);
    const card = h('section', { className: 'card', attrs: { 'aria-label': 'Tiempos por etapa del pipeline' } });
    card.append(h('div', { className: 'card__head' },
      h('h3', { className: 'card__title' }, icon('layers'), 'Pipeline · tiempo por etapa'),
      h('span', { className: 'small muted', text: `${stages.length} etapas` })));
    const body = h('div', { className: 'card__body timeline' });
    if (!stages.length) {
      body.append(h('p', { className: 'small muted', text: 'El backend no reportó tiempos por etapa.' }));
    } else {
      const bar = h('div', { className: 'timeline__bar', attrs: { role: 'img', 'aria-label': stages.map((st) => `${stageLabel(st.name)} ${fmt.ms(st.ms)}`).join(', ') } });
      const legend = h('ol', { className: 'timeline__legend' });
      stages.forEach((st, i) => {
        const pct = sum > 0 ? st.ms / sum : 0;
        const color = `var(--stage-${(i % 8) + 1})`;
        const seg = h('div', { className: 'timeline__seg', dataset: { sidx: i }, style: { flexGrow: String(Math.max(pct, 0.012)), flexBasis: '0', background: color }, attrs: { title: `${stageLabel(st.name)}: ${fmt.ms(st.ms)} (${fmt.pct(pct)})` } });
        const item = h('li', { className: 'timeline__item', dataset: { sidx: i } },
          h('span', { className: 'timeline__swatch', style: { background: color } }),
          h('span', { className: 'timeline__name', text: stageLabel(st.name), attrs: { title: String(st.name) } }),
          h('span', { className: 'timeline__ms', text: fmt.ms(st.ms) }),
          h('span', { className: 'xsmall muted', text: fmt.pct0(pct) }));
        bar.append(seg); legend.append(item);
      });
      const hl = (i, on) => {
        body.classList.toggle('has-hl', on);
        $$(`[data-sidx="${i}"]`, body).forEach((el) => el.classList.toggle('is-hl', on));
      };
      body.addEventListener('mouseover', (e) => { const t = e.target.closest('[data-sidx]'); if (t) hl(t.dataset.sidx, true); });
      body.addEventListener('mouseout', (e) => { const t = e.target.closest('[data-sidx]'); if (t) hl(t.dataset.sidx, false); });
      body.append(bar, legend);
    }
    body.append(h('div', { className: 'timeline__total' },
      h('span', { className: 'small muted' }, 'Tiempo total de procesamiento', sum && Math.abs(sum - num(det.processing_ms)) > 1 ? ` (suma de etapas: ${fmt.ms(sum)})` : ''),
      h('strong', { text: fmt.ms(det.processing_ms) })));
    card.append(body);
    return card;
  }

  function plateCardEl(p, i, total, gts, gi) {
    const card = h('article', { className: 'plate-card', tabIndex: 0, dataset: { idx: i }, attrs: { 'aria-label': `Placa ${i + 1} de ${total}: ${p.text || 'sin lectura'}` } });
    card.style.animationDelay = `${Math.min(i, 6) * 60}ms`;
    card.append(h('div', { className: 'plate-card__top' },
      h('span', { className: 'plate-card__idx', text: `#${i + 1} de ${total}` }),
      p.valid_format
        ? h('span', { className: 'badge badge--ok', attrs: { title: 'Cumple el formato AAA-123' } }, icon('check'), 'Formato válido')
        : h('span', { className: 'badge badge--warn', attrs: { title: 'No cumple el formato AAA-123' } }, icon('alert'), 'Formato inválido')));
    const aside = h('div', { className: 'plate-card__aside' }, meterEl('Confianza global', p.confidence));
    if (p.crop_url) {
      aside.append(h('figure', { className: 'crop' },
        h('img', { src: p.crop_url, alt: `Recorte de la placa ${p.text}`, loading: 'lazy', decoding: 'async' }),
        h('figcaption', { text: 'Recorte real' })));
    }
    card.append(h('div', { className: 'plate-card__hero' }, plateEl(p.text), aside));
    card.append(charsEl(p.chars));

    if (gts) {
      const cmp = h('div', { className: 'gt-compare' });
      if (gi >= 0) {
        const exp = gts[gi].text;
        const ok = normPlate(exp) === normPlate(p.text);
        cmp.append(h('div', { className: 'gt-compare__row' },
          h('span', { className: 'gt-compare__label', text: 'Ground truth' }),
          ok ? h('span', { className: 'badge badge--ok' }, icon('check'), 'Coincide') : h('span', { className: 'badge badge--err' }, icon('x'), 'No coincide')));
        cmp.append(h('div', { className: 'gt-compare__row' }, h('span', { className: 'gt-compare__label', text: 'Esperado' }), h('span', { className: 'diff' }, [...String(exp)].map((c) => h('span', { className: 'is-same', text: c })))));
        cmp.append(h('div', { className: 'gt-compare__row' }, h('span', { className: 'gt-compare__label', text: 'Detectado' }), diffEl(p.text, exp, 'Detectado')));
      } else {
        cmp.append(h('div', { className: 'gt-compare__row' },
          h('span', { className: 'gt-compare__label', text: 'Ground truth' }),
          h('span', { className: 'badge badge--err' }, icon('x'), 'Falso positivo'),
          h('span', { className: 'xsmall muted', text: 'No corresponde a ninguna placa esperada.' })));
      }
      card.append(cmp);
    }
    return card;
  }

  /* ------------------------------------------------------------------ */
  /* Gráficos SVG propios                                                 */
  /* ------------------------------------------------------------------ */
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= m * e) return m * e;
    return 10 * e;
  }
  /** Escala "bonita": paso redondo y máximo múltiplo del paso. */
  function niceScale(maxVal, target = 4, integer = false) {
    const raw = Math.max(maxVal, integer ? 1 : 1e-9) / target;
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    let step = e * ([1, 2, 2.5, 5, 10].find((m) => raw <= m * e) || 10);
    if (integer) step = Math.max(1, Math.ceil(step));
    const n = Math.max(1, Math.ceil(maxVal / step - 1e-9));
    return { step, max: step * n, ticks: n };
  }
  function roundedTop(x, y, w, hh, r) {
    if (hh <= 0) return '';
    r = Math.min(r, w / 2, hh);
    return `M${x},${y + hh}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hh}Z`;
  }

  /** Monta un gráfico que se redibuja al cambiar el ancho del contenedor. */
  function mountChart(draw) {
    const wrap = h('div', { className: 'chart-wrap' });
    const tip = h('div', { className: 'chart-tip', attrs: { 'aria-hidden': 'true' } });
    const tipApi = {
      show(lines, x, y) {
        tip.replaceChildren(...lines.map((l, k) => h('div', null, k === 0 ? h('strong', { text: l }) : l)));
        tip.style.left = `${x}px`; tip.style.top = `${y}px`;
        tip.classList.add('is-visible');
      },
      hide() { tip.classList.remove('is-visible'); },
    };
    let lastW = 0;
    const render = () => {
      if (!wrap.isConnected && lastW) { ro.disconnect(); return; }
      const w = Math.max(260, Math.floor(wrap.clientWidth || 520));
      if (Math.abs(w - lastW) < 2) return;
      lastW = w;
      wrap.replaceChildren(draw(w, tipApi), tip);
    };
    const ro = new ResizeObserver(() => render());
    ro.observe(wrap);
    requestAnimationFrame(render);
    return wrap;
  }

  /**
   * Barras agrupadas (o simples). categories: [str], series: [{label, color, values:[num|null]}].
   */
  function barChart({ categories, series, max, yFormat, valueFormat, height = 250, ariaLabel }) {
    return mountChart((W, tip) => {
      const m = { t: 18, r: 10, b: 32, l: 48 };
      const iw = W - m.l - m.r, ih = height - m.t - m.b;
      const allVals = series.flatMap((se) => se.values.map(num));
      const sc = max ? { max, ticks: 4, step: max / 4 } : niceScale(Math.max(...allVals, 0) * 1.05 || 1);
      const yMax = sc.max;
      const svg = s('svg', { class: 'chart', width: W, height, viewBox: `0 0 ${W} ${height}`, role: 'img', 'aria-label': ariaLabel || 'Gráfico de barras' });
      const ticks = sc.ticks;
      for (let k = 0; k <= ticks; k++) {
        const v = sc.step * k;
        const y = m.t + ih - (v / yMax) * ih;
        svg.append(s('line', { class: k === 0 ? 'axis-line' : 'grid-line', x1: m.l, x2: W - m.r, y1: y, y2: y }));
        svg.append(s('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end', text: yFormat(v) }));
      }
      const gw = iw / categories.length;
      const n = series.length;
      const groupInner = Math.min(gw * 0.72, n * 56);
      const gap = 3;
      const bw = (groupInner - gap * (n - 1)) / n;
      categories.forEach((cat, ci) => {
        const gx = m.l + gw * ci + (gw - groupInner) / 2;
        const grp = s('g', { class: 'bar-group' });
        series.forEach((se, si) => {
          const raw = se.values[ci];
          const v = num(raw);
          const bh = (clamp(v, 0, yMax) / yMax) * ih;
          const x = gx + si * (bw + gap);
          const y = m.t + ih - bh;
          if (bh > 0) grp.append(s('path', { class: 'bar', d: roundedTop(x, y, bw, bh, 4), style: { fill: se.color } }));
          if (bw >= 30 && raw !== null && raw !== undefined) {
            grp.append(s('text', { class: 'value-label', x: x + bw / 2, y: y - 5, 'text-anchor': 'middle', 'font-size': 10.5, text: valueFormat(v) }));
          }
        });
        if (series.every((se) => se.values[ci] === null || se.values[ci] === undefined)) {
          grp.append(s('text', { x: m.l + gw * ci + gw / 2, y: m.t + ih - 10, 'text-anchor': 'middle', 'font-size': 11.5, text: 'Sin datos' }));
        }
        const hit = s('rect', { class: 'hit', x: m.l + gw * ci, y: m.t, width: gw, height: ih });
        hit.addEventListener('mouseenter', () => {
          tip.show([cat, ...series.map((se) => `${se.label}: ${se.values[ci] === null || se.values[ci] === undefined ? 'sin datos' : valueFormat(num(se.values[ci]))}`)], m.l + gw * ci + gw / 2, m.t + 10);
        });
        hit.addEventListener('mouseleave', () => tip.hide());
        grp.append(hit);
        svg.append(grp);
        svg.append(s('text', { x: m.l + gw * ci + gw / 2, y: height - 10, 'text-anchor': 'middle', 'font-size': 12, style: { fill: 'var(--text-2)' }, text: cat }));
      });
      return svg;
    });
  }

  /** Histograma de una serie. */
  function histogram({ values, bins = 10, domain, xFormat, color, unitLabel, height = 220, ariaLabel }) {
    const vals = values.filter((v) => typeof v === 'number' && isFinite(v));
    let [lo, hi] = domain || [Math.min(...vals), Math.max(...vals)];
    if (!vals.length) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) { hi = lo + 1; lo = Math.max(0, lo - 0.5); hi = lo + 1; }
    const step = (hi - lo) / bins;
    const counts = new Array(bins).fill(0);
    vals.forEach((v) => { counts[clamp(Math.floor((v - lo) / step), 0, bins - 1)]++; });
    const node = mountChart((W, tip) => {
      const m = { t: 14, r: 10, b: 34, l: 36 };
      const iw = W - m.l - m.r, ih = height - m.t - m.b;
      const cMax = Math.max(...counts, 1);
      const sc = niceScale(cMax, 4, true);
      const yMax = sc.max;
      const svg = s('svg', { class: 'chart', width: W, height, viewBox: `0 0 ${W} ${height}`, role: 'img', 'aria-label': ariaLabel || 'Histograma' });
      const ticks = sc.ticks;
      for (let k = 0; k <= ticks; k++) {
        const v = sc.step * k;
        const y = m.t + ih - (v / yMax) * ih;
        svg.append(s('line', { class: k === 0 ? 'axis-line' : 'grid-line', x1: m.l, x2: W - m.r, y1: y, y2: y }));
        svg.append(s('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end', text: fmt.int(v) }));
      }
      const bw = iw / bins;
      counts.forEach((c, i) => {
        const bh = (c / yMax) * ih;
        const x = m.l + i * bw + 1, y = m.t + ih - bh;
        if (bh > 0) svg.append(s('path', { class: 'bar', d: roundedTop(x, y, bw - 2, bh, 4), style: { fill: color } }));
        const hit = s('rect', { class: 'hit', x: m.l + i * bw, y: m.t, width: bw, height: ih });
        const a = lo + i * step, b = a + step;
        hit.addEventListener('mouseenter', () => tip.show([`${xFormat(a)} – ${xFormat(b)}`, `${fmt.int(c)} ${unitLabel}`], m.l + i * bw + bw / 2, Math.max(m.t, y)));
        hit.addEventListener('mouseleave', () => tip.hide());
        svg.append(hit);
      });
      const labelEvery = Math.ceil(bins / Math.max(2, Math.floor(iw / 70)));
      for (let i = 0; i <= bins; i += labelEvery) {
        svg.append(s('text', { x: m.l + i * bw, y: height - 14, 'text-anchor': i === 0 ? 'start' : (i === bins ? 'end' : 'middle'), text: xFormat(lo + i * step) }));
      }
      return svg;
    });
    node._bins = counts.map((c, i) => ({ from: lo + i * step, to: lo + (i + 1) * step, count: c }));
    return node;
  }

  function dataTableDetails(caption, headers, rows) {
    return h('details', { className: 'table-toggle' },
      h('summary', { text: 'Ver datos en tabla' }),
      h('table', { className: 'simple-table' },
        h('caption', { className: 'sr-only', text: caption }),
        h('thead', null, h('tr', null, headers.map((t, i) => h('th', { className: i ? 'num' : '', attrs: { scope: 'col' }, text: t })))),
        h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h(i ? 'td' : 'th', { className: i ? 'num' : '', attrs: i ? null : { scope: 'row' }, text: c })))))));
  }

  function chartCard(title, iconName, ...content) {
    return h('section', { className: 'card chart-card' },
      h('div', { className: 'card__head' }, h('h3', { className: 'card__title' }, icon(iconName), title)),
      h('div', { className: 'card__body' }, content));
  }

  /* ------------------------------------------------------------------ */
  /* KPIs                                                                 */
  /* ------------------------------------------------------------------ */
  function kpiEl({ label, value, sub, iconName, tone = '', ratio }) {
    return h('div', { className: `kpi ${tone ? 'kpi--' + tone : ''}` },
      h('div', { className: 'kpi__label' }, h('span', { className: 'kpi__icon' }, icon(iconName)), label),
      h('div', { className: 'kpi__value', text: value }),
      sub ? h('div', { className: 'kpi__sub', text: sub }) : null,
      typeof ratio === 'number' ? h('div', { className: 'kpi__track', attrs: { 'aria-hidden': 'true' } }, h('div', { className: 'kpi__fill', style: { width: `${clamp(ratio * 100, 0, 100)}%` } })) : null);
  }

  function metricsKpis(mt, { extra = true } = {}) {
    return h('div', { className: 'kpis' },
      kpiEl({ label: 'Precisión de placas', value: fmt.pct(mt.plate_accuracy), sub: 'Lecturas exactas sobre placas esperadas', iconName: 'target', tone: 'accent', ratio: mt.plate_accuracy }),
      kpiEl({ label: 'Precisión de caracteres', value: fmt.pct(mt.char_accuracy), sub: 'Caracteres correctos', iconName: 'type', tone: 'det', ratio: mt.char_accuracy }),
      kpiEl({ label: 'Tasa de detección', value: fmt.pct(mt.detection_rate), sub: 'Placas localizadas', iconName: 'scan', tone: 'ok', ratio: mt.detection_rate }),
      kpiEl({ label: 'Latencia media', value: fmt.ms(mt.avg_processing_ms), sub: 'Por imagen', iconName: 'clock' }),
      extra ? kpiEl({ label: 'Confianza media', value: fmt.pct(mt.avg_confidence), sub: `${fmt.int(mt.total_plates)} placas leídas`, iconName: 'gauge', ratio: mt.avg_confidence }) : null);
  }

  /* ------------------------------------------------------------------ */
  /* Diálogos                                                             */
  /* ------------------------------------------------------------------ */
  function setupDialog(dlg) {
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  }

  function openDetail(model) {
    const dlg = $('#detail-dialog');
    const body = $('#detail-body');
    $('#detail-title').textContent = model.dialogTitle || 'Detalle de la detección';
    renderViewer(body, model);
    if (!dlg.open) dlg.showModal();
    return body;
  }

  function confirmDialog({ title, message, confirmText = 'Confirmar' }) {
    const dlg = $('#confirm-dialog');
    $('#confirm-title').textContent = title;
    $('#confirm-msg').textContent = message;
    const ok = $('#confirm-ok');
    const cancel = $('#confirm-cancel');
    ok.textContent = confirmText;
    return new Promise((resolve) => {
      const done = (v) => { cleanup(); if (dlg.open) dlg.close(); resolve(v); };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      const onClose = () => { cleanup(); resolve(false); };
      const onBackdrop = (e) => { if (e.target === dlg) done(false); };
      function cleanup() {
        ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel);
        dlg.removeEventListener('close', onClose); dlg.removeEventListener('click', onBackdrop);
      }
      ok.addEventListener('click', onOk); cancel.addEventListener('click', onCancel);
      dlg.addEventListener('close', onClose); dlg.addEventListener('click', onBackdrop);
      dlg.showModal();
      cancel.focus();
    });
  }

  const anyDialogOpen = () => $$('dialog').some((d) => d.open);

  /* ------------------------------------------------------------------ */
  /* Salud del backend                                                    */
  /* ------------------------------------------------------------------ */
  let healthTimer = null;
  async function checkHealth() {
    clearTimeout(healthTimer);
    const el = $('#health');
    const label = $('.health__label', el);
    const prev = state.health.ok;
    try {
      const r = await api.health();
      const ok = r && r.status === 'ok';
      state.health.ok = ok;
      state.health.version = r && r.version;
      el.dataset.state = ok ? 'ok' : 'down';
      label.textContent = ok ? `Backend en línea · v${r.version || '?'}` : `Backend con estado «${(r && r.status) || 'desconocido'}»`;
      el.title = label.textContent;
      if (ok && prev === false) toast('success', 'Conexión restablecida', 'El backend vuelve a responder.');
      if (ok && !state.health.everOk) { state.health.everOk = true; onFirstHealthy(); }
    } catch (e) {
      state.health.ok = false;
      el.dataset.state = 'down';
      label.textContent = 'Backend sin conexión · reintentando';
      el.title = `Sin conexión con el backend (${e.message}). Se reintenta automáticamente.`;
      if (prev !== false && prev !== null) toast('error', 'Se perdió la conexión con el backend', 'Se reintentará automáticamente.');
    }
    healthTimer = setTimeout(checkHealth, state.health.ok ? 15000 : 5000);
  }

  function onFirstHealthy() {
    // Cargar escenas recientes si la galería está vacía.
    if (!state.scenes.length && !state.generating) {
      api.scenes(12).then((r) => {
        if (state.scenes.length || !r || !Array.isArray(r.scenes) || !r.scenes.length) return;
        state.scenes = r.scenes;
        renderGallery();
        updateDetectorButtons();
        renderDetectorViewer();
      }).catch(() => { /* silencioso */ });
    }
    if (state.view === 'history') loadHistory();
    if (state.view === 'stats') loadStats();
  }

  /* ------------------------------------------------------------------ */
  /* Tema                                                                 */
  /* ------------------------------------------------------------------ */
  function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('placavision-theme', t); } catch (e) { /* ignorar */ }
    const btn = $('#btn-theme');
    const lbl = t === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    btn.setAttribute('aria-label', lbl);
    btn.title = `${lbl} (T)`;
  }
  const toggleTheme = () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark');

  /* ------------------------------------------------------------------ */
  /* Navegación                                                           */
  /* ------------------------------------------------------------------ */
  const VIEWS = ['detector', 'upload', 'batch', 'history', 'stats'];
  function switchView(name, { focus = false } = {}) {
    if (!VIEWS.includes(name)) name = 'detector';
    state.view = name;
    $$('.nav-item').forEach((b) => {
      const on = b.dataset.view === name;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    VIEWS.forEach((v) => { $(`#view-${v}`).hidden = v !== name; });
    if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    if (name === 'history') loadHistory();
    if (name === 'stats') loadStats();
    if (name === 'upload' && !state.upload.det && !state.upload.busy) renderUploadViewer();
  }

  function setupNav() {
    const tabs = $$('.nav-item');
    tabs.forEach((b, i) => {
      b.addEventListener('click', () => switchView(b.dataset.view));
      b.addEventListener('keydown', (e) => {
        let j = null;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % tabs.length;
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); switchView(tabs[j].dataset.view, { focus: true }); }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades de formularios                                            */
  /* ------------------------------------------------------------------ */
  function linkRange(range, input) {
    range.addEventListener('input', () => { input.value = range.value; input.removeAttribute('aria-invalid'); });
    input.addEventListener('input', () => { const v = parseInt(input.value, 10); if (!isNaN(v)) range.value = clamp(v, +range.min, +range.max); });
  }

  function readParams(form, maxCount) {
    const countEl = form.elements.count;
    const seedEl = form.elements.seed;
    const count = parseInt(countEl.value, 10);
    const diffEl = form.querySelector('input[name="difficulty"]:checked');
    const difficulty = diffEl ? diffEl.value : 'medium';
    countEl.removeAttribute('aria-invalid'); seedEl.removeAttribute('aria-invalid');
    if (!Number.isInteger(count) || count < 1 || count > maxCount) {
      countEl.setAttribute('aria-invalid', 'true'); countEl.focus();
      throw new Error(`La cantidad debe ser un entero entre 1 y ${maxCount}.`);
    }
    let seed = null;
    const sv = seedEl.value.trim();
    if (sv !== '') {
      seed = Number(sv);
      if (!Number.isInteger(seed)) { seedEl.setAttribute('aria-invalid', 'true'); seedEl.focus(); throw new Error('La semilla debe ser un número entero.'); }
    }
    return { count, seed, difficulty };
  }

  /* ------------------------------------------------------------------ */
  /* Vista 1: Detector                                                    */
  /* ------------------------------------------------------------------ */
  function sceneStatus(sc) {
    if (state.inflight.has(sc.id)) return 'busy';
    if (state.errors.has(sc.id)) return 'error';
    const d = state.dets.get(sc.id);
    if (!d) return 'pending';
    if (d.evaluation) return d.evaluation.correct ? 'ok' : 'bad';
    return 'done';
  }

  function thumbBadge(sc) {
    const st = sceneStatus(sc);
    const d = state.dets.get(sc.id);
    switch (st) {
      case 'busy': return h('span', { className: 'badge badge--solid' }, h('span', { className: 'spinner', style: 'width:11px;height:11px;border-width:2px', attrs: { 'aria-hidden': 'true' } }), 'Procesando');
      case 'error': return h('span', { className: 'badge badge--solid badge--err' }, icon('alert'), 'Error');
      case 'ok': return h('span', { className: 'badge badge--solid badge--ok' }, icon('check'), `${d.evaluation.exact_matches}/${d.evaluation.expected}`);
      case 'bad': return h('span', { className: 'badge badge--solid badge--err' }, icon('x'), `${d.evaluation.exact_matches}/${d.evaluation.expected}`);
      case 'done': return h('span', { className: 'badge badge--solid' }, icon('check'), String(d.plates.length));
      default: return h('span', { className: 'badge badge--solid', text: 'Pendiente' });
    }
  }

  const STATUS_TEXT = { busy: 'procesando', error: 'error', ok: 'correcta', bad: 'con errores', done: 'detectada', pending: 'pendiente' };

  function renderGallery() {
    const g = $('#gallery');
    $('#scene-count').textContent = String(state.scenes.length);
    if (state.generating) {
      const n = clamp(parseInt($('#sim-count').value, 10) || 6, 1, 12);
      g.replaceChildren(...Array.from({ length: n }, () => skel('skel-thumb')));
      g.setAttribute('aria-busy', 'true');
      return;
    }
    g.removeAttribute('aria-busy');
    if (!state.scenes.length) {
      g.replaceChildren();
      g.hidden = true;
      return;
    }
    g.hidden = false;
    const nodes = state.scenes.map((sc, i) => {
      const sel = i === state.selected;
      const gtN = Array.isArray(sc.ground_truth) ? sc.ground_truth.length : 0;
      const st = sceneStatus(sc);
      return h('button', {
        className: 'thumb', type: 'button', tabIndex: sel || (state.selected < 0 && i === 0) ? 0 : -1,
        attrs: { role: 'option', 'aria-selected': sel ? 'true' : 'false', 'aria-label': `Escena ${i + 1}, dificultad ${diffLabel(sc.difficulty)}, ${gtN} placas esperadas, ${STATUS_TEXT[st]}` },
        dataset: { idx: i },
        on: {
          click: () => selectScene(i),
          keydown: (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault(); e.stopPropagation();
              const j = clamp(i + (e.key === 'ArrowRight' ? 1 : -1), 0, state.scenes.length - 1);
              selectScene(j, { focusThumb: true });
            }
          },
        },
      },
      h('img', { className: 'thumb__img', src: sc.image_url, alt: '', loading: 'lazy', decoding: 'async' }),
      h('span', { className: 'thumb__index', text: `#${i + 1}` }),
      h('span', { className: 'thumb__status' }, thumbBadge(sc)),
      h('span', { className: 'thumb__meta' },
        h('span', { className: `diff-${sc.difficulty}`, text: `● ${diffLabel(sc.difficulty)}` }),
        h('span', { text: `${gtN} placa${gtN === 1 ? '' : 's'}` })));
    });
    g.replaceChildren(...nodes);
    $('#btn-prev-scene').disabled = state.selected <= 0;
    $('#btn-next-scene').disabled = state.selected < 0 || state.selected >= state.scenes.length - 1;
  }

  function updateDetectorButtons() {
    const busy = state.generating || state.detectAll.running;
    setBusy($('#btn-generate'), state.generating);
    $('#btn-generate').disabled = busy;
    $('#btn-detect-all').disabled = busy || !state.scenes.length;
    $('#btn-detect-all').classList.toggle('is-loading', state.detectAll.running);
  }

  function renderDetectorViewer() {
    const host = $('#detector-viewer');
    if (!state.scenes.length) {
      if (state.generating) { host.replaceChildren(); return; }
      host.replaceChildren(emptyState({
        art: 'plate',
        title: 'Aún no hay escenas',
        text: 'Genera escenas sintéticas de vehículos con placas amarillas y ejecuta el detector sobre ellas.',
        action: h('button', { className: 'btn btn--primary', type: 'button', on: { click: generate } }, icon('sparkles'), h('span', { text: 'Generar escenas' }), h('kbd', { text: 'G' })),
      }));
      return;
    }
    if (state.selected < 0) {
      host.replaceChildren(emptyState({ art: 'image', compact: true, title: 'Selecciona una escena', text: 'Haz clic en una miniatura (o usa las flechas ← →) para ejecutar la detección.' }));
      return;
    }
    const sc = state.scenes[state.selected];
    const det = state.dets.get(sc.id);
    const title = `Escena ${state.selected + 1} de ${state.scenes.length}`;
    const subtitle = `${diffLabel(sc.difficulty)} · ID ${sc.id}${sc.created_at ? ' · ' + fmt.time(sc.created_at) : ''}`;
    if (det) {
      renderViewer(host, { det, title, subtitle, onRedetect: () => detectScene(state.selected, { force: true }) });
    } else if (state.inflight.has(sc.id)) {
      renderViewer(host, { loading: true, imageUrl: sc.image_url, width: sc.width, height: sc.height, title, subtitle });
    } else if (state.errors.has(sc.id)) {
      renderViewer(host, { error: state.errors.get(sc.id), imageUrl: sc.image_url, width: sc.width, height: sc.height, title, subtitle, onRetry: () => detectScene(state.selected, { force: true }) });
    } else {
      renderViewer(host, { loading: true, imageUrl: sc.image_url, width: sc.width, height: sc.height, title, subtitle });
    }
  }

  function selectScene(i, { focusThumb = false, detect = true } = {}) {
    if (i < 0 || i >= state.scenes.length) return;
    state.selected = i;
    renderGallery();
    const thumb = $(`#gallery .thumb[data-idx="${i}"]`);
    if (thumb) {
      thumb.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
      if (focusThumb) thumb.focus({ preventScroll: true });
    }
    const sc = state.scenes[i];
    if (detect && !state.dets.has(sc.id) && !state.inflight.has(sc.id) && !state.errors.has(sc.id)) detectScene(i);
    else renderDetectorViewer();
  }

  async function detectScene(i, { force = false, quiet = false } = {}) {
    const sc = state.scenes[i];
    if (!sc) return null;
    if (state.inflight.has(sc.id)) return state.inflight.get(sc.id);
    if (!force && state.dets.has(sc.id)) return state.dets.get(sc.id);
    state.errors.delete(sc.id);
    if (force) state.dets.delete(sc.id);
    const p = (async () => {
      const started = performance.now();
      try {
        const det = await api.detect(sc.id);
        // Duración mínima para que la animación de escaneo sea perceptible.
        const minMs = prefersReducedMotion() ? 0 : 450;
        const el = performance.now() - started;
        if (el < minMs) await sleep(minMs - el);
        state.dets.set(sc.id, det);
        state.history.loaded = false; state.stats.data = null;
        return det;
      } catch (e) {
        state.errors.set(sc.id, e.message);
        if (!quiet) toastError(`Error al detectar la escena ${i + 1}`, e);
        throw e;
      } finally {
        state.inflight.delete(sc.id);
        if (state.scenes[i] === sc) {
          renderGallery();
          if (state.selected === i) renderDetectorViewer();
        }
      }
    })();
    state.inflight.set(sc.id, p);
    renderGallery();
    if (state.selected === i) renderDetectorViewer();
    try { return await p; } catch (e) { return null; }
  }

  async function generate() {
    if (state.generating || state.detectAll.running) return;
    if (state.view !== 'detector') switchView('detector');
    let params;
    try { params = readParams($('#sim-form'), 12); } catch (e) { toast('warn', 'Revisa los parámetros', e.message); return; }
    state.generating = true;
    updateDetectorButtons();
    renderGallery();
    $('#detector-viewer').replaceChildren();
    try {
      const r = await api.simulate(params);
      const scenes = (r && Array.isArray(r.scenes)) ? r.scenes : [];
      state.scenes = scenes;
      state.dets.clear(); state.errors.clear();
      state.selected = -1;
      state.generating = false;
      toast('success', `${scenes.length} escena${scenes.length === 1 ? '' : 's'} generada${scenes.length === 1 ? '' : 's'}`,
        `Dificultad ${diffLabel(params.difficulty).toLowerCase()}${params.seed !== null ? ` · semilla ${params.seed}` : ''}`);
      renderGallery();
      updateDetectorButtons();
      if (scenes.length) selectScene(0); else renderDetectorViewer();
    } catch (e) {
      state.generating = false;
      renderGallery();
      updateDetectorButtons();
      renderDetectorViewer();
      toastError('No se pudieron generar las escenas', e);
    }
  }

  async function detectAll() {
    if (state.detectAll.running || state.generating || !state.scenes.length) return;
    if (state.view !== 'detector') switchView('detector');
    const allDone = state.scenes.every((sc) => state.dets.has(sc.id));
    const targets = state.scenes.map((sc, i) => i).filter((i) => allDone || !state.dets.has(state.scenes[i].id));
    const snapshot = state.scenes;
    state.detectAll = { running: true, done: 0, total: targets.length };
    updateDetectorButtons();
    const prog = $('#detect-all-progress');
    const bar = $('#detect-all-bar');
    const lbl = $('#detect-all-label');
    prog.hidden = false;
    const update = () => {
      bar.style.width = `${(state.detectAll.done / Math.max(1, state.detectAll.total)) * 100}%`;
      lbl.textContent = `${state.detectAll.done} / ${state.detectAll.total}`;
    };
    update();
    let errors = 0;
    for (const i of targets) {
      if (state.scenes !== snapshot) break;
      if (state.selected < 0) selectScene(i, { detect: false });
      const r = await detectScene(i, { force: allDone, quiet: true });
      if (!r) errors++;
      state.detectAll.done++;
      update();
    }
    state.detectAll.running = false;
    updateDetectorButtons();
    setTimeout(() => { if (!state.detectAll.running) prog.hidden = true; }, 1200);
    if (state.scenes !== snapshot) return;
    const dets = snapshot.map((sc) => state.dets.get(sc.id)).filter(Boolean);
    const evals = dets.filter((d) => d.evaluation);
    const correct = evals.filter((d) => d.evaluation.correct).length;
    if (errors) toast('warn', 'Detección completada con errores', `${errors} escena(s) fallaron. ${correct}/${evals.length} correctas.`);
    else toast('success', 'Detección completada', `${dets.length} escenas procesadas · ${correct}/${evals.length} correctas`);
    if (state.selected >= 0) renderDetectorViewer();
  }

  function moveScene(delta) {
    if (!state.scenes.length) return;
    const i = state.selected < 0 ? 0 : clamp(state.selected + delta, 0, state.scenes.length - 1);
    if (i !== state.selected) selectScene(i);
  }

  function setupDetector() {
    linkRange($('#sim-count-range'), $('#sim-count'));
    $('#sim-form').addEventListener('submit', (e) => { e.preventDefault(); generate(); });
    $('#btn-detect-all').addEventListener('click', detectAll);
    $('#btn-prev-scene').addEventListener('click', () => moveScene(-1));
    $('#btn-next-scene').addEventListener('click', () => moveScene(1));
    renderGallery();
    renderDetectorViewer();
  }

  /* ------------------------------------------------------------------ */
  /* Vista 2: Subir imagen                                                */
  /* ------------------------------------------------------------------ */
  const MAX_UPLOAD = 10 * 1024 * 1024;
  function isAcceptedFile(f) {
    const okType = ['image/png', 'image/jpeg', 'image/jpg', 'image/pjpeg'].includes(f.type);
    const okExt = /\.(png|jpe?g)$/i.test(f.name || '');
    return okType || (!f.type && okExt);
  }

  function setUploadFile(file) {
    if (!file) return;
    if (!isAcceptedFile(file)) { toast('warn', 'Formato no admitido', 'Selecciona una imagen PNG o JPG.'); return; }
    if (file.size > MAX_UPLOAD) { toast('warn', 'Archivo demasiado grande', `El máximo es 10 MB (el archivo pesa ${fmt.bytes(file.size)}).`); return; }
    const u = state.upload;
    if (u.url) URL.revokeObjectURL(u.url);
    u.file = file; u.url = URL.createObjectURL(file); u.det = null;
    $('#upload-preview').src = u.url;
    $('#upload-name').textContent = file.name;
    $('#upload-size').textContent = fmt.bytes(file.size);
    $('#dropzone-empty').hidden = true;
    $('#dropzone-preview').hidden = false;
    $('#btn-upload-detect').disabled = false;
    $('#btn-upload-clear').disabled = false;
    renderUploadViewer();
  }

  function clearUpload() {
    const u = state.upload;
    if (u.busy) return;
    if (u.url) URL.revokeObjectURL(u.url);
    Object.assign(u, { file: null, url: null, det: null });
    $('#upload-preview').removeAttribute('src');
    $('#dropzone-empty').hidden = false;
    $('#dropzone-preview').hidden = true;
    $('#btn-upload-detect').disabled = true;
    $('#btn-upload-clear').disabled = true;
    $('#file-input').value = '';
    renderUploadViewer();
  }

  function renderUploadViewer(extra = {}) {
    const host = $('#upload-viewer');
    const u = state.upload;
    if (u.busy) {
      const dims = $('#upload-preview');
      renderViewer(host, { loading: true, imageUrl: u.url, width: dims.naturalWidth || 960, height: dims.naturalHeight || 600, title: 'Imagen subida', subtitle: u.file ? u.file.name : '' });
    } else if (u.det) {
      renderViewer(host, { det: u.det, title: 'Imagen subida', subtitle: `${u.file ? u.file.name + ' · ' : ''}${u.det.width}×${u.det.height} px · sin ground truth` });
    } else if (extra.error) {
      renderViewer(host, { error: extra.error, imageUrl: u.url, title: 'Imagen subida', onRetry: uploadDetect });
    } else if (!u.file) {
      host.replaceChildren(emptyState({ art: 'image', compact: true, title: 'Sin resultados todavía', text: 'Selecciona una imagen y pulsa «Detectar placas» para ver las cajas, recortes y lecturas.' }));
    } else {
      host.replaceChildren(emptyState({ art: 'plate', compact: true, title: 'Imagen lista', text: 'Pulsa «Detectar placas» (tecla D) para analizarla.' }));
    }
  }

  async function uploadDetect() {
    const u = state.upload;
    if (!u.file || u.busy) return;
    u.busy = true; u.det = null;
    setBusy($('#btn-upload-detect'), true);
    $('#btn-upload-clear').disabled = true;
    renderUploadViewer();
    const started = performance.now();
    try {
      const det = await api.upload(u.file);
      const el = performance.now() - started;
      if (!prefersReducedMotion() && el < 450) await sleep(450 - el);
      u.det = det;
      state.history.loaded = false; state.stats.data = null;
      const n = Array.isArray(det.plates) ? det.plates.length : 0;
      if (n) toast('success', `${n} placa${n === 1 ? '' : 's'} detectada${n === 1 ? '' : 's'}`, det.plates.map((p) => p.text).join(' · '));
      else toast('warn', 'No se detectaron placas', 'Revisa que la imagen contenga placas amarillas visibles con formato AAA-123.');
      u.busy = false;
      renderUploadViewer();
    } catch (e) {
      u.busy = false;
      toastError('Error al analizar la imagen', e);
      renderUploadViewer({ error: e.message });
    } finally {
      setBusy($('#btn-upload-detect'), false);
      $('#btn-upload-detect').disabled = !u.file;
      $('#btn-upload-clear').disabled = !u.file;
    }
  }

  function setupUpload() {
    const dz = $('#dropzone');
    const input = $('#file-input');
    dz.addEventListener('click', () => { if (!state.upload.busy) input.click(); });
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { if (input.files && input.files[0]) setUploadFile(input.files[0]); });
    let depth = 0;
    dz.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; dz.classList.add('is-over'); });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    dz.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) dz.classList.remove('is-over'); });
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); depth = 0; dz.classList.remove('is-over');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setUploadFile(f);
    });
    // Evita que el navegador abra la imagen si se suelta fuera de la zona.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
    $('#btn-upload-detect').addEventListener('click', uploadDetect);
    $('#btn-upload-clear').addEventListener('click', clearUpload);
    renderUploadViewer();
  }

  /* ------------------------------------------------------------------ */
  /* Vista 3: Evaluación por lotes                                        */
  /* ------------------------------------------------------------------ */
  let batchTimer = null;
  async function runBatch() {
    const b = state.batch;
    if (b.busy) return;
    let params;
    try { params = readParams($('#batch-form'), 50); } catch (e) { toast('warn', 'Revisa los parámetros', e.message); return; }
    b.busy = true;
    setBusy($('#btn-batch'), true);
    const running = $('#batch-running');
    const lbl = $('#batch-running-label');
    running.hidden = false;
    const t0 = performance.now();
    const tick = () => { lbl.textContent = `Generando y procesando ${params.count} escena${params.count === 1 ? '' : 's'} (${diffLabel(params.difficulty).toLowerCase()})… ${fmt.sec((performance.now() - t0) / 1000)}`; };
    tick();
    batchTimer = setInterval(tick, 200);
    if (!b.data) $('#batch-results').replaceChildren(batchSkeleton());
    else $('#batch-results').style.opacity = '.5';
    try {
      const r = await api.batch(params);
      b.data = { results: Array.isArray(r && r.results) ? r.results : [], metrics: (r && r.metrics) || null };
      b.params = params;
      state.history.loaded = false; state.stats.data = null;
      const wall = (performance.now() - t0) / 1000;
      toast('success', 'Evaluación completada', `${b.data.results.length} escenas en ${fmt.sec(wall)} · precisión ${b.data.metrics ? fmt.pct(b.data.metrics.plate_accuracy) : '—'}`);
      renderBatch();
    } catch (e) {
      toastError('La evaluación por lotes falló', e);
      if (!b.data) renderBatch();
    } finally {
      clearInterval(batchTimer);
      b.busy = false;
      running.hidden = true;
      $('#batch-results').style.opacity = '';
      setBusy($('#btn-batch'), false);
    }
  }

  function batchSkeleton() {
    return h('div', { className: 'skel-stack' },
      h('div', { className: 'kpis' }, [0, 1, 2, 3, 4].map(() => skel('skel-card', { height: '120px' }))),
      h('div', { className: 'charts' }, skel('skel-card', { height: '260px' }), skel('skel-card', { height: '260px' })),
      [0, 1, 2, 3, 4].map(() => skel('skel-row')));
  }

  const joinTexts = (arr) => (Array.isArray(arr) ? arr.map((x) => x.text).filter(Boolean) : []);

  function renderBatch() {
    const host = $('#batch-results');
    const b = state.batch;
    if (!b.data) {
      host.replaceChildren(emptyState({
        art: 'chart', title: 'Sin evaluación todavía',
        text: 'Configura el número de escenas y la dificultad, y ejecuta la evaluación para obtener métricas de precisión y latencia.',
        action: h('button', { className: 'btn btn--primary', type: 'button', on: { click: runBatch } }, icon('play'), h('span', { text: 'Ejecutar evaluación' })),
      }));
      return;
    }
    const { results, metrics } = b.data;
    const mt = metrics || {};
    const latencies = results.map((d) => num(d.processing_ms));
    const confs = results.flatMap((d) => (d.plates || []).map((p) => num(p.confidence)));
    const latMax = Math.max(...latencies, 1);
    const latHist = histogram({
      values: latencies, bins: 10, domain: [0, niceMax(latMax)], xFormat: (v) => fmt.ms0(v), color: 'var(--det)', unitLabel: 'escena(s)',
      ariaLabel: `Histograma de latencia de ${results.length} escenas, media ${fmt.ms(mt.avg_processing_ms)}`,
    });
    const confHist = histogram({
      values: confs, bins: 10, domain: [0, 1], xFormat: (v) => fmt.pct0(v), color: 'var(--accent)', unitLabel: 'placa(s)',
      ariaLabel: `Histograma de confianza de ${confs.length} placas`,
    });

    const errCount = results.filter((d) => d.evaluation && !d.evaluation.correct).length;
    const p = b.params;

    const tableBody = h('tbody');
    const foot = h('div', { className: 'table-foot' });
    const onlyErr = h('input', { type: 'checkbox', checked: b.onlyErrors, on: { change: (e) => { b.onlyErrors = e.target.checked; fillTable(); } } });
    function fillTable() {
      const rows = results.filter((d) => !b.onlyErrors || (d.evaluation && !d.evaluation.correct));
      if (!rows.length) {
        tableBody.replaceChildren(h('tr', null, h('td', { attrs: { colspan: 7 } },
          emptyState({ art: 'plate', compact: true, title: b.onlyErrors ? 'Sin errores en este lote' : 'Sin resultados', text: b.onlyErrors ? 'Todas las escenas se leyeron correctamente. 🎯' : '' }))));
      } else {
        tableBody.replaceChildren(...rows.map((d) => {
          const idx = results.indexOf(d);
          return detectionRow(d, {
            index: idx + 1,
            onOpen: () => openDetail({ det: d, title: `Escena ${idx + 1} del lote`, subtitle: `${diffLabel(d.difficulty)} · ID ${d.id}`, dialogTitle: 'Detalle · evaluación por lotes' }),
            showDate: false,
          });
        }));
      }
      foot.textContent = `Mostrando ${rows.length} de ${results.length} escenas · ${errCount} con errores`;
    }
    fillTable();

    host.replaceChildren(h('div', { className: 'stats-grid' },
      h('div', { className: 'gallery-head' },
        h('h2', { className: 'section-title' }, 'Resultados del lote', h('span', { className: 'count-pill', text: String(results.length) })),
        p ? h('span', { className: 'small muted', text: `Dificultad ${diffLabel(p.difficulty).toLowerCase()}${p.seed !== null ? ` · semilla ${p.seed}` : ' · semilla aleatoria'}` }) : null),
      metricsKpis(mt),
      h('div', { className: 'charts' },
        chartCard('Distribución de latencia', 'clock',
          h('p', { className: 'small muted', style: 'margin-bottom:8px', text: `Tiempo de procesamiento por escena · media ${fmt.ms(mt.avg_processing_ms)}` }),
          latHist,
          dataTableDetails('Distribución de latencia', ['Rango', 'Escenas'], latHist._bins.map((bn) => [`${fmt.ms0(bn.from)} – ${fmt.ms0(bn.to)}`, fmt.int(bn.count)]))),
        chartCard('Distribución de confianza', 'gauge',
          h('p', { className: 'small muted', style: 'margin-bottom:8px', text: `Confianza global de ${fmt.int(confs.length)} placas detectadas` }),
          confs.length ? confHist : emptyState({ art: 'chart', compact: true, title: 'No hay placas detectadas' }),
          confs.length ? dataTableDetails('Distribución de confianza', ['Rango', 'Placas'], confHist._bins.map((bn) => [`${fmt.pct0(bn.from)} – ${fmt.pct0(bn.to)}`, fmt.int(bn.count)])) : null)),
      h('section', { className: 'card table-card', attrs: { 'aria-label': 'Tabla de resultados del lote' } },
        h('div', { className: 'table-toolbar' },
          h('h3', { className: 'card__title' }, icon('batch'), 'Detalle por escena'),
          h('label', { className: 'toggle' }, onlyErr, `Solo errores (${errCount})`)),
        h('div', { className: 'table-scroll' },
          h('table', { className: 'data-table' },
            h('caption', { className: 'sr-only', text: 'Resultados por escena. Pulsa Enter sobre una fila para ver el detalle.' }),
            h('thead', null, h('tr', null,
              h('th', { attrs: { scope: 'col' }, text: 'Escena' }),
              h('th', { attrs: { scope: 'col' }, text: 'Esperado' }),
              h('th', { attrs: { scope: 'col' }, text: 'Detectado' }),
              h('th', { attrs: { scope: 'col' }, text: 'Resultado' }),
              h('th', { className: 'num', attrs: { scope: 'col' }, text: 'Confianza' }),
              h('th', { className: 'num', attrs: { scope: 'col' }, text: 'Tiempo' }),
              h('th', { className: 'hide-sm', attrs: { scope: 'col' }, text: 'Dificultad' }))),
            tableBody)),
        foot)));
  }

  /** Fila de tabla reutilizada por Lotes e Historial. */
  function detectionRow(d, { index, onOpen, showDate }) {
    const plates = Array.isArray(d.plates) ? d.plates : [];
    const gt = joinTexts(d.ground_truth);
    const gtSet = new Set(gt.map(normPlate));
    const avgC = avgConfidence(plates);
    let result;
    if (d.evaluation) result = d.evaluation.correct ? h('span', { className: 'badge badge--ok' }, icon('check'), 'Correcta') : h('span', { className: 'badge badge--err' }, icon('x'), 'Error');
    else result = plates.length ? h('span', { className: 'badge' }, 'Sin GT') : h('span', { className: 'badge badge--warn' }, 'Sin placas');
    const tr = h('tr', {
      className: 'is-clickable', tabIndex: 0,
      attrs: { 'aria-label': `${showDate ? fmt.date(d.created_at) : 'Escena ' + index}: detectado ${plates.map((p) => p.text).join(', ') || 'nada'}. Abrir detalle.` },
      on: { click: onOpen, keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } },
    },
    h('td', null, h('div', { style: 'display:flex;align-items:center;gap:10px' },
      h('img', { className: 'mini', src: d.image_url, alt: '', loading: 'lazy', decoding: 'async' }),
      h('div', null,
        h('div', { className: 'small', style: 'font-weight:600', text: showDate ? fmt.date(d.created_at) : `#${index}` }),
        h('div', { className: 'xsmall muted', text: showDate ? `${SOURCE_LABEL[d.source] || d.source}${d.difficulty ? ' · ' + diffLabel(d.difficulty) : ''}` : `ID ${d.id}` })))),
    h('td', null, gt.length ? h('div', { className: 'plate-list' }, gt.map((t) => h('span', { className: 'plate-text', text: t }))) : h('span', { className: 'muted', text: '—' })),
    h('td', null, plates.length ? h('div', { className: 'plate-list' }, plates.map((p) => h('span', { className: 'plate-text' + (d.ground_truth && !gtSet.has(normPlate(p.text)) ? ' is-err' : ''), text: p.text || '?' }))) : h('span', { className: 'muted', text: 'Ninguna' })),
    h('td', null, result),
    h('td', { className: 'num', text: avgC === null ? '—' : fmt.pct(avgC) }),
    h('td', { className: 'num', text: fmt.ms(d.processing_ms) }),
    h('td', { className: 'hide-sm' }, d.difficulty ? h('span', { className: `diff-${d.difficulty}`, text: `● ${diffLabel(d.difficulty)}` }) : h('span', { className: 'muted', text: '—' })));
    return tr;
  }

  function setupBatch() {
    linkRange($('#batch-count-range'), $('#batch-count'));
    $('#batch-form').addEventListener('submit', (e) => { e.preventDefault(); runBatch(); });
    renderBatch();
  }

  /* ------------------------------------------------------------------ */
  /* Vista 4: Historial                                                   */
  /* ------------------------------------------------------------------ */
  async function loadHistory({ force = false } = {}) {
    const hs = state.history;
    if (hs.loading) return;
    if (hs.loaded && !force) { renderHistory(); return; }
    hs.loading = true;
    const btn = $('#btn-history-refresh');
    setBusy(btn, true);
    if (!hs.loaded) renderHistory();
    try {
      const r = await api.history();
      hs.items = Array.isArray(r && r.detections) ? r.detections : [];
      hs.loaded = true;
    } catch (e) {
      toastError('No se pudo cargar el historial', e);
      hs.error = e.message;
    } finally {
      hs.loading = false;
      setBusy(btn, false);
      renderHistory();
    }
  }

  function filterHistory() {
    const hs = state.history;
    const q = normPlate(hs.q).replace(/[^A-Z0-9-]/g, '');
    const qLoose = q.replace(/-/g, '');
    return hs.items.filter((d) => {
      if (hs.source !== 'all' && d.source !== hs.source) return false;
      const plates = Array.isArray(d.plates) ? d.plates : [];
      if (hs.result === 'correct' && !(d.evaluation && d.evaluation.correct)) return false;
      if (hs.result === 'incorrect' && !(d.evaluation && !d.evaluation.correct)) return false;
      if (hs.result === 'unevaluated' && d.evaluation) return false;
      if (hs.result === 'empty' && plates.length) return false;
      if (q) {
        const texts = [...plates.map((p) => p.text), ...joinTexts(d.ground_truth)].map((t) => normPlate(t));
        if (!texts.some((t) => t.includes(q) || t.replace(/-/g, '').includes(qLoose))) return false;
      }
      return true;
    });
  }

  function renderHistory() {
    const host = $('#history-list');
    const hs = state.history;
    $('#btn-history-clear').disabled = !hs.items.length || hs.loading;
    if (hs.loading && !hs.loaded) {
      host.replaceChildren(h('div', { className: 'skel-stack', attrs: { 'aria-label': 'Cargando historial' } }, [0, 1, 2, 3, 4, 5].map(() => skel('skel-row'))));
      return;
    }
    if (!hs.loaded) {
      host.replaceChildren(emptyState({ art: 'history', title: 'No se pudo cargar el historial', text: hs.error || 'Comprueba la conexión con el backend.',
        action: h('button', { className: 'btn btn--ghost', type: 'button', on: { click: () => loadHistory({ force: true }) } }, icon('refresh'), h('span', { text: 'Reintentar' })) }));
      return;
    }
    if (!hs.items.length) {
      host.replaceChildren(emptyState({
        art: 'history', title: 'El historial está vacío',
        text: 'Cada detección que ejecutes (simulada, subida o por lotes) aparecerá aquí.',
        action: h('button', { className: 'btn btn--primary', type: 'button', on: { click: () => switchView('detector') } }, icon('scan'), h('span', { text: 'Ir al detector' })),
      }));
      return;
    }
    const rows = filterHistory();
    const table = h('section', { className: 'card table-card' },
      h('div', { className: 'table-scroll' },
        h('table', { className: 'data-table' },
          h('caption', { className: 'sr-only', text: 'Historial de detecciones. Pulsa Enter sobre una fila para abrir el detalle.' }),
          h('thead', null, h('tr', null,
            h('th', { attrs: { scope: 'col' }, text: 'Fecha / origen' }),
            h('th', { attrs: { scope: 'col' }, text: 'Esperado' }),
            h('th', { attrs: { scope: 'col' }, text: 'Detectado' }),
            h('th', { attrs: { scope: 'col' }, text: 'Resultado' }),
            h('th', { className: 'num', attrs: { scope: 'col' }, text: 'Confianza' }),
            h('th', { className: 'num', attrs: { scope: 'col' }, text: 'Tiempo' }),
            h('th', { className: 'hide-sm', attrs: { scope: 'col' }, text: 'Dificultad' }))),
          h('tbody', null, rows.length ? rows.map((d, i) => detectionRow(d, { index: i + 1, showDate: true, onOpen: () => openHistoryItem(d) }))
            : h('tr', null, h('td', { attrs: { colspan: 7 } }, emptyState({ art: 'history', compact: true, title: 'Sin coincidencias', text: 'Ningún registro coincide con los filtros aplicados.',
              action: h('button', { className: 'btn btn--ghost btn--sm', type: 'button', on: { click: resetHistoryFilters } }, h('span', { text: 'Limpiar filtros' })) })))))),
      h('div', { className: 'table-foot', attrs: { role: 'status', 'aria-live': 'polite' }, text: `Mostrando ${rows.length} de ${hs.items.length} registros` }));
    host.replaceChildren(table);
  }

  function resetHistoryFilters() {
    const hs = state.history;
    hs.q = ''; hs.source = 'all'; hs.result = 'all';
    $('#history-q').value = ''; $('#history-source').value = 'all'; $('#history-result').value = 'all';
    renderHistory();
  }

  let historyReq = 0;
  async function openHistoryItem(d) {
    const req = ++historyReq;
    const title = d.source === 'upload' ? 'Imagen subida' : `Escena simulada${d.difficulty ? ' · ' + diffLabel(d.difficulty) : ''}`;
    const subtitle = `${fmt.date(d.created_at)} · ID ${d.id}`;
    const body = openDetail({ loading: true, imageUrl: d.image_url, width: d.width, height: d.height, title, subtitle, dialogTitle: 'Detalle del historial' });
    try {
      const full = await api.historyItem(d.id);
      if (req !== historyReq || !$('#detail-dialog').open) return;
      renderViewer(body, { det: full, title, subtitle });
    } catch (e) {
      if (req !== historyReq) return;
      toastError('No se pudo abrir el detalle', e);
      renderViewer(body, { error: e.message, imageUrl: d.image_url, width: d.width, height: d.height, title, subtitle, onRetry: () => openHistoryItem(d) });
    }
  }

  async function clearHistory() {
    const ok = await confirmDialog({
      title: '¿Borrar todo el historial?',
      message: 'Se eliminarán todas las detecciones y escenas simuladas guardadas en el servidor. Esta acción no se puede deshacer.',
      confirmText: 'Borrar historial',
    });
    if (!ok) return;
    const btn = $('#btn-history-clear');
    setBusy(btn, true);
    try {
      const r = await api.clearHistory();
      toast('success', 'Historial borrado', `Se eliminaron ${fmt.int(r && r.deleted)} registro(s).`);
      state.history.items = []; state.history.loaded = true;
      state.stats.data = null;
      // El backend también borra las escenas: limpiar el detector.
      state.scenes = []; state.selected = -1; state.dets.clear(); state.errors.clear();
      renderGallery(); updateDetectorButtons(); renderDetectorViewer();
    } catch (e) {
      toastError('No se pudo borrar el historial', e);
    } finally {
      setBusy(btn, false);
      renderHistory();
    }
  }

  function setupHistory() {
    let deb;
    $('#history-q').addEventListener('input', (e) => { clearTimeout(deb); deb = setTimeout(() => { state.history.q = e.target.value; renderHistory(); }, 120); });
    $('#history-source').addEventListener('change', (e) => { state.history.source = e.target.value; renderHistory(); });
    $('#history-result').addEventListener('change', (e) => { state.history.result = e.target.value; renderHistory(); });
    $('#btn-history-refresh').addEventListener('click', () => loadHistory({ force: true }));
    $('#btn-history-clear').addEventListener('click', clearHistory);
  }

  /* ------------------------------------------------------------------ */
  /* Vista 5: Estadísticas                                                */
  /* ------------------------------------------------------------------ */
  async function loadStats({ force = false } = {}) {
    const st = state.stats;
    if (st.loading) return;
    if (st.data && !force) { renderStats(); return; }
    st.loading = true;
    const btn = $('#btn-stats-refresh');
    setBusy(btn, true);
    if (!st.data) renderStats();
    try {
      st.data = await api.stats();
      st.error = null;
    } catch (e) {
      st.error = e.message;
      toastError('No se pudieron cargar las estadísticas', e);
    } finally {
      st.loading = false;
      setBusy(btn, false);
      renderStats();
    }
  }

  function renderStats() {
    const host = $('#stats-content');
    const st = state.stats;
    if (st.loading && !st.data) {
      host.replaceChildren(h('div', { className: 'skel-stack' },
        h('div', { className: 'kpis' }, [0, 1, 2, 3, 4, 5].map(() => skel('skel-card', { height: '120px' }))),
        h('div', { className: 'charts' }, skel('skel-card', { height: '300px' }), skel('skel-card', { height: '300px' }))));
      return;
    }
    if (!st.data) {
      host.replaceChildren(emptyState({ art: 'chart', title: 'Estadísticas no disponibles', text: st.error || 'Comprueba la conexión con el backend.',
        action: h('button', { className: 'btn btn--ghost', type: 'button', on: { click: () => loadStats({ force: true }) } }, icon('refresh'), h('span', { text: 'Reintentar' })) }));
      return;
    }
    const mt = st.data;
    if (!num(mt.total_detections)) {
      host.replaceChildren(emptyState({
        art: 'chart', title: 'Todavía no hay datos',
        text: 'Ejecuta algunas detecciones o una evaluación por lotes para ver las métricas acumuladas.',
        action: h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center' },
          h('button', { className: 'btn btn--primary', type: 'button', on: { click: () => switchView('detector') } }, icon('scan'), h('span', { text: 'Ir al detector' })),
          h('button', { className: 'btn btn--ghost', type: 'button', on: { click: () => switchView('batch') } }, icon('batch'), h('span', { text: 'Evaluación por lotes' }))),
      }));
      return;
    }
    const keys = ['easy', 'medium', 'hard'];
    const bd = mt.by_difficulty || {};
    const cats = keys.map((k) => DIFF_LABEL[k]);
    const has = (k) => bd[k] && num(bd[k].detections) > 0;
    const val = (k, f) => (has(k) ? num(bd[k][f]) : null);
    const accSeries = [
      { label: 'Precisión de placas', color: 'var(--series-1)', values: keys.map((k) => val(k, 'plate_accuracy')) },
      { label: 'Precisión de caracteres', color: 'var(--series-2)', values: keys.map((k) => val(k, 'char_accuracy')) },
      { label: 'Tasa de detección', color: 'var(--series-3)', values: keys.map((k) => val(k, 'detection_rate')) },
    ];
    const legend = h('div', { className: 'chart-legend' }, accSeries.map((se) => h('span', null, h('i', { style: { background: se.color } }), se.label)));
    const accChart = barChart({
      categories: cats, series: accSeries, max: 1, yFormat: fmt.pct0, valueFormat: fmt.pct0, height: 270,
      ariaLabel: 'Precisión por dificultad: ' + keys.map((k, i) => `${cats[i]}: placas ${has(k) ? fmt.pct(bd[k].plate_accuracy) : 'sin datos'}`).join('; '),
    });
    const latChart = barChart({
      categories: cats, series: [{ label: 'Latencia media', color: 'var(--det)', values: keys.map((k) => val(k, 'avg_processing_ms')) }],
      yFormat: fmt.ms0, valueFormat: fmt.ms0, height: 270,
      ariaLabel: 'Latencia media por dificultad: ' + keys.map((k, i) => `${cats[i]}: ${has(k) ? fmt.ms(bd[k].avg_processing_ms) : 'sin datos'}`).join('; '),
    });
    const tableRows = keys.map((k, i) => [cats[i], has(k) ? fmt.int(bd[k].detections) : '0',
      has(k) ? fmt.pct(bd[k].plate_accuracy) : '—', has(k) ? fmt.pct(bd[k].char_accuracy) : '—',
      has(k) ? fmt.pct(bd[k].detection_rate) : '—', has(k) ? fmt.ms(bd[k].avg_processing_ms) : '—']);

    host.replaceChildren(h('div', { className: 'stats-grid' },
      h('div', { className: 'kpis' },
        kpiEl({ label: 'Detecciones totales', value: fmt.int(mt.total_detections), sub: 'Imágenes procesadas', iconName: 'image' }),
        kpiEl({ label: 'Placas leídas', value: fmt.int(mt.total_plates), sub: 'Regiones reconocidas', iconName: 'car' })),
      metricsKpis(mt),
      h('div', { className: 'charts' },
        chartCard('Precisión por dificultad', 'stats', legend, accChart,
          dataTableDetails('Métricas por dificultad', ['Dificultad', 'Detecciones', 'Placas', 'Caracteres', 'Detección', 'Latencia'], tableRows)),
        chartCard('Latencia media por dificultad', 'clock',
          h('p', { className: 'small muted', style: 'margin-bottom:8px', text: 'Tiempo medio de procesamiento por imagen' }),
          latChart,
          h('div', { className: 'chart-legend', style: 'margin-top:8px' }, keys.map((k, i) => h('span', null, `${cats[i]}: ${has(k) ? fmt.int(bd[k].detections) : 0} ${has(k) && bd[k].detections === 1 ? 'detección' : 'detecciones'}`))))),
      h('p', { className: 'xsmall muted' }, `Objetivo de precisión (placas exactas): ≥ 95 % fácil, ≥ 90 % media, ≥ 75 % difícil · latencia < 500 ms. Datos 100 % simulados.`)));
  }

  function setupStats() {
    $('#btn-stats-refresh').addEventListener('click', () => loadStats({ force: true }));
  }

  /* ------------------------------------------------------------------ */
  /* Atajos de teclado                                                    */
  /* ------------------------------------------------------------------ */
  function isTypingTarget(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') return !['checkbox', 'radio', 'button', 'submit', 'range'].includes(el.type);
    return false;
  }

  function setupShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const key = e.key;
      const dialogOpen = anyDialogOpen();
      const detailOpen = $('#detail-dialog').open;
      if (key === '?') { e.preventDefault(); if (!dialogOpen) $('#help-dialog').showModal(); return; }
      if (dialogOpen) {
        if (detailOpen && (key === 'o' || key === 'O')) { toggleMode(); e.preventDefault(); }
        if (detailOpen && (key === 'b' || key === 'B')) { toggleBoxes(); e.preventDefault(); }
        return;
      }
      // Dejar que los radios/segmentados y la lista de pestañas usen sus flechas.
      const inRadio = e.target && e.target.type === 'radio';
      const inTabs = e.target && e.target.closest && e.target.closest('[role="tablist"]');
      switch (key) {
        case '1': case '2': case '3': case '4': case '5':
          switchView(VIEWS[+key - 1]); e.preventDefault(); break;
        case 'g': case 'G': e.preventDefault(); generate(); break;
        case 'd': case 'D':
          e.preventDefault();
          if (state.view === 'upload') uploadDetect();
          else if (state.view === 'detector' && state.selected >= 0) detectScene(state.selected, { force: true });
          break;
        case 'a': case 'A': e.preventDefault(); detectAll(); break;
        case 'ArrowLeft': case 'ArrowRight':
          if (inRadio || inTabs || state.view !== 'detector') return;
          e.preventDefault(); moveScene(key === 'ArrowRight' ? 1 : -1); break;
        case 'o': case 'O': e.preventDefault(); toggleMode(); break;
        case 'b': case 'B': e.preventDefault(); toggleBoxes(); break;
        case 't': case 'T': e.preventDefault(); toggleTheme(); break;
        default: break;
      }
    });
  }
  function toggleMode() { state.viewOpts.mode = state.viewOpts.mode === 'original' ? 'annotated' : 'original'; refreshViewOpts(); }
  function toggleBoxes() { state.viewOpts.boxes = !state.viewOpts.boxes; refreshViewOpts(); }

  /* ------------------------------------------------------------------ */
  /* Arranque                                                             */
  /* ------------------------------------------------------------------ */
  function init() {
    setTheme(currentTheme());
    $('#btn-theme').addEventListener('click', toggleTheme);
    $('#btn-help').addEventListener('click', () => $('#help-dialog').showModal());
    $$('dialog').forEach((d) => { if (d.id !== 'confirm-dialog') setupDialog(d); });
    $('#detail-dialog').addEventListener('close', () => { $('#detail-body').replaceChildren(); });
    setupNav();
    setupDetector();
    setupUpload();
    setupBatch();
    setupHistory();
    setupStats();
    setupShortcuts();
    const initial = (location.hash || '').replace(/^#\/?/, '');
    switchView(VIEWS.includes(initial) ? initial : 'detector');
    checkHealth();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && state.health.ok === false) checkHealth(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
