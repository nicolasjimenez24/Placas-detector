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
  const nfDec3 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });
  const nfCompact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
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
    dec3: (v) => nfDec3.format(num(v)),
    compact: (v) => nfCompact.format(num(v)),
    date: (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : dfDate.format(d); },
    time: (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : dfTime.format(d); },
    bytes: (b) => b < 1024 * 1024 ? `${nfDec.format(b / 1024)} KB` : `${nfDec.format(b / 1024 / 1024)} MB`,
  };
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  /** Formatea solo si hay número; si falta el dato devuelve «—». */
  const orDash = (f) => (v) => (isNum(v) ? f(v) : '—');
  const pctOr = orDash(fmt.pct);
  const msOr = orDash(fmt.ms);
  const intOr = orDash(fmt.int);

  const SET_LABEL = { colombia: 'Colombianas', dataset: 'Dataset público' };
  const SET_SINGULAR = { colombia: 'Foto colombiana', dataset: 'Foto del dataset' };
  const SOURCE_LABEL = { gallery: 'Galería', upload: 'Subida' };
  const setLabel = (k) => SET_LABEL[k] || (k ? String(k) : '—');
  const SETS = ['colombia', 'dataset'];

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
    // Motor "ml" (backend/app/ml_inference.py)
    yolo_deteccion: 'Detección YOLO', recorte: 'Recorte', crnn_lectura: 'Lectura CRNN', formato_colombiano: 'Formato colombiano',
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

  /** Texto de placa comparable: mayúsculas, solo letras y dígitos (ABC-123 == ABC123). */
  const normPlate = (t) => String(t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  /** Etiqueta del conjunto de la galería (colombianas / dataset público). */
  function setBadge(set, { xs = false } = {}) {
    if (!set) return null;
    return h('span', { className: `badge set-badge set-badge--${set}${xs ? ' badge--xs' : ''}`, attrs: { title: SET_SINGULAR[set] || set } },
      icon(set === 'colombia' ? 'car' : 'database'), setLabel(set));
  }

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

  /** Sesión vencida o inexistente: a la pantalla de login, volviendo luego a la sección actual. */
  function goToLogin() {
    const next = /^#[a-z]+$/.test(location.hash) ? `?next=${encodeURIComponent(location.hash)}` : '';
    location.replace(`/login.html${next}`);
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
        if (res.status === 401 && !path.startsWith('/api/auth/')) goToLogin();
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
    gallery: () => request('/api/gallery', { timeout: 30000 }),
    detect: (photoId) => request('/api/detect', { method: 'POST', body: { photo_id: photoId }, timeout: 60000 }),
    upload: (file) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      return request('/api/detect/upload', { method: 'POST', form: fd, timeout: 90000 });
    },
    model: () => request('/api/model', { timeout: 15000 }),
    report: () => request('/api/report', { timeout: 15000 }),
    authStatus: () => request('/api/auth/status', { timeout: 8000 }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    batch: (p) => request('/api/detect/batch', { method: 'POST', body: p, timeout: 300000 }),
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
    view: 'inicio',
    user: null,
    report: { data: null, loading: false, error: null, promise: null },
    testsView: { q: '', result: 'all', set: 'all' },
    health: { ok: null, version: null, everOk: false },
    // Detector
    photos: [],            // galería de fotos reales (GET /api/gallery)
    sets: null,            // información de cada conjunto (fuente, licencia…)
    galleryLoading: false,
    galleryError: null,
    setFilter: 'all',
    selectedId: null,
    dets: new Map(),       // photo_id -> Detection
    errors: new Map(),     // photo_id -> mensaje
    inflight: new Map(),   // photo_id -> Promise
    // Opciones del visor (compartidas)
    viewOpts: { mode: 'original', boxes: true, gt: true },
    // Subida
    upload: { file: null, url: null, det: null, busy: false },
    // Lotes
    batch: { data: null, busy: false, onlyErrors: false, params: null },
    // Historial
    history: { items: [], loaded: false, loading: false, q: '', source: 'all', result: 'all', set: 'all' },
    // Estadísticas
    stats: { data: null, loading: false },
    // Modelo entrenado: { available, card } de GET /api/model
    model: { data: null, loading: false, error: null, promise: null },
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
  /* Descarga, Portapapeles y Exportación                                */
  /* ------------------------------------------------------------------ */
  function copyToClipboard(text, btn) {
    if (!text) return;
    const clean = String(text).trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(clean).then(() => {
        toast('success', 'Placa copiada', `«${clean}» copiada al portapapeles.`);
        if (btn) {
          btn.classList.add('is-copied');
          setTimeout(() => btn.classList.remove('is-copied'), 1500);
        }
      }).catch(() => fallbackCopy(clean));
    } else {
      fallbackCopy(clean);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('success', 'Placa copiada', `«${text}» copiada.`);
    } catch (e) {
      toast('info', 'Texto', text);
    }
    ta.remove();
  }

  function downloadImage(url, filename) {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'placavision_imagen.png';
    document.body.append(a);
    a.click();
    a.remove();
    toast('success', 'Descarga iniciada', filename);
  }

  function downloadBlob(content, filename, type = 'text/csv;charset=utf-8;') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('success', 'Archivo exportado', filename);
  }

  function openZoomImage(url, title = 'Inspección de imagen') {
    if (!url) return;
    const dlg = $('#zoom-dialog');
    const imgEl = $('#zoom-img');
    imgEl.src = url;
    $('#zoom-title').textContent = title;
    $('#btn-zoom-download').onclick = () => downloadImage(url, 'placavision_ampliada.png');
    dlg.showModal();
  }

  /* ------------------------------------------------------------------ */
  /* Componentes de placa                                                 */
  /* ------------------------------------------------------------------ */
  function plateEl(text, { small = false, muted = false, label, city, copyable = false } = {}) {
    const isCol = /^[A-Z]{3}[0-9]{3}$/.test(normPlate(text));
    if (!city) city = isCol ? 'COLOMBIA' : 'PLACA';
    const flagEl = isCol && !small ? h('span', { className: 'plate__flag', attrs: { 'aria-hidden': 'true' } },
      h('span'), h('span'), h('span')) : null;
    const plate = h('div', {
      className: 'plate' + (small ? ' plate--sm' : '') + (muted ? ' plate--muted' : '') + (isCol ? ' plate--colombia' : ''),
      attrs: { role: 'img', 'aria-label': label || `Placa ${text || 'sin lectura'}` },
    },
    h('span', { className: 'plate__text', text: text || '———' }),
    h('span', { className: 'plate__city' }, flagEl, city));

    if (!copyable || !text) return plate;

    const copyBtn = h('button', {
      type: 'button',
      className: 'plate-copy-btn' + (small ? ' btn-copy-sm' : ''),
      attrs: { title: `Copiar placa ${text}`, 'aria-label': `Copiar placa ${text}` },
      on: { click: (e) => { e.stopPropagation(); copyToClipboard(text, copyBtn); } },
    }, icon('copy'));

    return h('div', { className: 'plate-wrap' }, plate, copyBtn);
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

  function editDistance(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
      prev = cur;
    }
    return prev[b.length];
  }

  /** ¿La placa detectada i es un error frente a lo esperado? (las esperadas sin texto solo cuentan por posición) */
  const plateIsErr = (p, gts, gi) => gi < 0 || (!!gts[gi].text && normPlate(gts[gi].text) !== normPlate(p.text));
  const gtText = (g) => (g && g.text) || 'texto desconocido';

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
    // Esperadas sin caja (fotos colombianas): la detección libre cuya lectura más se parezca (como el backend).
    gts.forEach((g, j) => {
      if (Array.isArray(g.bbox) || usedG.has(j)) return;
      let best = -1, bestD = Infinity;
      plates.forEach((p, i) => {
        if (res.pairs[i] !== -1) return;
        const d = editDistance(normPlate(p.text), normPlate(g.text));
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0) { res.pairs[best] = j; usedG.add(j); }
    });
    plates.forEach((p, i) => {
      if (res.pairs[i] !== -1) return;
      const j = gts.findIndex((g, k) => !usedG.has(k) && g.text && normPlate(g.text) === normPlate(p.text));
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
   * model = { det?, imageUrl, width?, height?, loading?, error?, title?, subtitle?, onRetry?, onRedetect?, set?, groundTruth? }
   * (set: conjunto de la galería a mostrar mientras aún no hay Detection)
   */
  function renderViewer(host, model) {
    host._viewerModel = model;
    const det = model.det || null;
    const photoSet = det ? det.photo_set : (model.set || null);
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
      style: { cursor: 'zoom-in' },
      attrs: { title: 'Haz clic para ampliar la imagen (Zoom)' },
      on: { click: () => {
        const curSrc = (vo.mode === 'annotated' && hasAnnotated) ? det.annotated_url : ((det && det.image_url) || model.imageUrl || '');
        if (curSrc) openZoomImage(curSrc, model.title || 'Inspección de imagen');
      } },
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
        if (missed) overlay.append(s('text', { class: 'gt-label gt-layer', x, y: y + hh + fs * 1.05, 'font-size': fs * 0.8, text: `No detectada${g.text ? ': ' + g.text : ''}` }));
      });
    }

    plates.forEach((p, i) => {
      if (!Array.isArray(p.bbox)) return;
      const [x, y, w, hh] = p.bbox;
      const gi = match.pairs[i];
      const isErr = gts ? plateIsErr(p, gts, gi) : false;
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
        h('div', { className: 'viewer__heading-row' },
          h('h2', { className: 'card__title' }, icon(det && det.source === 'upload' ? 'upload' : 'car'), model.title || 'Resultado'),
          setBadge(photoSet)),
        model.subtitle ? h('p', { className: 'xsmall muted', text: model.subtitle }) : null),
      h('div', { className: 'spacer' }),
      h('div', { className: 'segmented segmented--sm', attrs: { role: 'radiogroup', 'aria-label': 'Imagen mostrada (tecla O)' } },
        mkRadio('original', 'Original', false),
        mkRadio('annotated', 'Anotada', !hasAnnotated)),
      h('label', { className: 'toggle', attrs: { title: 'Mostrar cajas dibujadas en el cliente (B)' } },
        h('input', { type: 'checkbox', className: 'opt-boxes', checked: vo.boxes, on: { change: (e) => { state.viewOpts.boxes = e.target.checked; applyViewOpts(); } } }), 'Cajas'),
      gts && gts.some((g) => Array.isArray(g.bbox)) ? h('label', { className: 'toggle', attrs: { title: 'Mostrar las cajas esperadas (punteadas)' } },
        h('input', { type: 'checkbox', className: 'opt-gt', checked: vo.gt, on: { change: (e) => { state.viewOpts.gt = e.target.checked; applyViewOpts(); } } }), 'Valor esperado') : null,
      h('button', { className: 'icon-btn icon-btn--sm', type: 'button', on: { click: () => {
        const curSrc = (vo.mode === 'annotated' && hasAnnotated) ? det.annotated_url : ((det && det.image_url) || model.imageUrl || '');
        if (curSrc) downloadImage(curSrc, `placavision_${(det && det.id) || 'img'}.png`);
      } }, attrs: { title: 'Descargar imagen actual', 'aria-label': 'Descargar imagen actual' } }, icon('download')),
      h('button', { className: 'icon-btn icon-btn--sm', type: 'button', on: { click: () => {
        const curSrc = (vo.mode === 'annotated' && hasAnnotated) ? det.annotated_url : ((det && det.image_url) || model.imageUrl || '');
        if (curSrc) openZoomImage(curSrc, model.title || 'Inspección de imagen');
      } }, attrs: { title: 'Inspeccionar en pantalla completa (Zoom)', 'aria-label': 'Inspeccionar en pantalla completa (Zoom)' } }, icon('maximize')),
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
          text: 'El modelo entrenado no encontró ninguna placa. Suele pasar si la placa sale muy pequeña, borrosa, tapada o muy inclinada.',
        }));
      }
      plates.forEach((p, i) => side.append(plateCardEl(p, i, plates.length, gts, match.pairs[i])));
      if (gts && match.missed.length) {
        side.append(h('div', { className: 'missed-card', attrs: { role: 'note' } },
          h('h4', null, icon('alert'), `${match.missed.length} placa${match.missed.length === 1 ? '' : 's'} sin detectar`),
          h('div', { className: 'list' }, match.missed.map((j) => plateEl(gts[j].text, { small: true, muted: true, label: `Placa esperada no detectada: ${gtText(gts[j])}` })))));
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
      ev && ev.readable ? metric('type', 'Precisión caracteres', fmt.pct(ev.char_accuracy)) : null,
      ev ? metric('check', 'Lecturas exactas', ev.readable ? `${fmt.int(ev.exact_matches)} / ${fmt.int(ev.readable)}` : 'Sin texto esperado') : null,
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
        ? h('span', { className: 'badge badge--ok', attrs: { title: 'Cumple el formato de placa colombiana ABC123' } }, icon('check'), 'Formato colombiano')
        : h('span', { className: 'badge badge--warn', attrs: { title: 'No cumple el formato colombiano ABC123 (puede ser de otro país)' } }, icon('alert'), 'Otro formato')));
    const aside = h('div', { className: 'plate-card__aside' }, meterEl('Confianza global', p.confidence));
    if (p.crop_url) {
      aside.append(h('figure', { className: 'crop' },
        h('img', { src: p.crop_url, alt: `Recorte de la placa ${p.text}`, loading: 'lazy', decoding: 'async' }),
        h('figcaption', { text: 'Recorte real' })));
    }
    card.append(h('div', { className: 'plate-card__hero' }, plateEl(p.text, { copyable: true }), aside));
    card.append(charsEl(p.chars));

    // Datos extra del modelo: lectura cruda del CRNN y confianza del detector YOLO.
    const raw = typeof p.raw_text === 'string' ? p.raw_text.trim() : '';
    const showRaw = raw !== '' && raw !== String(p.text ?? '').trim();
    const hasDetConf = isNum(p.detection_confidence);
    if (showRaw || hasDetConf) {
      card.append(h('dl', { className: 'plate-extra' },
        showRaw ? h('div', { className: 'plate-extra__row', attrs: { title: 'Lectura del lector CRNN antes de ajustarla al formato colombiano ABC123' } },
          h('dt', { text: 'Lectura sin formato:' }), h('dd', { className: 'mono', text: raw })) : null,
        hasDetConf ? h('div', { className: 'plate-extra__row', attrs: { title: 'Confianza del detector YOLO al localizar la placa. La confianza global es esta × la confianza media de lectura.' } },
          h('dt', { text: 'Confianza del detector:' }), h('dd', { className: 'mono', text: fmt.pct(p.detection_confidence) })) : null));
    }

    if (gts) {
      const cmp = h('div', { className: 'gt-compare' });
      if (gi >= 0 && !gts[gi].text) {
        cmp.append(h('div', { className: 'gt-compare__row' },
          h('span', { className: 'gt-compare__label', text: 'Valor esperado' }),
          h('span', { className: 'badge badge--ok' }, icon('check'), 'Placa localizada'),
          h('span', { className: 'xsmall muted', text: 'La etiqueta de esta placa es ilegible: solo se evalúa su posición.' })));
      } else if (gi >= 0) {
        const exp = normPlate(gts[gi].text);
        const ok = exp === normPlate(p.text);
        cmp.append(h('div', { className: 'gt-compare__row' },
          h('span', { className: 'gt-compare__label', text: 'Valor esperado' }),
          ok ? h('span', { className: 'badge badge--ok' }, icon('check'), 'Coincide') : h('span', { className: 'badge badge--err' }, icon('x'), 'No coincide')));
        cmp.append(h('div', { className: 'gt-compare__row' }, h('span', { className: 'gt-compare__label', text: 'Esperado' }), h('span', { className: 'diff' }, [...String(exp)].map((c) => h('span', { className: 'is-same', text: c })))));
        cmp.append(h('div', { className: 'gt-compare__row' }, h('span', { className: 'gt-compare__label', text: 'Detectado' }), diffEl(normPlate(p.text), exp, 'Detectado')));
      } else {
        cmp.append(h('div', { className: 'gt-compare__row' },
          h('span', { className: 'gt-compare__label', text: 'Valor esperado' }),
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

  /**
   * Líneas por época con eje secundario opcional.
   * xs: [num]; series: [{label, color, values:[num|null], format, axis?: 'left'|'right', dash?: bool}]
   * yLeft/yRight: {max?, format, title}; marker: {x, label} (línea vertical, p. ej. mejor época).
   * Accesible: el SVG es enfocable; ← → Inicio Fin recorren las épocas y una región viva anuncia los valores.
   */
  function lineChart({ xs, series, yLeft = {}, yRight = null, height = 260, ariaLabel, xLabel = 'Época', xFormat = (v) => fmt.int(v), marker = null }) {
    const n = xs.length;
    return mountChart((W, tip) => {
      const hasRight = !!yRight && series.some((se) => se.axis === 'right');
      const m = { t: 24, r: hasRight ? 54 : 16, b: 40, l: 50 };
      const iw = Math.max(20, W - m.l - m.r), ih = height - m.t - m.b;
      const valsOf = (right) => series.filter((se) => (se.axis === 'right') === right).flatMap((se) => se.values).filter(isNum);
      const lsc = yLeft.max ? { max: yLeft.max, step: yLeft.max / 4, ticks: 4 } : niceScale(Math.max(0, ...valsOf(false)) * 1.05 || 1);
      const rsc = hasRight ? niceScale(Math.max(0, ...valsOf(true)) * 1.05 || 1) : null;
      const x0 = num(xs[0]), x1 = num(xs[n - 1]);
      const span = (x1 - x0) || 1;
      const px = (i) => (n <= 1 ? m.l + iw / 2 : m.l + ((num(xs[i]) - x0) / span) * iw);
      const pyL = (v) => m.t + ih - (clamp(v, 0, lsc.max) / lsc.max) * ih;
      const pyR = (v) => m.t + ih - (clamp(v, 0, rsc.max) / rsc.max) * ih;
      const py = (se, v) => (se.axis === 'right' && rsc ? pyR(v) : pyL(v));
      const lf = yLeft.format || fmt.dec;
      const rf = (yRight && yRight.format) || fmt.dec;

      const svg = s('svg', {
        class: 'chart chart--line', width: W, height, viewBox: `0 0 ${W} ${height}`, role: 'img', tabindex: 0,
        'aria-label': `${ariaLabel || 'Gráfico de líneas'}. Enfoca el gráfico y usa las flechas izquierda y derecha para recorrer las épocas.`,
      });
      for (let k = 0; k <= lsc.ticks; k++) {
        const v = lsc.step * k, y = pyL(v);
        svg.append(s('line', { class: k === 0 ? 'axis-line' : 'grid-line', x1: m.l, x2: m.l + iw, y1: y, y2: y }));
        svg.append(s('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end', text: lf(v) }));
      }
      if (rsc) {
        for (let k = 0; k <= rsc.ticks; k++) {
          const v = rsc.step * k;
          svg.append(s('text', { x: m.l + iw + 8, y: pyR(v) + 4, 'text-anchor': 'start', text: rf(v) }));
        }
        svg.append(s('line', { class: 'axis-line', x1: m.l + iw, x2: m.l + iw, y1: m.t, y2: m.t + ih }));
      }
      svg.append(s('line', { class: 'axis-line', x1: m.l, x2: m.l, y1: m.t, y2: m.t + ih }));
      if (yLeft.title) svg.append(s('text', { class: 'axis-title', x: 4, y: 12, 'text-anchor': 'start', text: yLeft.title }));
      if (rsc && yRight.title) svg.append(s('text', { class: 'axis-title', x: W - 4, y: 12, 'text-anchor': 'end', text: yRight.title }));
      svg.append(s('text', { class: 'axis-title', x: m.l + iw / 2, y: height - 4, 'text-anchor': 'middle', text: xLabel }));

      // Marcas del eje X sin solaparse.
      const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 46))));
      let lastTick = -Infinity;
      for (let i = 0; i < n; i++) {
        const isLast = i === n - 1;
        if (i % every !== 0 && !(isLast && i - lastTick >= every / 2)) continue;
        lastTick = i;
        const x = px(i);
        svg.append(s('line', { class: 'axis-line', x1: x, x2: x, y1: m.t + ih, y2: m.t + ih + 4 }));
        svg.append(s('text', { x, y: m.t + ih + 17, 'text-anchor': 'middle', text: xFormat(xs[i]) }));
      }

      if (marker && isNum(marker.x)) {
        const mi = xs.findIndex((v) => num(v) === marker.x);
        if (mi >= 0) {
          const x = px(mi);
          svg.append(s('line', { class: 'marker-line', x1: x, x2: x, y1: m.t, y2: m.t + ih }));
          svg.append(s('text', { class: 'marker-label', x: x > m.l + iw - 90 ? x - 4 : x + 4, y: m.t + 11, 'text-anchor': x > m.l + iw - 90 ? 'end' : 'start', text: marker.label }));
        }
      }

      series.forEach((se) => {
        let d = '', pen = false;
        se.values.forEach((v, i) => {
          if (!isNum(v)) { pen = false; return; }
          d += `${pen ? 'L' : 'M'}${px(i).toFixed(1)},${py(se, v).toFixed(1)}`;
          pen = true;
        });
        if (d) svg.append(s('path', { class: 'line', d, style: { stroke: se.color }, 'stroke-dasharray': se.dash ? '5 4' : null }));
        if (n <= 40) se.values.forEach((v, i) => { if (isNum(v)) svg.append(s('circle', { class: 'line-dot', cx: px(i), cy: py(se, v), r: 2.4, style: { fill: se.color } })); });
      });

      const cursor = s('g', { class: 'cursor', style: { display: 'none' } });
      const cLine = s('line', { class: 'cursor-line', x1: 0, x2: 0, y1: m.t, y2: m.t + ih });
      const cDots = series.map((se) => s('circle', { class: 'cursor-dot', r: 4.5, style: { fill: se.color } }));
      cursor.append(cLine, ...cDots);
      svg.append(cursor);
      const hit = s('rect', { class: 'hit', x: m.l, y: m.t, width: iw, height: ih });
      svg.append(hit);
      const live = h('div', { className: 'sr-only', attrs: { 'aria-live': 'polite' } });

      let cur = -1;
      const show = (i) => {
        if (i < 0 || i >= n) return;
        cur = i;
        const x = px(i);
        cursor.style.display = '';
        cLine.setAttribute('x1', x); cLine.setAttribute('x2', x);
        series.forEach((se, k) => {
          const v = se.values[i];
          if (isNum(v)) { cDots[k].setAttribute('cx', x); cDots[k].setAttribute('cy', py(se, v)); cDots[k].style.display = ''; }
          else cDots[k].style.display = 'none';
        });
        const lines = [`${xLabel} ${xFormat(xs[i])}`, ...series.map((se) => `${se.label}: ${isNum(se.values[i]) ? se.format(se.values[i]) : 'sin datos'}`)];
        tip.show(lines, clamp(x, 100, W - 100), m.t + 6);
        live.textContent = lines.join('. ');
      };
      const hide = () => { cursor.style.display = 'none'; tip.hide(); };
      const nearest = (xx) => {
        if (n <= 1) return 0;
        const t = x0 + ((xx - m.l) / iw) * span;
        let best = 0;
        for (let i = 1; i < n; i++) if (Math.abs(num(xs[i]) - t) < Math.abs(num(xs[best]) - t)) best = i;
        return best;
      };
      hit.addEventListener('mousemove', (e) => {
        const r = svg.getBoundingClientRect();
        show(nearest((e.clientX - r.left) * (W / (r.width || W))));
      });
      hit.addEventListener('mouseleave', () => { if (document.activeElement !== svg) hide(); });
      svg.addEventListener('focus', () => show(cur >= 0 ? cur : n - 1));
      svg.addEventListener('blur', hide);
      svg.addEventListener('keydown', (e) => {
        let j = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') j = Math.min(n - 1, cur + 1);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') j = Math.max(0, cur - 1);
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = n - 1;
        if (j === null) return;
        e.preventDefault(); e.stopPropagation();
        show(j);
      });

      const frag = document.createDocumentFragment();
      frag.append(svg, live);
      return frag;
    });
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
    if (!state.photos.length && !state.galleryLoading) loadGallery();
    if (state.view === 'history') loadHistory();
    if (state.view === 'stats') loadStats();
    // Ficha del modelo (también indica si los pesos están en el servidor).
    loadModel({ quiet: state.view !== 'model' });
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
  const VIEWS = ['inicio', 'detector', 'upload', 'batch', 'history', 'stats', 'model', 'tests'];
  function switchView(name, { focus = false } = {}) {
    if (!VIEWS.includes(name)) name = 'inicio';
    if (state.view === 'upload' && name !== 'upload') {
      stopCamera();
      const r = $('#mode-src-file'); if (r) r.checked = true;
      const cc = $('#camera-card'); if (cc) cc.hidden = true;
      const dz = $('#dropzone'); if (dz) dz.hidden = false;
      const fa = $('#file-upload-actions'); if (fa) fa.hidden = false;
    }
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
    if (name === 'model') loadModel();
    if (name === 'inicio') { loadReport(); loadModel({ quiet: true }); renderInicio(); }
    if (name === 'tests') loadReport();
    if (name === 'upload') {
      if (!state.model.data && !state.model.loading) loadModel({ quiet: true });
      if (!state.upload.det && !state.upload.busy) renderUploadViewer();
    }
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
    const setEl = form.querySelector('input[name="set"]:checked');
    const set = setEl ? setEl.value : 'all';
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
    return { count, seed, set };
  }

  /* ------------------------------------------------------------------ */
  /* Vista 1: Detector                                                    */
  /* ------------------------------------------------------------------ */
  const visiblePhotos = () => state.photos.filter((p) => state.setFilter === 'all' || p.set === state.setFilter);
  const selectedIndex = () => visiblePhotos().findIndex((p) => p.id === state.selectedId);
  const expectedTexts = (ph) => (ph.ground_truth || []).map((g) => g.text || '¿?');

  function photoStatus(ph) {
    if (state.inflight.has(ph.id)) return 'busy';
    if (state.errors.has(ph.id)) return 'error';
    const d = state.dets.get(ph.id);
    if (!d) return 'pending';
    if (d.evaluation) return d.evaluation.correct ? 'ok' : 'bad';
    return 'done';
  }

  function thumbBadge(ph) {
    const st = photoStatus(ph);
    const d = state.dets.get(ph.id);
    const score = (ev) => (ev.readable ? `${ev.exact_matches}/${ev.readable}` : `${ev.matched}/${ev.expected}`);
    switch (st) {
      case 'busy': return h('span', { className: 'badge badge--solid' }, h('span', { className: 'spinner', style: 'width:11px;height:11px;border-width:2px', attrs: { 'aria-hidden': 'true' } }), 'Procesando');
      case 'error': return h('span', { className: 'badge badge--solid badge--err' }, icon('alert'), 'Error');
      case 'ok': return h('span', { className: 'badge badge--solid badge--ok' }, icon('check'), score(d.evaluation));
      case 'bad': return h('span', { className: 'badge badge--solid badge--err' }, icon('x'), score(d.evaluation));
      case 'done': return h('span', { className: 'badge badge--solid' }, icon('check'), String(d.plates.length));
      default: return null;
    }
  }

  const STATUS_TEXT = { busy: 'procesando', error: 'error', ok: 'correcta', bad: 'con errores', done: 'detectada', pending: 'sin analizar' };

  function renderSetInfo() {
    const el = $('#gallery-set-info');
    const sets = state.sets;
    if (!sets) { el.textContent = ''; return; }
    if (state.setFilter === 'all') {
      const co = sets.colombia || {}, ds = sets.dataset || {};
      el.textContent = `${fmt.int(co.photos)} fotos de carros colombianos (placa anotada a mano) y ${fmt.int(ds.photos)} fotos del dataset público ${ds.nombre || ''} (${ds.licencia || 'licencia desconocida'}), que el modelo nunca vio al entrenar.`;
      return;
    }
    const info = sets[state.setFilter] || {};
    el.textContent = [info.descripcion, info.licencia ? `Licencia: ${info.licencia}.` : '', info.nota].filter(Boolean).join(' ');
  }

  function renderGallery() {
    const g = $('#gallery');
    const list = visiblePhotos();
    $('#photo-count').textContent = String(list.length);
    if (state.galleryLoading && !state.photos.length) {
      g.hidden = false;
      g.replaceChildren(...Array.from({ length: 8 }, () => skel('skel-thumb')));
      g.setAttribute('aria-busy', 'true');
      return;
    }
    g.removeAttribute('aria-busy');
    if (!list.length) {
      g.replaceChildren();
      g.hidden = true;
      $('#btn-prev-photo').disabled = true;
      $('#btn-next-photo').disabled = true;
      return;
    }
    g.hidden = false;
    const sel = selectedIndex();
    const nodes = list.map((ph, i) => {
      const isSel = i === sel;
      const gtN = (ph.ground_truth || []).length;
      const st = photoStatus(ph);
      return h('button', {
        className: 'thumb', type: 'button', tabIndex: isSel || (sel < 0 && i === 0) ? 0 : -1,
        attrs: { role: 'option', 'aria-selected': isSel ? 'true' : 'false', 'aria-label': `Foto ${i + 1}: ${SET_SINGULAR[ph.set] || ph.set}, ${gtN} placa${gtN === 1 ? '' : 's'} esperada${gtN === 1 ? '' : 's'}, ${STATUS_TEXT[st]}` },
        dataset: { idx: i },
        on: {
          click: () => selectPhoto(ph.id),
          keydown: (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault(); e.stopPropagation();
              movePhoto(e.key === 'ArrowRight' ? 1 : -1, { focusThumb: true });
            }
          },
        },
      },
      h('img', { className: 'thumb__img', src: ph.image_url, alt: '', loading: 'lazy', decoding: 'async' }),
      h('span', { className: 'thumb__index', text: `#${i + 1}` }),
      h('span', { className: 'thumb__status' }, thumbBadge(ph)),
      h('span', { className: 'thumb__meta' },
        h('span', { className: `set-dot set-dot--${ph.set}`, text: `● ${ph.set === 'colombia' ? 'Colombia' : 'Dataset'}` }),
        h('span', { text: `${gtN} placa${gtN === 1 ? '' : 's'}` })));
    });
    g.replaceChildren(...nodes);
    $('#btn-prev-photo').disabled = sel <= 0;
    $('#btn-next-photo').disabled = sel < 0 || sel >= list.length - 1;
  }

  function renderDetectorViewer() {
    const host = $('#detector-viewer');
    const list = visiblePhotos();
    if (!state.photos.length) {
      if (state.galleryLoading) { host.replaceChildren(); return; }
      host.replaceChildren(emptyState({
        art: 'image',
        title: state.galleryError ? 'No se pudo cargar la galería' : 'La galería de fotos está vacía',
        text: state.galleryError || 'Arma la galería de fotos reales desde la raíz del proyecto con «python ml/build_gallery.py» y recarga la página.',
        action: h('button', { className: 'btn btn--ghost', type: 'button', on: { click: () => loadGallery({ force: true }) } }, icon('refresh'), h('span', { text: 'Reintentar' })),
      }));
      return;
    }
    const i = selectedIndex();
    if (i < 0) {
      host.replaceChildren(emptyState({
        art: 'plate', compact: true, title: 'Elige una foto',
        text: 'Haz clic en una miniatura (o usa las flechas ← →) para que el modelo detecte y lea sus placas.',
        action: h('button', { className: 'btn btn--primary', type: 'button', on: { click: randomPhoto } }, icon('sparkles'), h('span', { text: 'Foto al azar' }), h('kbd', { text: 'G' })),
      }));
      return;
    }
    const ph = list[i];
    const det = state.dets.get(ph.id);
    const title = `Foto ${i + 1} de ${list.length}`;
    const subtitle = `${SET_SINGULAR[ph.set] || ph.set} · ${ph.id} · ${ph.width}×${ph.height} px · esperado: ${expectedTexts(ph).join(', ')}`;
    const base = { title, subtitle, imageUrl: ph.image_url, width: ph.width, height: ph.height, set: ph.set, groundTruth: ph.ground_truth };
    if (det) {
      renderViewer(host, { det, title, subtitle, onRedetect: () => detectPhoto(ph.id, { force: true }) });
    } else if (state.errors.has(ph.id) && !state.inflight.has(ph.id)) {
      renderViewer(host, { ...base, error: state.errors.get(ph.id), onRetry: () => detectPhoto(ph.id, { force: true }) });
    } else {
      renderViewer(host, { ...base, loading: true });
    }
  }

  function selectPhoto(id, { focusThumb = false, detect = true } = {}) {
    const ph = state.photos.find((p) => p.id === id);
    if (!ph) return;
    state.selectedId = id;
    renderGallery();
    const thumb = $(`#gallery .thumb[data-idx="${selectedIndex()}"]`);
    if (thumb) {
      thumb.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
      if (focusThumb) thumb.focus({ preventScroll: true });
    }
    if (detect && !state.dets.has(id) && !state.inflight.has(id) && !state.errors.has(id)) detectPhoto(id);
    else renderDetectorViewer();
  }

  async function detectPhoto(id, { force = false, quiet = false } = {}) {
    if (state.inflight.has(id)) return state.inflight.get(id);
    if (!force && state.dets.has(id)) return state.dets.get(id);
    state.errors.delete(id);
    if (force) state.dets.delete(id);
    const p = (async () => {
      const started = performance.now();
      try {
        const det = await api.detect(id);
        // Duración mínima para que la animación de escaneo sea perceptible.
        const minMs = prefersReducedMotion() ? 0 : 450;
        const el = performance.now() - started;
        if (el < minMs) await sleep(minMs - el);
        state.dets.set(id, det);
        state.history.loaded = false; state.stats.data = null;
        return det;
      } catch (e) {
        state.errors.set(id, e.message);
        if (!quiet) toastError(`Error al detectar la foto ${id}`, e);
        throw e;
      } finally {
        state.inflight.delete(id);
        renderGallery();
        if (state.selectedId === id) renderDetectorViewer();
      }
    })();
    state.inflight.set(id, p);
    renderGallery();
    if (state.selectedId === id) renderDetectorViewer();
    try { return await p; } catch (e) { return null; }
  }

  async function loadGallery({ force = false } = {}) {
    if (state.galleryLoading || (state.photos.length && !force)) return;
    state.galleryLoading = true;
    state.galleryError = null;
    renderGallery(); renderDetectorViewer();
    try {
      const r = await api.gallery();
      state.photos = Array.isArray(r && r.photos) ? r.photos : [];
      state.sets = (r && r.sets) || null;
    } catch (e) {
      state.galleryError = e.message;
      toastError('No se pudo cargar la galería de fotos', e);
    } finally {
      state.galleryLoading = false;
      renderSetInfo(); renderGallery(); renderDetectorViewer();
    }
  }

  function randomPhoto() {
    if (state.view !== 'detector') switchView('detector');
    const list = visiblePhotos();
    if (!list.length) return;
    const pending = list.filter((p) => p.id !== state.selectedId && !state.dets.has(p.id));
    const pool = pending.length ? pending : list.filter((p) => p.id !== state.selectedId);
    const ph = (pool.length ? pool : list)[Math.floor(Math.random() * (pool.length || list.length))];
    selectPhoto(ph.id, { focusThumb: false });
  }

  function movePhoto(delta, opts = {}) {
    const list = visiblePhotos();
    if (!list.length) return;
    const cur = selectedIndex();
    const i = cur < 0 ? 0 : clamp(cur + delta, 0, list.length - 1);
    if (i !== cur) selectPhoto(list[i].id, opts);
  }

  function setGalleryFilter(value) {
    state.setFilter = value;
    if (state.selectedId && !visiblePhotos().some((p) => p.id === state.selectedId)) state.selectedId = null;
    renderSetInfo(); renderGallery(); renderDetectorViewer();
  }

  function setupDetector() {
    $$('#gallery-form input[name="set"]').forEach((r) => r.addEventListener('change', () => { if (r.checked) setGalleryFilter(r.value); }));
    $('#gallery-form').addEventListener('submit', (e) => e.preventDefault());
    $('#btn-random').addEventListener('click', randomPhoto);
    $('#btn-prev-photo').addEventListener('click', () => movePhoto(-1));
    $('#btn-next-photo').addEventListener('click', () => movePhoto(1));
    renderGallery();
    renderDetectorViewer();
  }

  /* ------------------------------------------------------------------ */
  /* Vista 2: Subir imagen                                                */
  /* ------------------------------------------------------------------ */
  const MAX_UPLOAD = 15 * 1024 * 1024;
  function isAcceptedFile(f) {
    const okType = ['image/png', 'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/webp'].includes(f.type);
    const okExt = /\.(png|jpe?g|webp)$/i.test(f.name || '');
    return okType || (!f.type && okExt);
  }

  /* Cámara en vivo --------------------------------------------------- */
  const cameraState = {
    stream: null,
    active: false,
    facingMode: 'environment',
  };

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('warn', 'Cámara no soportada', 'Tu navegador no permite captura de video en vivo.');
      return false;
    }
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: cameraState.facingMode, width: { ideal: 1280 } },
        audio: false,
      });
      cameraState.stream = stream;
      cameraState.active = true;
      const video = $('#camera-stream');
      video.srcObject = stream;
      $('#camera-card').hidden = false;
      $('#dropzone').hidden = true;
      $('#file-upload-actions').hidden = true;
      video.play().catch(() => {});
      return true;
    } catch (e) {
      toastError('No se pudo acceder a la cámara', e);
      stopCamera();
      const mf = $('#mode-src-file'); if (mf) mf.checked = true;
      $('#camera-card').hidden = true;
      $('#dropzone').hidden = false;
      $('#file-upload-actions').hidden = false;
      return false;
    }
  }

  function stopCamera() {
    if (cameraState.stream) {
      cameraState.stream.getTracks().forEach((t) => t.stop());
      cameraState.stream = null;
    }
    cameraState.active = false;
    const video = $('#camera-stream');
    if (video) video.srcObject = null;
  }

  function switchCamera() {
    cameraState.facingMode = cameraState.facingMode === 'environment' ? 'user' : 'environment';
    startCamera();
  }

  function captureCamera() {
    const video = $('#camera-stream');
    if (!cameraState.active || !video || !video.videoWidth) {
      toast('warn', 'Cámara no lista', 'Asegúrate de que la cámara esté encendida.');
      return;
    }
    const canvas = $('#camera-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) { toast('error', 'Error al capturar', 'No se pudo crear la imagen.'); return; }
      const file = new File([blob], `captura_camara_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setUploadFile(file);
      uploadDetect();
    }, 'image/jpeg', 0.95);
  }

  function setUploadFile(file) {
    if (!file) return;
    if (!isAcceptedFile(file)) { toast('warn', 'Formato no admitido', 'Selecciona una imagen PNG, JPG o WebP.'); return; }
    if (file.size > MAX_UPLOAD) { toast('warn', 'Archivo demasiado grande', `El máximo es 15 MB (el archivo pesa ${fmt.bytes(file.size)}).`); return; }
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
      renderViewer(host, { det: u.det, title: 'Imagen subida', subtitle: `${u.file ? u.file.name + ' · ' : ''}${u.det.width}×${u.det.height} px · sin valor esperado (no se evalúa)` });
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
      else toast('warn', 'No se detectaron placas', 'Prueba con una foto donde la placa se vea completa y nítida.');
      u.busy = false;
      renderUploadViewer();
    } catch (e) {
      u.busy = false;
      toastError(e.status === 503 ? 'Modelo entrenado no disponible' : 'Error al analizar la imagen', e);
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

    /* Cámara en vivo */
    const modeFile = $('#mode-src-file');
    const modeCamera = $('#mode-src-camera');
    if (modeFile && modeCamera) {
      modeFile.addEventListener('change', (e) => {
        if (e.target.checked) {
          stopCamera();
          $('#camera-card').hidden = true;
          $('#dropzone').hidden = false;
          $('#file-upload-actions').hidden = false;
        }
      });
      modeCamera.addEventListener('change', (e) => {
        if (e.target.checked) startCamera();
      });
    }
    const btnCamCapture = $('#btn-camera-capture');
    if (btnCamCapture) btnCamCapture.addEventListener('click', captureCamera);
    const btnCamSwitch = $('#btn-camera-switch');
    if (btnCamSwitch) btnCamSwitch.addEventListener('click', switchCamera);
    const btnCamStop = $('#btn-camera-stop');
    if (btnCamStop) btnCamStop.addEventListener('click', () => {
      stopCamera();
      if (modeFile) modeFile.checked = true;
      $('#camera-card').hidden = true;
      $('#dropzone').hidden = false;
      $('#file-upload-actions').hidden = false;
    });
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
    const tick = () => { lbl.textContent = `Analizando ${params.count} foto${params.count === 1 ? '' : 's'} real${params.count === 1 ? '' : 'es'} (${params.set === 'all' ? 'todos los conjuntos' : setLabel(params.set).toLowerCase()})… ${fmt.sec((performance.now() - t0) / 1000)}`; };
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
      toast('success', 'Evaluación completada', `${b.data.results.length} fotos en ${fmt.sec(wall)} · lecturas exactas ${b.data.metrics ? fmt.pct(b.data.metrics.plate_accuracy) : '—'}`);
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

  /* Exportaciones CSV / JSON ----------------------------------------- */
  function exportBatchCSV() {
    const b = state.batch;
    if (!b.data || !b.data.results || !b.data.results.length) {
      toast('warn', 'Sin datos', 'No hay resultados del lote para exportar.');
      return;
    }
    const headers = ['ID', 'Foto', 'Valor esperado', 'Placas Detectadas', 'Resultado', 'Confianza Media', 'Tiempo (ms)', 'Conjunto'];
    const rows = b.data.results.map((d, i) => {
      const gts = (d.ground_truth || []).map((g) => g.text || '?').join('; ');
      const preds = (d.plates || []).map((p) => p.text).join('; ');
      const res = d.evaluation ? (d.evaluation.correct ? 'Correcta' : 'Error') : 'Sin evaluación';
      const avgC = avgConfidence(d.plates);
      const confStr = avgC !== null ? (avgC * 100).toFixed(1) + '%' : '';
      return [
        `"${d.id}"`,
        `"${d.photo_id || i + 1}"`,
        `"${gts}"`,
        `"${preds}"`,
        `"${res}"`,
        `"${confStr}"`,
        d.processing_ms.toFixed(1),
        `"${setLabel(d.photo_set)}"`,
      ].join(',');
    });
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadBlob(csv, `evaluacion_lote_${(b.params && b.params.set) || 'fotos'}_${dateStr}.csv`);
  }

  function exportBatchJSON() {
    const b = state.batch;
    if (!b.data) return;
    const jsonStr = JSON.stringify(b.data, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadBlob(jsonStr, `evaluacion_lote_${dateStr}.json`, 'application/json');
  }

  function exportHistoryCSV() {
    const hs = state.history;
    if (!hs.items || !hs.items.length) {
      toast('warn', 'Sin historial', 'No hay registros en el historial para exportar.');
      return;
    }
    const filtered = filterHistory();
    const headers = ['ID', 'Fecha', 'Origen', 'Foto', 'Valor esperado', 'Placas Detectadas', 'Resultado', 'Confianza Media', 'Tiempo (ms)', 'Conjunto'];
    const rows = filtered.map((d) => {
      const gts = (d.ground_truth || []).map((g) => g.text || '?').join('; ');
      const preds = (d.plates || []).map((p) => p.text).join('; ');
      const res = d.evaluation ? (d.evaluation.correct ? 'Correcta' : 'Error') : (preds ? 'Detectada' : 'Sin placas');
      const avgC = avgConfidence(d.plates);
      const confStr = avgC !== null ? (avgC * 100).toFixed(1) + '%' : '';
      return [
        `"${d.id}"`,
        `"${d.created_at || ''}"`,
        `"${SOURCE_LABEL[d.source] || d.source}"`,
        `"${d.photo_id || ''}"`,
        `"${gts}"`,
        `"${preds}"`,
        `"${res}"`,
        `"${confStr}"`,
        d.processing_ms.toFixed(1),
        `"${d.photo_set ? setLabel(d.photo_set) : ''}"`,
      ].join(',');
    });
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadBlob(csv, `historial_placas_${dateStr}.csv`);
  }

  function renderBatch() {
    const host = $('#batch-results');
    const b = state.batch;
    if (!b.data) {
      host.replaceChildren(emptyState({
        art: 'chart', title: 'Sin evaluación todavía',
        text: 'Elige cuántas fotos reales tomar de la galería y de qué conjunto, y ejecuta la evaluación para medir cuántas placas localiza y lee bien el modelo.',
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
      values: latencies, bins: 10, domain: [0, niceMax(latMax)], xFormat: (v) => fmt.ms0(v), color: 'var(--det)', unitLabel: 'foto(s)',
      ariaLabel: `Histograma de latencia de ${results.length} fotos, media ${fmt.ms(mt.avg_processing_ms)}`,
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
          emptyState({ art: 'plate', compact: true, title: b.onlyErrors ? 'Sin errores en este lote' : 'Sin resultados', text: b.onlyErrors ? 'Todas las fotos se leyeron correctamente. 🎯' : '' }))));
      } else {
        tableBody.replaceChildren(...rows.map((d) => {
          const idx = results.indexOf(d);
          return detectionRow(d, {
            index: idx + 1,
            onOpen: () => openDetail({ det: d, title: `Foto ${idx + 1} del lote`, subtitle: `${SET_SINGULAR[d.photo_set] || ''} · ${d.photo_id || d.id}`, dialogTitle: 'Detalle · evaluación por lotes' }),
            showDate: false,
          });
        }));
      }
      foot.textContent = `Mostrando ${rows.length} de ${results.length} fotos · ${errCount} con errores`;
    }
    fillTable();

    host.replaceChildren(h('div', { className: 'stats-grid' },
      h('div', { className: 'gallery-head' },
        h('h2', { className: 'section-title' }, 'Resultados del lote', h('span', { className: 'count-pill', text: String(results.length) })),
        p ? h('span', { className: 'small muted', text: `${p.set === 'all' ? 'Todos los conjuntos' : setLabel(p.set)}${p.seed !== null ? ` · semilla ${p.seed}` : ' · semilla aleatoria'}` }) : null),
      metricsKpis(mt),
      h('div', { className: 'charts' },
        chartCard('Distribución de latencia', 'clock',
          h('p', { className: 'small muted', style: 'margin-bottom:8px', text: `Tiempo de procesamiento por foto · media ${fmt.ms(mt.avg_processing_ms)}` }),
          latHist,
          dataTableDetails('Distribución de latencia', ['Rango', 'Fotos'], latHist._bins.map((bn) => [`${fmt.ms0(bn.from)} – ${fmt.ms0(bn.to)}`, fmt.int(bn.count)]))),
        chartCard('Distribución de confianza', 'gauge',
          h('p', { className: 'small muted', style: 'margin-bottom:8px', text: `Confianza global de ${fmt.int(confs.length)} placas detectadas` }),
          confs.length ? confHist : emptyState({ art: 'chart', compact: true, title: 'No hay placas detectadas' }),
          confs.length ? dataTableDetails('Distribución de confianza', ['Rango', 'Placas'], confHist._bins.map((bn) => [`${fmt.pct0(bn.from)} – ${fmt.pct0(bn.to)}`, fmt.int(bn.count)])) : null)),
      h('section', { className: 'card table-card', attrs: { 'aria-label': 'Tabla de resultados del lote' } },
        h('div', { className: 'table-toolbar' },
          h('h3', { className: 'card__title' }, icon('batch'), 'Detalle por foto'),
          h('div', { className: 'table-actions' },
            h('label', { className: 'toggle' }, onlyErr, `Solo errores (${errCount})`),
            h('button', { className: 'btn btn--ghost btn--sm btn-export', type: 'button', on: { click: exportBatchCSV } }, icon('download'), h('span', { text: 'Exportar CSV' })),
            h('button', { className: 'btn btn--ghost btn--sm btn-export', type: 'button', on: { click: exportBatchJSON } }, icon('download'), h('span', { text: 'JSON' })))),
        h('div', { className: 'table-scroll' },
          h('table', { className: 'data-table' },
            h('caption', { className: 'sr-only', text: 'Resultados por foto. Pulsa Enter sobre una fila para ver el detalle.' }),
            h('thead', null, h('tr', null,
              h('th', { attrs: { scope: 'col' }, text: 'Foto' }),
              h('th', { attrs: { scope: 'col' }, text: 'Esperado' }),
              h('th', { attrs: { scope: 'col' }, text: 'Detectado' }),
              h('th', { attrs: { scope: 'col' }, text: 'Resultado' }),
              h('th', { className: 'num', attrs: { scope: 'col' }, text: 'Confianza' }),
              h('th', { className: 'num', attrs: { scope: 'col' }, text: 'Tiempo' }),
              h('th', { className: 'hide-sm', attrs: { scope: 'col' }, text: 'Conjunto' }))),
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
      attrs: { 'aria-label': `${showDate ? fmt.date(d.created_at) : 'Foto ' + index}${d.photo_set ? `, ${SET_SINGULAR[d.photo_set].toLowerCase()}` : ''}: detectado ${plates.map((p) => p.text).join(', ') || 'nada'}. Abrir detalle.` },
      on: { click: onOpen, keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } },
    },
    h('td', null, h('div', { style: 'display:flex;align-items:center;gap:10px' },
      h('img', {
        className: 'mini btn-inspect',
        src: d.image_url,
        alt: '',
        title: 'Clic para ampliar imagen',
        loading: 'lazy',
        decoding: 'async',
        on: { click: (e) => { e.stopPropagation(); openZoomImage(d.annotated_url || d.image_url, `Detección ${d.id}`); } }
      }),
      h('div', null,
        h('div', { className: 'small', style: 'font-weight:600', text: showDate ? fmt.date(d.created_at) : `#${index}` }),
        h('div', { className: 'xsmall muted', text: showDate ? `${SOURCE_LABEL[d.source] || d.source}${d.photo_id ? ' · ' + d.photo_id : ''}` : (d.photo_id || `ID ${d.id}`) })))),
    h('td', null, gt.length ? h('div', { className: 'plate-list' }, gt.map((t) => h('span', { className: 'plate-text', text: t }))) : h('span', { className: 'muted', text: '—' })),
    h('td', null, plates.length ? h('div', { className: 'plate-list' }, plates.map((p) => {
      const isErr = d.ground_truth && !gtSet.has(normPlate(p.text));
      return h('span', { className: 'plate-wrap' },
        h('span', { className: 'plate-text' + (isErr ? ' is-err' : ''), text: p.text || '?' }),
        p.text ? h('button', {
          className: 'btn-copy-sm',
          type: 'button',
          attrs: { title: `Copiar placa ${p.text}`, 'aria-label': `Copiar placa ${p.text}` },
          on: { click: (e) => { e.stopPropagation(); copyToClipboard(p.text, e.currentTarget); } }
        }, icon('copy')) : null);
    })) : h('span', { className: 'muted', text: 'Ninguna' })),
    h('td', null, result),
    h('td', { className: 'num', text: avgC === null ? '—' : fmt.pct(avgC) }),
    h('td', { className: 'num', text: fmt.ms(d.processing_ms) }),
    h('td', { className: 'hide-sm' }, d.photo_set ? setBadge(d.photo_set, { xs: true }) : h('span', { className: 'muted', text: '—' })));
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
      if (hs.set === 'none' ? !!d.photo_set : (hs.set !== 'all' && d.photo_set !== hs.set)) return false;
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
        text: 'Cada detección que ejecutes (desde la galería, una imagen subida o un lote) aparecerá aquí.',
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
            h('th', { attrs: { scope: 'col' }, text: 'Fecha / origen / motor' }),
            h('th', { attrs: { scope: 'col' }, text: 'Esperado' }),
            h('th', { attrs: { scope: 'col' }, text: 'Detectado' }),
            h('th', { attrs: { scope: 'col' }, text: 'Resultado' }),
            h('th', { className: 'num', attrs: { scope: 'col' }, text: 'Confianza' }),
            h('th', { className: 'num', attrs: { scope: 'col' }, text: 'Tiempo' }),
            h('th', { className: 'hide-sm', attrs: { scope: 'col' }, text: 'Conjunto' }))),
          h('tbody', null, rows.length ? rows.map((d, i) => detectionRow(d, { index: i + 1, showDate: true, onOpen: () => openHistoryItem(d) }))
            : h('tr', null, h('td', { attrs: { colspan: 7 } }, emptyState({ art: 'history', compact: true, title: 'Sin coincidencias', text: 'Ningún registro coincide con los filtros aplicados.',
              action: h('button', { className: 'btn btn--ghost btn--sm', type: 'button', on: { click: resetHistoryFilters } }, h('span', { text: 'Limpiar filtros' })) })))))),
      h('div', { className: 'table-foot', attrs: { role: 'status', 'aria-live': 'polite' }, text: `Mostrando ${rows.length} de ${hs.items.length} registros` }));
    host.replaceChildren(table);
  }

  function resetHistoryFilters() {
    const hs = state.history;
    hs.q = ''; hs.source = 'all'; hs.result = 'all'; hs.set = 'all';
    $('#history-q').value = ''; $('#history-source').value = 'all'; $('#history-result').value = 'all'; $('#history-set').value = 'all';
    renderHistory();
  }

  let historyReq = 0;
  async function openHistoryItem(d) {
    const req = ++historyReq;
    const title = d.source === 'upload' ? 'Imagen subida' : `${SET_SINGULAR[d.photo_set] || 'Foto de la galería'}${d.photo_id ? ' · ' + d.photo_id : ''}`;
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
      message: 'Se eliminarán todas las detecciones guardadas en el servidor (las fotos de la galería no se borran). Esta acción no se puede deshacer.',
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
      // Las detecciones de la galería ya no existen: volver a mostrarla sin analizar.
      state.dets.clear(); state.errors.clear();
      renderGallery(); renderDetectorViewer();
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
    $('#history-set').addEventListener('change', (e) => { state.history.set = e.target.value; renderHistory(); });
    $('#btn-history-refresh').addEventListener('click', () => loadHistory({ force: true }));
    $('#btn-history-clear').addEventListener('click', clearHistory);
    const btnExp = $('#btn-history-export');
    if (btnExp) btnExp.addEventListener('click', exportHistoryCSV);
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
    const keys = SETS;
    const bd = mt.by_set || {};
    const cats = keys.map((k) => SET_LABEL[k]);
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
      ariaLabel: 'Precisión por conjunto de fotos: ' + keys.map((k, i) => `${cats[i]}: placas ${has(k) ? fmt.pct(bd[k].plate_accuracy) : 'sin datos'}`).join('; '),
    });
    const latChart = barChart({
      categories: cats, series: [{ label: 'Latencia media', color: 'var(--det)', values: keys.map((k) => val(k, 'avg_processing_ms')) }],
      yFormat: fmt.ms0, valueFormat: fmt.ms0, height: 270,
      ariaLabel: 'Latencia media por conjunto de fotos: ' + keys.map((k, i) => `${cats[i]}: ${has(k) ? fmt.ms(bd[k].avg_processing_ms) : 'sin datos'}`).join('; '),
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
        chartCard('Precisión por conjunto de fotos', 'stats', legend, accChart,
          dataTableDetails('Métricas por conjunto', ['Conjunto', 'Detecciones', 'Placas', 'Caracteres', 'Detección', 'Latencia'], tableRows)),
        chartCard('Latencia media por conjunto', 'clock',
          h('p', { className: 'small muted', style: 'margin-bottom:8px', text: 'Tiempo medio de procesamiento por imagen' }),
          latChart,
          h('div', { className: 'chart-legend', style: 'margin-top:8px' }, keys.map((k, i) => h('span', null, `${cats[i]}: ${has(k) ? fmt.int(bd[k].detections) : 0} ${has(k) && bd[k].detections === 1 ? 'detección' : 'detecciones'}`))))),
      h('p', { className: 'xsmall muted' }, 'Todas las detecciones son sobre fotos reales. Las lecturas exactas solo cuentan placas con texto esperado conocido; en el dataset público ese texto lo generó otro modelo y puede tener errores, así que su precisión real es algo mayor.')));
  }

  function setupStats() {
    $('#btn-stats-refresh').addEventListener('click', () => loadStats({ force: true }));
  }

  /* ------------------------------------------------------------------ */
  /* Vista 6: Modelo entrenado                                            */
  /* ------------------------------------------------------------------ */
  const TRAIN_CMDS = ['python ml/train_detector.py', 'python ml/train_ocr.py', 'python ml/evaluate_and_export.py'];
  const SPLIT_LABEL = { train: 'Entrenamiento', val: 'Validación', test: 'Prueba' };
  const OCR_SPLITS = [
    { key: 'real_test', title: 'Fotos reales (varios países)', sub: 'Recortes de fotos reales del dataset público (placas de distintos países, etiquetas automáticas).' },
    { key: 'synth_test', title: 'Sintéticas colombianas', sub: 'Placas colombianas generadas por ordenador (formato ABC123, etiquetas exactas).' },
  ];

  function loadModel({ force = false, quiet = false } = {}) {
    const md = state.model;
    if (md.loading) return md.promise;
    if (md.data && !force) { if (state.view === 'model') renderModel(); return Promise.resolve(md.data); }
    md.loading = true;
    const btn = $('#btn-model-refresh');
    setBusy(btn, true);
    if (state.view === 'model' && !md.data) renderModel();
    md.promise = (async () => {
      try {
        const r = await api.model();
        md.data = { available: !!(r && r.available), card: (r && r.card && typeof r.card === 'object') ? r.card : null };
        md.error = null;
      } catch (e) {
        md.error = e.message;
        if (!quiet) toastError('No se pudo cargar la ficha del modelo', e);
      } finally {
        md.loading = false;
        setBusy(btn, false);
        if (state.view === 'model') renderModel();
      }
      return md.data;
    })();
    return md.promise;
  }

  function renderModel() {
    const host = $('#model-content');
    const md = state.model;
    if (md.loading && !md.data) {
      host.replaceChildren(h('div', { className: 'skel-stack', attrs: { 'aria-label': 'Cargando ficha del modelo' } },
        skel('skel-card', { height: '150px' }),
        h('div', { className: 'kpis' }, [0, 1, 2, 3, 4].map(() => skel('skel-card', { height: '120px' }))),
        h('div', { className: 'charts' }, skel('skel-card', { height: '300px' }), skel('skel-card', { height: '300px' }))));
      return;
    }
    if (!md.data) {
      host.replaceChildren(emptyState({ art: 'chart', title: 'Ficha del modelo no disponible', text: md.error || 'Comprueba la conexión con el backend.',
        action: h('button', { className: 'btn btn--ghost', type: 'button', on: { click: () => loadModel({ force: true }) } }, icon('refresh'), h('span', { text: 'Reintentar' })) }));
      return;
    }
    const { available, card } = md.data;
    if (!available || !card) { host.replaceChildren(modelEmptyEl(available, !!card)); return; }
    const det = card.detector || {};
    const ocr = card.ocr || {};
    host.replaceChildren(h('div', { className: 'stats-grid model-grid' },
      modelPipelineEl(card),
      walkthroughEl(),
      card.colombia_real ? colombiaSectionEl(card.colombia_real) : null,
      datasetCardEl(card.dataset || {}),
      detectorSectionEl(det),
      ocrSectionEl(ocr),
      modelSection('Curvas de entrenamiento', 'stats', 'Evolución por época sobre los datos de validación.',
        h('div', { className: 'charts' }, detectorCurveCard(det), ocrCurveCard(ocr))),
      ocrErrorsEl(ocr)));
  }

  function modelEmptyEl(available, hasCard) {
    const text = available
      ? 'El servidor tiene los pesos del modelo pero falta su ficha (model_card.json). Genérala con el último comando.'
      : hasCard
        ? 'Hay una ficha guardada, pero faltan los archivos del modelo en el servidor. Vuelve a entrenarlo desde la raíz del proyecto:'
        : 'Todavía no hay un modelo entrenado. Entrénalo y expórtalo desde la raíz del proyecto, en este orden:';
    return emptyState({
      art: 'chart', title: 'Modelo entrenado no disponible', text,
      action: h('div', { className: 'cmd-block' },
        h('ol', { className: 'cmd-list' }, TRAIN_CMDS.map((c) => h('li', null, h('code', { text: c })))),
        h('p', { className: 'xsmall muted', text: 'Mientras tanto no se pueden analizar fotos: la detección necesita el modelo.' }),
        h('button', { className: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => loadModel({ force: true }) } }, icon('refresh'), h('span', { text: 'Comprobar de nuevo' }))),
    });
  }

  /** Sección con título h2 + descripción (sin tarjeta, para no anidar KPIs en tarjetas). */
  function modelSection(title, iconName, meta, ...content) {
    const id = uid('msec');
    return h('section', { className: 'model-section', attrs: { 'aria-labelledby': id } },
      h('div', { className: 'model-section__head' },
        h('h2', { className: 'section-title', id }, icon(iconName), title),
        meta ? h('p', { className: 'small muted', text: meta }) : null),
      content);
  }

  function modelPipelineEl(card) {
    const det = card.detector || {}, ocr = card.ocr || {};
    const steps = [
      { iconName: 'image', title: 'Foto', sub: 'Imagen de entrada (PNG o JPG)' },
      { iconName: 'target', title: 'Detector YOLO', sub: [det.model, isNum(det.imgsz) ? `${fmt.int(det.imgsz)} px` : null].filter(Boolean).join(' · ') || 'Localiza cada placa', tone: 'det' },
      { iconName: 'crop', title: 'Recorte', sub: 'Región de cada placa con margen' },
      { iconName: 'type', title: 'Lector CRNN + CTC', sub: ocr.model ? `${ocr.model} · lee la secuencia` : 'Lee la secuencia de caracteres', tone: 'accent' },
      { iconName: 'check', title: 'Formato colombiano', sub: 'ABC123 · corrige letras y dígitos', tone: 'ok' },
    ];
    const flow = h('ol', { className: 'flow', attrs: { 'aria-label': 'Pasos del modelo entrenado' } },
      steps.map((st, i) => h('li', { className: 'flow__item' },
        h('div', { className: `flow__step${st.tone ? ' flow__step--' + st.tone : ''}` },
          h('span', { className: 'flow__icon' }, icon(st.iconName)),
          h('span', { className: 'flow__text' },
            h('span', { className: 'flow__title', text: st.title }),
            h('span', { className: 'flow__sub', text: st.sub }))),
        i < steps.length - 1 ? icon('arrow-right', 'flow__arrow') : null)));
    const meta = [card.version ? `Versión ${card.version}` : null, card.created_at ? `generada el ${fmt.date(card.created_at)}` : null].filter(Boolean).join(' · ');
    return h('section', { className: 'card model-hero', attrs: { 'aria-label': 'Cómo funciona el modelo entrenado' } },
      h('div', { className: 'card__head' },
        h('h2', { className: 'card__title' }, icon('model'), 'Cómo funciona: dos modelos en cadena'),
        meta ? h('span', { className: 'small muted', text: meta }) : null),
      h('div', { className: 'card__body model-hero__body' },
        h('p', { className: 'model-hero__lead' },
          'Primero un ', h('strong', { text: 'detector YOLO' }), ' localiza cada placa en la foto; después un ',
          h('strong', { text: 'lector CRNN' }), ' (entrenado con pérdida CTC) lee sus caracteres a partir del recorte. ',
          'Al final, la lectura se ajusta al formato colombiano ', h('span', { className: 'mono', text: 'ABC123' }), '.'),
        flow));
  }

  function statChips(obj, keys = ['train', 'val', 'test']) {
    const o = obj || {};
    const total = keys.reduce((a, k) => a + num(o[k]), 0);
    return h('div', { className: 'stat-chips' },
      keys.map((k) => h('span', { className: 'stat-chip' }, h('span', { className: 'stat-chip__label', text: SPLIT_LABEL[k] || k }), h('strong', { text: intOr(o[k]) }))),
      h('span', { className: 'stat-chip stat-chip--total' }, h('span', { className: 'stat-chip__label', text: 'Total' }), h('strong', { text: fmt.int(total) })));
  }

  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);

  function datasetCardEl(ds) {
    const url = safeUrl(ds.url);
    const name = ds.nombre || 'Dataset sin nombre';
    return h('section', { className: 'card', attrs: { 'aria-label': 'Datos de entrenamiento' } },
      h('div', { className: 'card__head' }, h('h2', { className: 'card__title' }, icon('database'), 'Datos')),
      h('div', { className: 'card__body dataset' },
        h('dl', { className: 'dataset__facts' },
          h('div', null, h('dt', { text: 'Dataset de fotos reales' }),
            h('dd', null, url
              ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', className: 'ext-link' }, name, icon('external'), h('span', { className: 'sr-only', text: ' (se abre en una pestaña nueva)' }))
              : h('span', { text: name }))),
          h('div', null, h('dt', { text: 'Licencia' }), h('dd', { text: ds.licencia || '—' }))),
        h('div', { className: 'dataset__block' },
          h('h3', { className: 'dataset__title', text: 'Imágenes reales por partición (detector y lector)' }),
          statChips(ds.imagenes)),
        ds.nota_etiquetas ? h('div', { className: 'callout callout--warn small', attrs: { role: 'note' } },
          icon('alert'),
          h('span', null, h('strong', { text: 'Etiquetas automáticas: ' }), ds.nota_etiquetas)) : null,
        ds.sinteticas_colombianas ? h('div', { className: 'dataset__block' },
          h('h3', { className: 'dataset__title', text: 'Placas sintéticas colombianas (lector)' }),
          h('p', { className: 'xsmall muted', text: 'Generadas por ordenador con el formato colombiano ABC123 para enseñar al lector la tipografía y el formato locales.' }),
          statChips(ds.sinteticas_colombianas)) : null));
  }

  function detectorSectionEl(det) {
    const t = det.test || {}, sp = det.speed_ms_per_image || {};
    const meta = [
      det.model, isNum(det.epochs) ? `${fmt.int(det.epochs)} épocas` : null, isNum(det.imgsz) ? `${fmt.int(det.imgsz)} px` : null,
      isNum(det.train_minutes) ? `${fmt.dec(det.train_minutes)} min de entrenamiento` : null,
      isNum(t.images) ? `${fmt.int(t.images)} imágenes de prueba` : null,
    ].filter(Boolean).join(' · ');
    return modelSection('Detector YOLO · métricas en prueba', 'target', meta,
      h('div', { className: 'kpis' },
        kpiEl({ label: 'Precisión', value: pctOr(t.precision), sub: 'Cajas detectadas que sí son placas', iconName: 'check', tone: 'ok', ratio: t.precision }),
        kpiEl({ label: 'Recall', value: pctOr(t.recall), sub: 'Placas reales que encuentra', iconName: 'search', tone: 'det', ratio: t.recall }),
        kpiEl({ label: 'mAP@50', value: pctOr(t.map50), sub: 'Precisión media con IoU ≥ 0,5', iconName: 'target', tone: 'accent', ratio: t.map50 }),
        kpiEl({ label: 'mAP@50-95', value: pctOr(t.map50_95), sub: 'Media con IoU de 0,5 a 0,95 (más exigente)', iconName: 'layers', ratio: t.map50_95 }),
        kpiEl({ label: 'Inferencia', value: msOr(sp.inference), sub: `Por imagen · preprocesado ${msOr(sp.preprocess)} · posprocesado ${msOr(sp.postprocess)}`, iconName: 'clock' })));
  }

  function ocrSectionEl(ocr) {
    const tst = ocr.test || {};
    const meta = [
      ocr.model, isNum(ocr.epochs) ? `${fmt.int(ocr.epochs)} épocas` : null,
      isNum(ocr.train_minutes) ? `${fmt.dec(ocr.train_minutes)} min de entrenamiento` : null,
    ].filter(Boolean).join(' · ');
    const groups = OCR_SPLITS.map(({ key, title, sub }) => {
      const ev = tst[key];
      if (!ev) return null;
      return h('div', { className: 'kpi-group' },
        h('h3', { className: 'kpi-group__title' }, title,
          h('span', { className: 'badge', text: `${intOr(ev.n)} placas de prueba` })),
        h('p', { className: 'xsmall muted kpi-group__sub', text: sub }),
        h('div', { className: 'kpis' },
          kpiEl({ label: 'Placas exactas', value: pctOr(ev.plate_accuracy), sub: 'Lectura completa sin errores', iconName: 'target', tone: 'accent', ratio: ev.plate_accuracy }),
          kpiEl({ label: 'Caracteres correctos', value: pctOr(ev.char_accuracy), sub: 'Por posición', iconName: 'type', tone: 'det', ratio: ev.char_accuracy }),
          kpiEl({ label: 'CER', value: pctOr(ev.cer), sub: 'Tasa de error por carácter (menos es mejor)', iconName: 'alert' }),
          kpiEl({ label: 'Confianza media', value: pctOr(ev.avg_confidence), sub: 'Del lector en sus predicciones', iconName: 'gauge', ratio: ev.avg_confidence })));
    });
    return modelSection('Lector CRNN + CTC · métricas en prueba', 'type', meta,
      groups,
      h('div', { className: 'kpis kpis--compact' },
        kpiEl({ label: 'Parámetros', value: isNum(ocr.params) ? fmt.compact(ocr.params) : '—', sub: isNum(ocr.params) ? `${fmt.int(ocr.params)} pesos entrenables` : null, iconName: 'model' }),
        kpiEl({ label: 'Mejor época', value: intOr(ocr.best_epoch), sub: isNum(ocr.epochs) ? `de ${fmt.int(ocr.epochs)} (se guardó esta)` : null, iconName: 'check' }),
        kpiEl({ label: 'Muestras de entrenamiento', value: intOr(ocr.train_samples), sub: 'Recortes de placa usados para entrenar', iconName: 'layers' })));
  }

  function legendEl(series) {
    return h('div', { className: 'chart-legend' }, series.map((se) => h('span', null,
      h('i', { className: se.dash ? 'is-dashed' : '', style: se.dash ? { borderColor: se.color } : { background: se.color } }),
      se.label + (se.axis === 'right' ? ' (eje derecho)' : ''))));
  }

  function detectorCurveCard(det) {
    const hist = Array.isArray(det.history) ? det.history.filter((r) => r && isNum(r.epoch)) : [];
    if (!hist.length) return chartCard('Detector · validación por época', 'target', emptyState({ art: 'chart', compact: true, title: 'Sin historial de entrenamiento' }));
    const xs = hist.map((r) => r.epoch);
    const series = [
      { label: 'mAP@50', key: 'map50', color: 'var(--series-1)' },
      { label: 'mAP@50-95', key: 'map50_95', color: 'var(--series-2)' },
      { label: 'Precisión', key: 'precision', color: 'var(--series-3)' },
      { label: 'Recall', key: 'recall', color: 'var(--series-4)' },
    ].map((se) => ({ ...se, values: hist.map((r) => (isNum(r[se.key]) ? r[se.key] : null)), format: fmt.pct }));
    const last = hist[hist.length - 1];
    const chart = lineChart({
      xs, series, yLeft: { max: 1, format: fmt.pct0, title: 'Métrica' }, height: 270,
      ariaLabel: `Curvas del detector en ${hist.length} épocas. Última época: mAP@50 ${pctOr(last.map50)}, mAP@50-95 ${pctOr(last.map50_95)}, precisión ${pctOr(last.precision)}, recall ${pctOr(last.recall)}`,
    });
    return chartCard('Detector · validación por época', 'target',
      legendEl(series), chart,
      dataTableDetails('Historial de entrenamiento del detector',
        ['Época', 'mAP@50', 'mAP@50-95', 'Precisión', 'Recall', 'Pérdida caja (entren.)', 'Pérdida caja (valid.)'],
        hist.map((r) => [fmt.int(r.epoch), pctOr(r.map50), pctOr(r.map50_95), pctOr(r.precision), pctOr(r.recall),
          isNum(r.train_box_loss) ? fmt.dec3(r.train_box_loss) : '—', isNum(r.val_box_loss) ? fmt.dec3(r.val_box_loss) : '—'])));
  }

  function ocrCurveCard(ocr) {
    const hist = Array.isArray(ocr.history) ? ocr.history.filter((r) => r && isNum(r.epoch)) : [];
    if (!hist.length) return chartCard('Lector · validación por época', 'type', emptyState({ art: 'chart', compact: true, title: 'Sin historial de entrenamiento' }));
    const xs = hist.map((r) => r.epoch);
    const pick = (k) => hist.map((r) => (isNum(r[k]) ? r[k] : null));
    const series = [
      { label: 'Placas exactas · fotos reales', color: 'var(--series-1)', values: pick('real_val_plate_accuracy'), format: fmt.pct },
      { label: 'Placas exactas · sintéticas colombianas', color: 'var(--series-3)', values: pick('synth_val_plate_accuracy'), format: fmt.pct },
      { label: 'Pérdida CTC (entrenamiento)', color: 'var(--muted)', values: pick('train_loss'), format: fmt.dec3, axis: 'right', dash: true },
    ];
    const best = isNum(ocr.best_epoch) ? ocr.best_epoch : null;
    const bestRow = best !== null ? hist.find((r) => r.epoch === best) : null;
    const chart = lineChart({
      xs, series, height: 270,
      yLeft: { max: 1, format: fmt.pct0, title: 'Placas exactas' },
      yRight: { format: (v) => fmt.dec(v), title: 'Pérdida' },
      marker: best !== null ? { x: best, label: `Mejor época (${fmt.int(best)})` } : null,
      ariaLabel: `Curvas del lector en ${hist.length} épocas${bestRow ? `. Mejor época ${fmt.int(best)}: placas exactas ${pctOr(bestRow.real_val_plate_accuracy)} en fotos reales y ${pctOr(bestRow.synth_val_plate_accuracy)} en sintéticas colombianas` : ''}`,
    });
    return chartCard('Lector · validación por época', 'type',
      legendEl(series), chart,
      dataTableDetails('Historial de entrenamiento del lector',
        ['Época', 'Placas (reales)', 'Caracteres (reales)', 'Placas (sintéticas)', 'Caracteres (sintéticas)', 'Pérdida', 'Tiempo'],
        hist.map((r) => [fmt.int(r.epoch) + (r.epoch === best ? ' ★' : ''), pctOr(r.real_val_plate_accuracy), pctOr(r.real_val_char_accuracy),
          pctOr(r.synth_val_plate_accuracy), pctOr(r.synth_val_char_accuracy),
          isNum(r.train_loss) ? fmt.dec3(r.train_loss) : '—', isNum(r.seconds) ? fmt.sec(r.seconds) : '—'])));
  }

  function readResultCell(r, expected) {
    if (!r) return h('span', { className: 'muted', text: '—' });
    const leido = typeof r.leido === 'string' ? r.leido : '';
    return h('div', { className: 'res-cell' },
      h('div', { className: 'res-cell__main' },
        r.exacta
          ? h('span', { className: 'badge badge--ok res-cell__mark', attrs: { title: 'Lectura exacta' } }, icon('check'), h('span', { className: 'sr-only', text: 'Exacta' }))
          : h('span', { className: 'badge badge--err res-cell__mark', attrs: { title: 'Lectura incorrecta' } }, icon('x'), h('span', { className: 'sr-only', text: 'Incorrecta' })),
        leido ? diffEl(leido, expected, 'Leído por el modelo') : h('span', { className: 'small muted', text: 'Sin detección' })),
      h('div', { className: 'xsmall muted', text: `${intOr(r.placas)} placa${r.placas === 1 ? '' : 's'} · ${isNum(r.ms) ? fmt.ms0(r.ms) : '—'}` }));
  }

  function colombiaSectionEl(co) {
    const ml = (co.summary || {}).ml || {};
    const rows = Array.isArray(co.per_image) ? co.per_image : [];
    const n = rows.length || num(ml.images);
    const ok = rows.filter((r) => r && r.ml && r.ml.exacta).length;
    const id = uid('co');
    const tbody = h('tbody', null, rows.length
      ? rows.map((r) => h('tr', null,
        h('th', { attrs: { scope: 'row' } }, h('span', { className: 'mono small img-name', text: r.imagen || '—', attrs: { title: r.imagen || '' } })),
        h('td', null, h('span', { className: 'plate-text', text: r.esperado || '—' })),
        h('td', null, readResultCell(r.ml, r.esperado))))
      : h('tr', null, h('td', { attrs: { colspan: 3 } }, emptyState({ art: 'plate', compact: true, title: 'Sin resultados por imagen' }))));

    return h('section', { className: 'card highlight-card', attrs: { 'aria-labelledby': id } },
      h('div', { className: 'card__head' },
        h('h2', { className: 'card__title highlight-card__title', id }, icon('car'), 'Prueba con fotos colombianas reales'),
        n ? h('span', { className: 'badge badge--accent', text: `${fmt.int(n)} foto${n === 1 ? '' : 's'}` }) : null),
      h('div', { className: 'card__body highlight-card__body' },
        rows.length ? h('p', { className: 'highlight-card__lead' },
          h('strong', { className: 'is-ml', text: `${fmt.int(ok)} de ${fmt.int(n)}` }), ' placas leídas exactamente.') : null,
        co.nota ? h('p', { className: 'small muted', text: co.nota }) : null,
        h('div', { className: 'kpis' },
          kpiEl({ label: 'Tasa de detección', value: pctOr(ml.detection_rate), sub: 'Fotos en las que encontró la placa', iconName: 'scan', tone: 'ok', ratio: ml.detection_rate }),
          kpiEl({ label: 'Placas exactas', value: pctOr(ml.plate_accuracy), sub: 'Lectura completa sin errores', iconName: 'target', tone: 'accent', ratio: ml.plate_accuracy }),
          kpiEl({ label: 'Caracteres correctos', value: pctOr(ml.char_accuracy), sub: '1 − distancia de edición / longitud', iconName: 'type', tone: 'det', ratio: ml.char_accuracy }),
          kpiEl({ label: 'Tiempo medio por foto', value: msOr(ml.avg_ms), sub: 'Detección + lectura, en CPU', iconName: 'clock' })),
        h('div', { className: 'inner-table table-scroll' },
          h('table', { className: 'data-table compare-table' },
            h('caption', { className: 'sr-only', text: 'Resultado por foto colombiana real: placa esperada y lectura del modelo, con los caracteres erróneos resaltados.' }),
            h('thead', null, h('tr', null,
              h('th', { attrs: { scope: 'col' }, text: 'Imagen' }),
              h('th', { attrs: { scope: 'col' }, text: 'Esperado' }),
              h('th', { attrs: { scope: 'col' }, text: 'Leído por el modelo' }))),
            tbody))));
  }

  function errorsListEl(list) {
    const items = Array.isArray(list) ? list.filter(Boolean) : [];
    if (!items.length) return h('p', { className: 'small muted', text: 'No hay ejemplos de errores registrados.' });
    return h('ul', { className: 'err-list' }, items.map((e) => h('li', { className: 'err-item' },
      h('span', { className: 'err-item__part' }, h('span', { className: 'xsmall muted', text: 'Esperado' }), h('span', { className: 'plate-text', text: e.esperado || '—' })),
      icon('arrow-right', 'err-item__arrow'),
      h('span', { className: 'err-item__part' }, h('span', { className: 'xsmall muted', text: 'Predicho' }),
        e.predicho ? diffEl(e.predicho, e.esperado, 'Predicho') : h('span', { className: 'small muted', text: '(vacío)' })))));
  }

  function ocrErrorsEl(ocr) {
    const tst = ocr.test || {};
    const cards = OCR_SPLITS.filter(({ key }) => tst[key]).map(({ key, title }) => {
      const list = tst[key].errores_ejemplo;
      return h('section', { className: 'card', attrs: { 'aria-label': `Errores del lector: ${title}` } },
        h('div', { className: 'card__head' },
          h('h3', { className: 'card__title' }, icon('alert'), title),
          h('span', { className: 'count-pill', text: String(Array.isArray(list) ? list.length : 0) })),
        h('div', { className: 'card__body' }, errorsListEl(list)));
    });
    if (!cards.length) return null;
    return modelSection('Ejemplos de errores del lector', 'alert', 'Lecturas equivocadas en prueba; los caracteres distintos al esperado aparecen resaltados.',
      h('div', { className: 'charts' }, cards));
  }

  function setupModel() {
    $('#btn-model-refresh').addEventListener('click', () => loadModel({ force: true }));
  }

  /* ------------------------------------------------------------------ */
  /* Sesión: usuario en la barra superior                                 */
  /* ------------------------------------------------------------------ */
  const ROLE_LABEL = { administrador: 'Administrador', usuario: 'Usuario' };
  function renderUserMenu() {
    const u = state.user;
    const menu = $('#user-menu');
    if (!u) { menu.hidden = true; return; }
    const initials = String(u.name || u.username).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
    $('#user-avatar').textContent = initials || '?';
    $('#user-name').textContent = u.name || u.username;
    $('#user-role').textContent = `${ROLE_LABEL[u.role] || u.role} · @${u.username}`;
    menu.title = `Sesión iniciada como ${u.username}`;
    menu.hidden = false;
    $('#btn-logout').onclick = async () => {
      const ok = await confirmDialog({ title: '¿Cerrar sesión?', message: 'Tendrás que volver a escribir tu usuario y contraseña para entrar.', confirmText: 'Cerrar sesión' });
      if (!ok) return;
      try { await api.logout(); } catch (e) { /* se redirige igual */ }
      location.replace('/login.html');
    };
  }

  /* ------------------------------------------------------------------ */
  /* Informe de validación (GET /api/report)                              */
  /* ------------------------------------------------------------------ */
  function loadReport({ force = false } = {}) {
    const rp = state.report;
    if (rp.loading) return rp.promise;
    if (rp.data && !force) { if (state.view === 'tests') renderTests(); if (state.view === 'inicio') renderInicio(); return Promise.resolve(rp.data); }
    rp.loading = true;
    setBusy($('#btn-tests-refresh'), true);
    if (state.view === 'tests' && !rp.data) renderTests();
    rp.promise = (async () => {
      try {
        rp.data = await api.report();
        rp.error = null;
      } catch (e) {
        rp.error = e.message;
        if (state.view === 'tests') toastError('No se pudo cargar el informe de validación', e);
      } finally {
        rp.loading = false;
        setBusy($('#btn-tests-refresh'), false);
        if (state.view === 'tests') renderTests();
        if (state.view === 'inicio') renderInicio();
      }
      return rp.data;
    })();
    return rp.promise;
  }

  /* ------------------------------------------------------------------ */
  /* Vista 0: Inicio                                                      */
  /* ------------------------------------------------------------------ */
  const QUICK_LINKS = [
    { view: 'detector', iconName: 'scan', title: 'Detector', text: 'Elige una foto real de la galería y mira cómo el modelo encuentra y lee la placa, carácter por carácter.' },
    { view: 'upload', iconName: 'upload', title: 'Subir imagen', text: 'Analiza una foto propia o captura una con la cámara del equipo.' },
    { view: 'batch', iconName: 'batch', title: 'Evaluación por lotes', text: 'Toma hasta 50 fotos al azar y mide precisión y tiempo en una sola ejecución.' },
    { view: 'history', iconName: 'history', title: 'Historial', text: 'Cada detección queda guardada con su resultado; se puede buscar, filtrar y exportar.' },
    { view: 'stats', iconName: 'stats', title: 'Estadísticas', text: 'Métricas acumuladas de todas las detecciones hechas en la aplicación.' },
    { view: 'model', iconName: 'model', title: 'Modelo', text: 'Datos de entrenamiento, curvas por época, métricas de prueba y un recorrido paso a paso.' },
    { view: 'tests', iconName: 'beaker', title: 'Pruebas y validación', text: 'Evaluación sobre las 168 fotos de validación, análisis de errores y pruebas automatizadas.' },
  ];

  function renderInicio() {
    const host = $('#inicio-content');
    if (!host) return;
    const rep = state.report.data || {};
    const g = rep.gallery, t = rep.tests;
    const card = state.model.data && state.model.data.card;
    const sm = g ? g.summary : null;
    const name = state.user ? (state.user.name || state.user.username).split(/\s+/)[0] : '';

    const hero = h('section', { className: 'card home-hero', attrs: { 'aria-labelledby': 'home-title' } },
      h('div', { className: 'home-hero__text' },
        h('p', { className: 'eyebrow', text: name ? `Hola, ${name}` : 'Bienvenido' }),
        h('h1', { className: 'home-hero__title', id: 'home-title' }, 'Identificación automática de ', h('span', { className: 'hl', text: 'placas vehiculares' })),
        h('p', { className: 'home-hero__lead' },
          'PlacaVision recibe una foto de un vehículo y devuelve el texto de su placa. Para eso encadena dos redes neuronales entrenadas en este proyecto: ',
          h('strong', { text: 'un detector YOLO' }), ' que encuentra dónde está la placa y ', h('strong', { text: 'un lector CRNN' }),
          ' que lee sus caracteres. Todo se evalúa con fotos reales cuyo texto correcto se conoce, para medir cuánto acierta.'),
        h('div', { className: 'home-hero__actions' },
          h('button', { className: 'btn btn--primary', type: 'button', on: { click: () => { switchView('detector'); loadGallery().then(() => randomPhoto()); } } }, icon('scan'), h('span', { text: 'Probar con una foto real' })),
          h('button', { className: 'btn btn--ghost', type: 'button', on: { click: () => switchView('tests') } }, icon('beaker'), h('span', { text: 'Ver pruebas y validación' })))),
      h('div', { className: 'home-hero__art', attrs: { 'aria-hidden': 'true' } },
        h('div', { className: 'home-plate' }, plateEl('RJV247', { label: 'Ejemplo de placa colombiana' })),
        h('div', { className: 'home-hero__scan' })));

    const kpis = sm
      ? h('div', { className: 'kpis' },
        kpiEl({ label: 'Placas localizadas', value: pctOr(sm.detection_rate), sub: `${fmt.int(sm.plates_expected)} placas en ${fmt.int(sm.photos)} fotos reales`, iconName: 'scan', tone: 'ok', ratio: sm.detection_rate }),
        kpiEl({ label: 'Lecturas exactas', value: pctOr(sm.plate_accuracy), sub: `Placa completa sin errores (${fmt.int(sm.plates_readable)} con texto conocido)`, iconName: 'target', tone: 'accent', ratio: sm.plate_accuracy }),
        kpiEl({ label: 'Caracteres correctos', value: pctOr(sm.char_accuracy), sub: 'Aunque la placa no sea exacta', iconName: 'type', tone: 'det', ratio: sm.char_accuracy }),
        kpiEl({ label: 'Tiempo por foto', value: msOr(sm.avg_ms), sub: g.latency_ms ? `p95 ${fmt.ms0(g.latency_ms.p95)} · en CPU` : 'En CPU', iconName: 'clock' }),
        t ? kpiEl({ label: 'Pruebas automatizadas', value: `${fmt.int(t.passed)}/${fmt.int(t.total)}`, sub: t.failed ? `${fmt.int(t.failed)} fallidas` : 'Todas superadas', iconName: 'shield', tone: t.failed ? '' : 'ok', ratio: t.total ? t.passed / t.total : 0 }) : null)
      : (state.report.loading ? h('div', { className: 'kpis' }, [0, 1, 2, 3, 4].map(() => skel('skel-card', { height: '120px' })))
        : h('p', { className: 'small muted', text: 'Aún no hay informe de validación: genéralo con «python ml/evaluate_gallery.py».' }));

    const ds = card && card.dataset ? card.dataset : {};
    const det = card && card.detector ? card.detector : {};
    const ocr = card && card.ocr ? card.ocr : {};
    const imgs = ds.imagenes || {};
    const syn = ds.sinteticas_colombianas || {};
    const ocrReal = (ocr.test || {}).real_test || {};
    const steps = [
      { iconName: 'database', title: 'Datos', text: `${fmt.int(num(imgs.train) + num(imgs.val) + num(imgs.test))} fotos reales con placas etiquetadas (${fmt.int(imgs.train)} entrenamiento · ${fmt.int(imgs.val)} validación · ${fmt.int(imgs.test)} prueba), licencia ${ds.licencia || 'CC BY 4.0'}. Para el lector, además, ${fmt.int(num(syn.train))} placas colombianas generadas para aprender el formato local.` },
      { iconName: 'target', title: 'Entrenamiento del detector', text: `${det.model || 'YOLO11n'} ajustado durante ${intOr(det.epochs)} épocas (${isNum(det.train_minutes) ? fmt.dec(det.train_minutes) + ' min' : '—'} en CPU). En prueba: mAP@50 ${pctOr((det.test || {}).map50)}, precisión ${pctOr((det.test || {}).precision)}, recall ${pctOr((det.test || {}).recall)}.` },
      { iconName: 'type', title: 'Entrenamiento del lector', text: `${ocr.model || 'CRNN + CTC'} de ${isNum(ocr.params) ? fmt.compact(ocr.params) : '—'} parámetros, entrenado desde cero ${intOr(ocr.epochs)} épocas (se guardó la mejor, la ${intOr(ocr.best_epoch)}). Sobre recortes reales de prueba: ${pctOr(ocrReal.plate_accuracy)} placas exactas y ${pctOr(ocrReal.char_accuracy)} caracteres.` },
      { iconName: 'scan', title: 'Validación con fotos reales', text: sm ? `Se corrió el sistema completo sobre ${fmt.int(sm.photos)} fotos que el modelo nunca vio: localizó el ${pctOr(sm.detection_rate)} de las placas y leyó exactas el ${pctOr(sm.plate_accuracy)}. Ver análisis de errores en «Pruebas y validación».` : 'Evaluación del sistema completo sobre la galería de fotos reales.' },
      { iconName: 'shield', title: 'Pruebas automatizadas', text: t ? `${fmt.int(t.total)} pruebas en ${fmt.int(t.files.length)} archivos comprueban el formato colombiano, la decodificación CTC, la API, la evaluación, la base de datos y el inicio de sesión. Resultado: ${fmt.int(t.passed)} superadas.` : 'Pruebas de la API, del modelo y del inicio de sesión (pytest).' },
    ];

    host.replaceChildren(h('div', { className: 'stats-grid home-grid' },
      hero,
      modelSection('Resultados sobre fotos reales nunca vistas', 'target', sm ? `Evaluación del sistema completo · ${fmt.date(g.created_at)}` : null, kpis),
      card ? modelPipelineEl(card) : null,
      modelSection('Cómo se construyó el modelo', 'layers', 'Del dato a la validación: cada paso deja métricas que se pueden revisar en la aplicación.',
        h('ol', { className: 'build-steps' }, steps.map((st, i) => h('li', { className: 'build-step' },
          h('span', { className: 'build-step__n', text: String(i + 1) }),
          h('div', null, h('h3', { className: 'build-step__title' }, icon(st.iconName), st.title), h('p', { className: 'small muted', text: st.text })))))),
      modelSection('Recorrido por la aplicación', 'home', 'Cada sección muestra una parte del trabajo; usa las teclas 1 a 8 para moverte.',
        h('div', { className: 'quick-grid' }, QUICK_LINKS.map((q, i) => h('button', { className: 'quick-card', type: 'button', on: { click: () => switchView(q.view) } },
          h('span', { className: 'quick-card__icon' }, icon(q.iconName)),
          h('span', { className: 'quick-card__title' }, q.title, h('kbd', { text: String(i + 2) })),
          h('span', { className: 'quick-card__text', text: q.text }))))),
      h('section', { className: 'callout callout--warn small home-limits', attrs: { role: 'note' } }, icon('info'),
        h('span', null, h('strong', { text: 'Limitaciones conocidas: ' }),
          'los errores típicos son de un solo carácter (O↔D, W↔N, 3↔5); fallan placas muy pequeñas, sucias o borrosas; las placas de moto (dos renglones) no están soportadas. En el dataset público el texto esperado lo generó otro modelo y tiene errores, así que su precisión real es algo mayor que la medida.'))));
  }

  /* ------------------------------------------------------------------ */
  /* Vista 8: Pruebas y validación                                        */
  /* ------------------------------------------------------------------ */
  const TEST_FILE_LABEL = {
    'backend/tests/test_api.py': 'API, galería, evaluación y base de datos',
    'backend/tests/test_auth.py': 'Inicio de sesión y seguridad',
    'backend/tests/test_ml.py': 'Modelo: formato colombiano y decodificación CTC',
  };

  function photoOutcome(r) {
    const ev = r.evaluation || {};
    if (!ev.matched) return 'missed';
    return ev.correct ? 'ok' : 'err';
  }
  const OUTCOME = {
    ok: { label: 'Correcta', cls: 'badge--ok', iconName: 'check' },
    err: { label: 'Con errores', cls: 'badge--err', iconName: 'x' },
    missed: { label: 'Sin detectar', cls: 'badge--warn', iconName: 'alert' },
  };

  function renderTests() {
    const host = $('#tests-content');
    const rp = state.report;
    if (rp.loading && !rp.data) {
      host.replaceChildren(h('div', { className: 'skel-stack' }, h('div', { className: 'kpis' }, [0, 1, 2, 3, 4].map(() => skel('skel-card', { height: '120px' }))),
        h('div', { className: 'charts' }, skel('skel-card', { height: '300px' }), skel('skel-card', { height: '300px' }))));
      return;
    }
    if (!rp.data || (!rp.data.gallery && !rp.data.tests)) {
      host.replaceChildren(emptyState({
        art: 'chart', title: 'Todavía no hay informes de validación', text: rp.error || 'Genéralos desde la raíz del proyecto:',
        action: h('div', { className: 'cmd-block' }, h('ol', { className: 'cmd-list' },
          h('li', null, h('code', { text: 'python ml/evaluate_gallery.py' })),
          h('li', null, h('code', { text: 'python -m backend.tests.report' })))),
      }));
      return;
    }
    const { gallery: g, tests: t } = rp.data;
    host.replaceChildren(h('div', { className: 'stats-grid' },
      g ? galleryEvalEl(g) : null,
      g ? errorAnalysisEl(g) : null,
      g ? perPhotoEl(g) : null,
      t ? autoTestsEl(t) : null,
      h('p', { className: 'xsmall muted' }, 'Para regenerar estos informes: ', h('code', { text: 'python ml/evaluate_gallery.py' }), ' y ', h('code', { text: 'python -m backend.tests.report' }), '.')));
  }

  function galleryEvalEl(g) {
    const sm = g.summary || {};
    const bs = g.by_set || {};
    const cats = SETS.map((k) => SET_LABEL[k]);
    const series = [
      { label: 'Placas localizadas', color: 'var(--series-3)', values: SETS.map((k) => (bs[k] ? bs[k].detection_rate : null)) },
      { label: 'Lecturas exactas', color: 'var(--series-1)', values: SETS.map((k) => (bs[k] ? bs[k].plate_accuracy : null)) },
      { label: 'Caracteres correctos', color: 'var(--series-2)', values: SETS.map((k) => (bs[k] ? bs[k].char_accuracy : null)) },
    ];
    const chart = barChart({ categories: cats, series, max: 1, yFormat: fmt.pct0, valueFormat: fmt.pct0, height: 260,
      ariaLabel: 'Métricas por conjunto: ' + SETS.map((k, i) => `${cats[i]}: localizadas ${pctOr(bs[k] && bs[k].detection_rate)}, exactas ${pctOr(bs[k] && bs[k].plate_accuracy)}`).join('; ') });
    const lat = g.latency_ms || {};
    return modelSection('Evaluación sobre todas las fotos de la galería', 'target',
      `${fmt.int(sm.photos)} fotos reales que el modelo no vio al entrenar · sistema completo (detección + lectura + formato) · ${fmt.date(g.created_at)} · ${fmt.dec(g.total_seconds)} s`,
      h('div', { className: 'kpis' },
        kpiEl({ label: 'Placas localizadas', value: pctOr(sm.detection_rate), sub: `${fmt.int(sm.plates_expected)} placas esperadas`, iconName: 'scan', tone: 'ok', ratio: sm.detection_rate }),
        kpiEl({ label: 'Lecturas exactas', value: pctOr(sm.plate_accuracy), sub: `Sobre ${fmt.int(sm.plates_readable)} placas con texto conocido`, iconName: 'target', tone: 'accent', ratio: sm.plate_accuracy }),
        kpiEl({ label: 'Caracteres correctos', value: pctOr(sm.char_accuracy), sub: '1 − distancia de edición / longitud', iconName: 'type', tone: 'det', ratio: sm.char_accuracy }),
        kpiEl({ label: 'Fotos 100 % correctas', value: `${fmt.int(sm.photos_correct)}/${fmt.int(sm.photos)}`, sub: `${fmt.int(sm.false_positives)} falsos positivos en total`, iconName: 'check', ratio: sm.photos ? sm.photos_correct / sm.photos : 0 }),
        kpiEl({ label: 'Tiempo por foto', value: msOr(lat.mean), sub: `mediana ${msOr(lat.p50)} · p95 ${msOr(lat.p95)}`, iconName: 'clock' })),
      h('div', { className: 'charts' },
        chartCard('Comparación por conjunto de fotos', 'stats',
          h('div', { className: 'chart-legend' }, series.map((se) => h('span', null, h('i', { style: { background: se.color } }), se.label))), chart,
          dataTableDetails('Métricas por conjunto', ['Conjunto', 'Fotos', 'Localizadas', 'Exactas', 'Caracteres', 'Falsos positivos', 'Tiempo medio'],
            SETS.map((k, i) => { const m = bs[k] || {}; return [cats[i], intOr(m.photos), pctOr(m.detection_rate), pctOr(m.plate_accuracy), pctOr(m.char_accuracy), intOr(m.false_positives), msOr(m.avg_ms)]; }))),
        chartCard('Cómo leer estas cifras', 'info',
          h('ul', { className: 'explain-list' },
            h('li', null, h('strong', { text: 'Placas localizadas: ' }), 'el detector encontró la placa (su caja se superpone al menos un 30 % con la esperada).'),
            h('li', null, h('strong', { text: 'Lecturas exactas: ' }), 'el texto leído coincide carácter por carácter con el esperado.'),
            h('li', null, h('strong', { text: 'Caracteres correctos: ' }), 'cuánto se parece la lectura aunque tenga algún error; distingue un fallo de un carácter de uno total.'),
            h('li', null, h('strong', { text: 'Colombianas: ' }), 'texto anotado a mano, es la medida más fiel para el formato ABC123.'),
            h('li', null, h('strong', { text: 'Dataset público: ' }), 'placas de varios países cuyo texto esperado lo generó otro modelo; parte de los «errores» son errores de la etiqueta.')))));
  }

  function errorAnalysisEl(g) {
    const loc = g.localization || {};
    const histCats = (loc.histogram || []).map((_, i) => `≥${fmt.dec(i / 10)}`);
    const iouChart = barChart({ categories: histCats, series: [{ label: 'Placas', color: 'var(--det)', values: loc.histogram || [] }],
      yFormat: fmt.int, valueFormat: fmt.int, height: 230, ariaLabel: `Distribución del IoU de ${fmt.int(loc.matched)} placas localizadas, media ${fmt.dec3(loc.iou_mean)}` });
    const bySize = g.by_plate_size || [];
    const sizeChart = barChart({ categories: bySize.map((b) => b.rango),
      series: [
        { label: 'Localizadas', color: 'var(--series-3)', values: bySize.map((b) => b.detection_rate) },
        { label: 'Exactas', color: 'var(--series-1)', values: bySize.map((b) => b.plate_accuracy) },
      ], max: 1, yFormat: fmt.pct0, valueFormat: fmt.pct0, height: 230, ariaLabel: 'Precisión según el ancho de la placa en la foto' });
    const cal = g.calibration || [];
    const calChart = barChart({ categories: cal.map((c) => c.rango), series: [{ label: 'Lecturas exactas', color: 'var(--accent)', values: cal.map((c) => c.aciertos) }],
      max: 1, yFormat: fmt.pct0, valueFormat: fmt.pct0, height: 230, ariaLabel: 'Porcentaje de lecturas exactas según la confianza del modelo' });
    const conf = g.char_confusions || [];
    return modelSection('Análisis de errores', 'alert', 'Dónde y por qué se equivoca el modelo: sirve para saber cuándo confiar en él y qué mejorar.',
      h('div', { className: 'charts' },
        chartCard('Precisión de la localización (IoU)', 'target',
          h('p', { className: 'small muted', style: 'margin-bottom:8px', text: `Solapamiento entre la caja del detector y la esperada. Media ${fmt.dec3(loc.iou_mean)} · ${pctOr(loc.iou_ge_50)} con IoU ≥ 0,5 · ${pctOr(loc.iou_ge_70)} con IoU ≥ 0,7.` }),
          iouChart),
        chartCard('Según el tamaño de la placa', 'crop',
          h('p', { className: 'small muted', style: 'margin-bottom:8px', text: 'Ancho de la placa en la foto. Las placas pequeñas tienen pocos píxeles por carácter y se leen peor.' }),
          h('div', { className: 'chart-legend' }, h('span', null, h('i', { style: { background: 'var(--series-3)' } }), 'Localizadas'), h('span', null, h('i', { style: { background: 'var(--series-1)' } }), 'Lecturas exactas')),
          sizeChart,
          dataTableDetails('Precisión por tamaño', ['Ancho', 'Placas', 'Localizadas', 'Exactas'], bySize.map((b) => [b.rango, intOr(b.placas), pctOr(b.detection_rate), pctOr(b.plate_accuracy)]))),
        chartCard('¿La confianza predice el acierto?', 'gauge',
          h('p', { className: 'small muted', style: 'margin-bottom:8px', text: 'Lecturas exactas según la confianza que dio el modelo. Si sube con la confianza, el modelo «sabe» cuándo duda: útil para pedir revisión humana en los casos bajos.' }),
          calChart,
          dataTableDetails('Calibración', ['Confianza', 'Lecturas', 'Exactas'], cal.map((c) => [c.rango, intOr(c.lecturas), pctOr(c.aciertos)]))),
        chartCard('Caracteres que más se confunden', 'type',
          h('p', { className: 'small muted', style: 'margin-bottom:8px', text: 'Sustituciones en lecturas de la longitud correcta (esperado → leído).' }),
          conf.length ? h('ul', { className: 'confusions' }, conf.map((c) => h('li', null,
            h('span', { className: 'plate-text', text: c.esperado }), icon('arrow-right'), h('span', { className: 'plate-text is-err', text: c.leido }),
            h('span', { className: 'confusions__n', text: `${fmt.int(c.veces)} ${c.veces === 1 ? 'vez' : 'veces'}` }))))
            : h('p', { className: 'small muted', text: 'Sin sustituciones registradas.' }))));
  }

  function perPhotoEl(g) {
    const tv = state.testsView;
    const rows = Array.isArray(g.per_photo) ? g.per_photo : [];
    const tbody = h('tbody');
    const foot = h('div', { className: 'table-foot', attrs: { role: 'status', 'aria-live': 'polite' } });
    const counts = { ok: 0, err: 0, missed: 0 };
    rows.forEach((r) => { counts[photoOutcome(r)]++; });
    function fill() {
      const q = normPlate(tv.q);
      const list = rows.filter((r) => (tv.result === 'all' || photoOutcome(r) === tv.result) && (tv.set === 'all' || r.set === tv.set)
        && (!q || r.id.toUpperCase().includes(q) || [...(r.expected || []), ...(r.read || [])].some((x) => normPlate(x).includes(q))));
      tbody.replaceChildren(...(list.length ? list.map((r) => {
        const o = OUTCOME[photoOutcome(r)];
        const exp = (r.expected || []).map((x) => x || '¿?');
        const open = () => { switchView('detector'); setGalleryFilter('all'); $$('#gallery-form input[name="set"]').forEach((i) => { i.checked = i.value === 'all'; }); loadGallery().then(() => selectPhoto(r.id)); };
        return h('tr', { className: 'is-clickable', tabIndex: 0, attrs: { 'aria-label': `${r.id}: esperado ${exp.join(', ')}, leído ${(r.read || []).join(', ') || 'nada'}. Abrir en el detector.` },
          on: { click: open, keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } } },
        h('td', null, h('span', { className: 'mono small', text: r.id })),
        h('td', null, setBadge(r.set, { xs: true })),
        h('td', null, h('div', { className: 'plate-list' }, exp.map((x) => h('span', { className: 'plate-text', text: x })))),
        h('td', null, (r.read || []).length ? h('div', { className: 'plate-list' }, r.read.map((x, k) => (exp[k] && exp[k] !== '¿?' ? diffEl(normPlate(x), normPlate(exp[k]), 'Leído') : h('span', { className: 'plate-text', text: x })))) : h('span', { className: 'muted', text: 'Nada' })),
        h('td', null, h('span', { className: `badge ${o.cls}` }, icon(o.iconName), o.label)),
        h('td', { className: 'num', text: fmt.ms0(r.ms) }));
      }) : [h('tr', null, h('td', { attrs: { colspan: 6 } }, emptyState({ art: 'plate', compact: true, title: 'Sin coincidencias' })))]));
      foot.textContent = `Mostrando ${list.length} de ${rows.length} fotos · ${counts.ok} correctas · ${counts.err} con errores · ${counts.missed} sin detectar`;
    }
    const search = h('input', { type: 'search', placeholder: 'Buscar placa o foto', value: tv.q, attrs: { 'aria-label': 'Buscar por placa o identificador de foto' },
      on: { input: (e) => { tv.q = e.target.value; fill(); } } });
    const resSel = h('select', { attrs: { 'aria-label': 'Filtrar por resultado' }, on: { change: (e) => { tv.result = e.target.value; fill(); } } },
      [['all', 'Todos los resultados'], ['ok', `Correctas (${counts.ok})`], ['err', `Con errores (${counts.err})`], ['missed', `Sin detectar (${counts.missed})`]]
        .map(([v, l]) => h('option', { value: v, text: l, selected: tv.result === v })));
    const setSel = h('select', { attrs: { 'aria-label': 'Filtrar por conjunto' }, on: { change: (e) => { tv.set = e.target.value; fill(); } } },
      [['all', 'Todos los conjuntos'], ['colombia', 'Colombianas'], ['dataset', 'Dataset público']].map(([v, l]) => h('option', { value: v, text: l, selected: tv.set === v })));
    fill();
    return modelSection('Resultado foto por foto', 'table', 'Cada fila es una foto de la galería; haz clic para verla analizada en el detector. Los caracteres leídos mal aparecen resaltados.',
      h('section', { className: 'card table-card' },
        h('div', { className: 'table-toolbar table-toolbar--wrap' }, h('div', { className: 'input-icon' }, icon('search'), search), resSel, setSel),
        h('div', { className: 'table-scroll table-scroll--tall' },
          h('table', { className: 'data-table' },
            h('caption', { className: 'sr-only', text: 'Resultado del modelo en cada foto de la galería' }),
            h('thead', null, h('tr', null, ['Foto', 'Conjunto', 'Esperado', 'Leído', 'Resultado'].map((x) => h('th', { attrs: { scope: 'col' }, text: x })),
              h('th', { className: 'num', attrs: { scope: 'col' }, text: 'Tiempo' }))),
            tbody)),
        foot));
  }

  function autoTestsEl(t) {
    const pct = t.total ? t.passed / t.total : 0;
    return modelSection('Pruebas automatizadas', 'shield', `${fmt.int(t.total)} pruebas (pytest) · ejecutadas el ${fmt.date(t.created_at)} en ${fmt.dec(t.seconds)} s`,
      h('div', { className: 'kpis' },
        kpiEl({ label: 'Superadas', value: `${fmt.int(t.passed)}/${fmt.int(t.total)}`, sub: pct === 1 ? 'Todas las pruebas pasan' : `${fmt.int(t.failed)} fallidas · ${fmt.int(t.skipped)} omitidas`, iconName: 'check', tone: t.failed ? '' : 'ok', ratio: pct }),
        kpiEl({ label: 'Archivos de prueba', value: fmt.int(t.files.length), sub: 'API, modelo y seguridad', iconName: 'layers' }),
        kpiEl({ label: 'Tiempo de ejecución', value: `${fmt.dec(t.seconds)} s`, sub: 'Incluye pruebas que corren el modelo real', iconName: 'clock' })),
      h('div', { className: 'test-files' }, t.files.map((f) => {
        const ok = f.tests.filter((x) => x.status === 'passed').length;
        return h('details', { className: 'card test-file' },
          h('summary', { className: 'test-file__head' },
            h('span', { className: `badge ${ok === f.tests.length ? 'badge--ok' : 'badge--err'}` }, icon(ok === f.tests.length ? 'check' : 'x'), `${ok}/${f.tests.length}`),
            h('span', { className: 'test-file__title' }, h('strong', { text: TEST_FILE_LABEL[f.file] || f.file }), h('span', { className: 'xsmall muted mono', text: f.file })),
            f.description ? h('span', { className: 'small muted test-file__desc', text: f.description }) : null),
          h('ul', { className: 'test-list' }, f.tests.map((x) => h('li', { className: `test-item test-item--${x.status}` },
            icon(x.status === 'passed' ? 'check' : x.status === 'skipped' ? 'info' : 'x'),
            h('span', { className: 'mono small test-item__name', text: x.name }),
            x.doc ? h('span', { className: 'xsmall muted', text: x.doc }) : null,
            h('span', { className: 'xsmall muted test-item__time', text: x.seconds >= 0.01 ? `${fmt.dec(x.seconds)} s` : '' })))));
      })));
  }

  function setupTests() {
    $('#btn-tests-refresh').addEventListener('click', () => loadReport({ force: true }));
  }

  /* ------------------------------------------------------------------ */
  /* Modelo: recorrido paso a paso de una foto real                       */
  /* ------------------------------------------------------------------ */
  const WALK_EXAMPLES = [
    { id: 'co_4', label: 'Placa colombiana (RJV247)' },
    { id: 'co_2', label: 'Placa colombiana con un error (RKW326)' },
    { id: 'ds_230', label: 'Placa extranjera (30V3993)' },
  ];

  function walkthroughEl() {
    const body = h('div', { className: 'walk__body' });
    const select = h('select', { attrs: { 'aria-label': 'Foto de ejemplo' } }, WALK_EXAMPLES.map((x) => h('option', { value: x.id, text: x.label })));
    const btn = h('button', { className: 'btn btn--primary', type: 'button' }, icon('play'), h('span', { text: 'Analizar paso a paso' }));
    body.append(h('p', { className: 'small muted', text: 'Elige una foto y pulsa «Analizar»: se ejecuta el modelo de verdad y se muestra lo que produce cada etapa.' }));
    btn.addEventListener('click', async () => {
      setBusy(btn, true);
      body.replaceChildren(skel('skel-card', { height: '220px' }));
      try {
        const det = await api.detect(select.value);
        state.history.loaded = false; state.stats.data = null;
        body.replaceChildren(walkStepsEl(det));
      } catch (e) {
        body.replaceChildren(h('p', { className: 'small muted', text: `No se pudo analizar: ${e.message}` }));
      } finally {
        setBusy(btn, false);
      }
    });
    return h('section', { className: 'card walk', attrs: { 'aria-label': 'Recorrido de una foto real por el modelo' } },
      h('div', { className: 'card__head' },
        h('h2', { className: 'card__title' }, icon('play'), 'Recorrido de una foto real por el modelo'),
        h('div', { className: 'walk__controls' }, select, btn)),
      h('div', { className: 'card__body' }, body));
  }

  function walkStepsEl(det) {
    const plates = det.plates || [];
    const gts = det.ground_truth || [];
    const match = matchGT(plates, gts);
    let pi = match.pairs.findIndex((x) => x >= 0);
    if (pi < 0) pi = 0;
    const p = plates[pi];
    const gt = p && match.pairs[pi] >= 0 ? gts[match.pairs[pi]] : gts[0];
    const stageMs = (name) => { const st = (det.stages || []).find((x) => x.name === name); return st ? fmt.ms(st.ms) : '—'; };
    const step = (n, title, ms, desc, ...content) => h('li', { className: 'walk-step' },
      h('div', { className: 'walk-step__head' }, h('span', { className: 'walk-step__n', text: String(n) }), h('h3', { text: title }), ms ? h('span', { className: 'badge badge--xs', text: ms }) : null),
      h('p', { className: 'xsmall muted walk-step__desc', text: desc }),
      h('div', { className: 'walk-step__content' }, content));
    if (!p) {
      return h('div', null, emptyState({ art: 'plate', compact: true, title: 'El detector no encontró ninguna placa en esta foto', text: 'Prueba con otro ejemplo.' }));
    }
    const exp = gt && gt.text ? normPlate(gt.text) : null;
    const ok = exp && exp === normPlate(p.text);
    return h('ol', { className: 'walk-steps' },
      step(1, 'Foto de entrada', null, `${det.width}×${det.height} px. El modelo no recibe ninguna otra información.`,
        h('img', { className: 'walk-img', src: det.image_url, alt: 'Foto de entrada' })),
      step(2, 'Detector YOLO', stageMs('yolo_deteccion'), `Busca placas en la foto (a dos escalas) y devuelve una caja por cada una. Confianza de esta caja: ${pctOr(p.detection_confidence)}.`,
        h('img', { className: 'walk-img', src: det.annotated_url, alt: 'Foto con la caja de la placa detectada' })),
      step(3, 'Recorte', stageMs('recorte'), `Se recorta la caja (${p.bbox[2]}×${p.bbox[3]} px) con un pequeño margen y se normaliza a 32×128 px para el lector.`,
        h('img', { className: 'walk-img walk-img--crop', src: p.crop_url, alt: 'Recorte de la placa' })),
      step(4, 'Lector CRNN + CTC', stageMs('crnn_lectura'), 'La red recorre el recorte de izquierda a derecha y predice un carácter (o «nada») por columna; CTC une repetidos y quita los blancos.',
        h('div', { className: 'walk-read' }, h('span', { className: 'xsmall muted', text: 'Lectura sin procesar' }), h('span', { className: 'plate-text walk-raw', text: p.raw_text || p.text })),
        charsEl(p.chars)),
      step(5, 'Formato colombiano', stageMs('formato_colombiano'), p.valid_format
        ? 'La lectura encaja con ABC123 (tres letras y tres números); si hacía falta, se corrigieron confusiones como 0↔O u 8↔B según la posición.'
        : 'La lectura no encaja con el formato colombiano (puede ser una placa de otro país), así que se deja tal cual.',
        plateEl(p.text), h('span', { className: `badge ${p.valid_format ? 'badge--ok' : 'badge--warn'}` }, icon(p.valid_format ? 'check' : 'alert'), p.valid_format ? 'Formato colombiano' : 'Otro formato')),
      step(6, 'Comparación con el valor esperado', fmt.ms(det.processing_ms) + ' en total', exp ? 'Se compara con el texto correcto conocido para medir el acierto.' : 'Esta placa no tiene texto esperado legible; solo se evalúa si se localizó.',
        exp ? h('div', { className: 'walk-compare' },
          h('div', null, h('span', { className: 'xsmall muted', text: 'Esperado' }), h('span', { className: 'plate-text', text: exp })),
          h('div', null, h('span', { className: 'xsmall muted', text: 'Leído' }), diffEl(normPlate(p.text), exp, 'Leído')),
          h('span', { className: `badge ${ok ? 'badge--ok' : 'badge--err'}` }, icon(ok ? 'check' : 'x'), ok ? 'Lectura exacta' : `${fmt.pct(1 - editDistance(normPlate(p.text), exp) / exp.length)} de caracteres correctos`))
          : h('span', { className: 'badge badge--ok' }, icon('check'), 'Placa localizada')));
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
        case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8':
          switchView(VIEWS[+key - 1]); e.preventDefault(); break;
        case 'g': case 'G': e.preventDefault(); randomPhoto(); break;
        case 'd': case 'D':
          e.preventDefault();
          if (state.view === 'upload') uploadDetect();
          else if (state.view === 'detector' && state.selectedId) detectPhoto(state.selectedId, { force: true });
          break;
        case 'ArrowLeft': case 'ArrowRight':
          if (inRadio || inTabs || state.view !== 'detector') return;
          e.preventDefault(); movePhoto(key === 'ArrowRight' ? 1 : -1); break;
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
  async function init() {
    try {
      const st = await api.authStatus();
      if (!st || !st.user) { goToLogin(); return; }
      state.user = st.user;
    } catch (e) {
      // sin backend: se muestra la app con su estado «sin conexión»
    }
    document.documentElement.classList.remove('auth-pending');
    renderUserMenu();
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
    setupModel();
    setupTests();
    setupShortcuts();
    const initial = (location.hash || '').replace(/^#\/?/, '');
    switchView(VIEWS.includes(initial) ? initial : 'inicio');
    checkHealth();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && state.health.ok === false) checkHealth(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
