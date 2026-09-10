/* Componentes de interfaz reutilizables: modales, confirmaciones, avisos y teclado numérico. */
'use strict';

/* ---------- Cortina de carga ---------- */

/*
 * La primera lectura de la hoja tarda unos segundos —y traer un histórico entero, minutos—, y hasta
 * que termina la pantalla de acceso está ahí con la lista de usuarios vacía o antigua: parece que la
 * app ya ha cargado y no es verdad. Esta cortina lo tapa, gira el logo del club y va diciendo por
 * dónde va. De paso impide tocar la pantalla mientras se aplica el catálogo, que es justo el momento
 * en el que no conviene empezar una venta.
 *
 * Los mensajes de arriba son de relleno y van cambiando: sirven para que se vea que la cosa sigue
 * viva. El de abajo es el de verdad («Turnos: 10 de 42»), y lo pone quien esté trabajando.
 */
const LOADER_MSGS = [
  'Preguntando a la hoja de cálculo…',
  'Contando las cañas de ayer…',
  'Repasando quién pagó la última ronda…',
  'Buscando las patatas en el almacén…',
  'Cuadrando la caja con los dedos…',
  'Sacando brillo a los vasos…',
  'Despertando a Google, que estaba de siesta…',
  'Ordenando el botellero por altura…',
  'Comprobando que todavía queda hielo…',
  'Poniendo el mantel bueno…',
  'Apuntando las invitaciones en la libreta…',
  'Afinando el grifo de la cerveza…',
  'Haciendo sitio en la nevera…',
  'Preguntando en la barra si falta algo…',
  'Buscando el ticket que se llevó el aire…'
];

const loader = { depth: 0, step: '', desde: 0, revelar: null, rota: null, vigila: null, cola: [] };

/* Los mensajes salen barajados y no se repite ninguno hasta que se hayan visto todos. */
function loaderMsg() {
  if (!loader.cola.length) {
    loader.cola = LOADER_MSGS.slice();
    for (let i = loader.cola.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [loader.cola[i], loader.cola[j]] = [loader.cola[j], loader.cola[i]];
    }
  }
  return loader.cola.pop();
}

/*
 * Se puede anidar (el arranque abre la cortina y la importación del histórico la abre otra vez):
 * se cuenta cuántas veces se ha abierto y solo se quita con el último hideLoader.
 */
function showLoader(step = '') {
  loader.depth++;
  loader.step = step;
  loaderPaint();
  if (loader.depth > 1 || loader.revelar || loaderVisible()) return;
  // Con un poco de retraso: una hoja pequeña se lee en medio segundo y ahí la cortina solo daría un parpadeo.
  loader.revelar = setTimeout(() => {
    loader.revelar = null;
    const el = $('#loader');
    if (!el) return;
    const msg = $('#loader-msg');
    if (msg) msg.textContent = loaderMsg();
    loaderPaint();
    el.classList.remove('hidden');
    loader.desde = Date.now();
    loader.rota = setInterval(() => { const m = $('#loader-msg'); if (m) m.textContent = loaderMsg(); }, 2600);
    loaderWatch();
  }, 400);
}

/** El texto de verdad. Si la cortina no está puesta no hace nada, así que se puede llamar siempre. */
function loaderStep(step) {
  if (!loader.depth) return;
  loader.step = step;
  loaderPaint();
  loaderWatch();
}

function hideLoader() {
  loader.depth = Math.max(0, loader.depth - 1);
  if (loader.depth) return;
  clearTimeout(loader.revelar); loader.revelar = null;
  clearInterval(loader.rota); loader.rota = null;
  clearTimeout(loader.vigila); loader.vigila = null;
  const el = $('#loader');
  if (!el || el.classList.contains('hidden')) return;
  // Ya puesta, se queda un momento: quitarla a los 50 ms sería otro parpadeo.
  const falta = 600 - (Date.now() - loader.desde);
  if (falta > 0) setTimeout(() => { if (!loader.depth) el.classList.add('hidden'); }, falta);
  else el.classList.add('hidden');
}

function loaderVisible() { const el = $('#loader'); return !!el && !el.classList.contains('hidden'); }

function loaderPaint() {
  const el = $('#loader-step');
  if (el) el.textContent = loader.step;
}

/*
 * Red de seguridad: si pasa un minuto sin que nadie diga por dónde va, se quita la cortina. Un fallo
 * raro (o una petición que se queda colgada pese a su propio tiempo de espera) no puede dejar la
 * tablet bloqueada en mitad del turno. El trabajo sigue por detrás; solo se deja de tapar.
 */
function loaderWatch() {
  clearTimeout(loader.vigila);
  loader.vigila = setTimeout(() => {
    if (!loader.depth) return;
    loader.depth = 0;
    hideLoader();
    toast('La hoja está tardando más de lo normal. Sigue intentándolo por detrás; puedes usar el TPV.', 'warn', 7000);
  }, 60000);
}

/* ---------- Modales ---------- */

function openModal(html, opts = {}) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `<div class="modal ${opts.wide ? 'modal-wide' : ''} ${opts.cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
  if (opts.onClose) back._onClose = opts.onClose;
  $('#modals').appendChild(back);
  return back;
}

function closeModal(back) {
  const el = back || $('#modals').lastElementChild;
  if (!el) return;
  if (el._onClose) el._onClose();
  el.remove();
}

function closeAllModals() { $('#modals').innerHTML = ''; }

function confirmDialog({ title, text = '', ok = 'Aceptar', cancel = 'Cancelar', danger = false }) {
  return new Promise((res) => {
    const m = openModal(`
      <h3 class="modal-title">${esc(title)}</h3>
      ${text ? `<p class="modal-text">${text}</p>` : ''}
      <div class="row row-end">
        <button class="btn" data-action="m-cancel">${esc(cancel)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="m-ok">${esc(ok)}</button>
      </div>`);
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      if (b.dataset.action === 'm-ok') { closeModal(m); res(true); }
      else if (b.dataset.action === 'm-cancel') { closeModal(m); res(false); }
    });
  });
}

function alertDialog(title, text = '') {
  return new Promise((res) => {
    const m = openModal(`
      <h3 class="modal-title">${esc(title)}</h3>
      ${text ? `<p class="modal-text">${text}</p>` : ''}
      <div class="row row-end"><button class="btn btn-primary" data-action="m-ok">Entendido</button></div>`);
    m.addEventListener('click', (e) => { if (e.target.closest('[data-action="m-ok"]')) { closeModal(m); res(); } });
  });
}

/* ---------- Avisos ---------- */

function toast(msg, type = 'info', ms = 2800) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 320); }, ms);
}

/* ---------- Teclado numérico ---------- */

function keypadHTML(mode) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', mode === 'money' ? ',' : '', '0', '⌫'];
  return `<div class="keypad keypad-${mode}">${keys.map((k) => k === ''
    ? '<span></span>'
    : `<button type="button" class="key ${k === '⌫' ? 'key-del' : ''} ${k === ',' ? 'key-comma' : ''}" data-key="${k}" aria-label="${k === '⌫' ? 'Borrar' : k}">${k}</button>`).join('')}</div>`;
}

/**
 * Monta un teclado dentro de `container`.
 * mode: 'money' (con coma decimal), 'pin' (4 dígitos) o 'int' (entero).
 */
function mountKeypad(container, { mode = 'money', value = '', onChange, maxLen } = {}) {
  container.innerHTML = keypadHTML(mode);
  const kp = container.querySelector('.keypad');
  kp._state = { mode, value, onChange, maxLen: maxLen || (mode === 'pin' ? 4 : 6) };
  if (onChange) onChange(value);
  return kp;
}

function keypadSet(kp, value) {
  if (!kp || !kp._state) return;
  kp._state.value = value;
  if (kp._state.onChange) kp._state.onChange(value);
}

function keypadPress(btn) {
  const kp = btn.closest('.keypad');
  const st = kp && kp._state;
  if (!st) return;
  const k = btn.dataset.key;
  let v = st.value;
  if (k === '⌫') {
    v = v.slice(0, -1);
  } else if (k === ',') {
    if (st.mode === 'money' && !v.includes(',')) v = (v || '0') + ',';
  } else if (st.mode === 'money') {
    if (v.includes(',')) {
      if (v.split(',')[1].length >= 2) return;
      v += k;
    } else {
      if (v.length >= 6) return;
      v = v === '0' ? k : v + k;
    }
  } else {
    if (v.length >= st.maxLen) return;
    if (st.mode === 'int' && v === '0') v = '';
    v += k;
  }
  if (v === st.value) return;
  st.value = v;
  vibrate(8);
  if (st.onChange) st.onChange(v);
}

/* ---------- Pedir PIN ---------- */

function askPin({ title, subtitle = '', validate, errorText = 'PIN incorrecto' }) {
  return new Promise((res) => {
    const m = openModal(`
      <div class="pin-modal">
        <h3 class="modal-title">${esc(title)}</h3>
        ${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ''}
        <div class="pin-dots">${'<span></span>'.repeat(4)}</div>
        <div class="pin-error">&nbsp;</div>
        <div class="pin-keypad"></div>
        <button type="button" class="btn btn-ghost" data-action="m-cancel">Cancelar</button>
      </div>`, { cls: 'modal-pin' });
    const dots = $$('.pin-dots span', m);
    const errorEl = $('.pin-error', m);
    let checking = false;
    const kp = mountKeypad($('.pin-keypad', m), {
      mode: 'pin', maxLen: 4,
      onChange: (v) => {
        dots.forEach((d, i) => d.classList.toggle('on', i < v.length));
        if (v.length === 4 && !checking) {
          checking = true;
          setTimeout(() => {
            checking = false;
            if (validate(v)) { closeModal(m); res(v); return; }
            errorEl.textContent = errorText;
            const pd = $('.pin-dots', m);
            pd.classList.add('shake');
            setTimeout(() => pd.classList.remove('shake'), 450);
            vibrate([40, 50, 40]);
            keypadSet(kp, '');
          }, 120);
        } else if (v.length < 4) {
          errorEl.textContent = ' ';
        }
      }
    });
    m.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="m-cancel"]')) { closeModal(m); res(null); }
    });
  });
}

/* ---------- Pedir importe / número ---------- */

function askAmount({ title, subtitle = '', value = null, mode = 'money', okLabel = 'Aceptar', suggestions = [], allowZero = true }) {
  return new Promise((res) => {
    const m = openModal(`
      <div class="amount-modal">
        <h3 class="modal-title">${esc(title)}</h3>
        ${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ''}
        <div class="amount-display"></div>
        ${suggestions.length ? `<div class="quick">${suggestions.map((s) => `<button type="button" class="btn quick-btn" data-action="m-suggest" data-value="${esc(s.value)}">${esc(s.label)}</button>`).join('')}</div>` : ''}
        <div class="amount-keypad"></div>
        <div class="row row-end">
          <button type="button" class="btn" data-action="m-cancel">Cancelar</button>
          <button type="button" class="btn btn-primary" data-action="m-ok">${esc(okLabel)}</button>
        </div>
      </div>`);
    const display = $('.amount-display', m);
    const initial = value == null ? '' : (mode === 'money' ? centsToInput(value) : String(value));
    const kp = mountKeypad($('.amount-keypad', m), {
      mode, value: initial,
      onChange: (v) => {
        display.textContent = mode === 'money' ? `${v || '0'} €` : (v || '0');
        display.classList.toggle('empty', !v);
      }
    });
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      if (b.dataset.action === 'm-cancel') { closeModal(m); res(null); }
      else if (b.dataset.action === 'm-suggest') { keypadSet(kp, b.dataset.value); }
      else if (b.dataset.action === 'm-ok') {
        const v = kp._state.value;
        const n = mode === 'money' ? parseAmountStr(v) : parseInt(v || '0', 10);
        if (!allowZero && !n) { toast('Introduce un importe', 'warn'); return; }
        closeModal(m); res(n);
      }
    });
  });
}
