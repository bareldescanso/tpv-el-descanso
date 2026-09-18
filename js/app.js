/* TPV El Descanso — lógica principal: pantallas, ticket, cobro, cierre e histórico. */
'use strict';

const APP_VERSION = '1.5.6';
const DENOMS = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

/* ---------- Estado ---------- */
let config = null;            // configuración (localStorage)
let turn = null;              // turno abierto (localStorage) o null
let session = { user: null }; // quién está usando el TPV ahora
let ticket = { lines: [] };   // ticket en curso (sin cobrar)
let currentCat = null;
let openKeypad = null;
let pay = null, payModal = null, payKeypad = null;
let closing = null;           // estado del arqueo
let reportCtx = null;         // informe que se está mostrando
let historyCache = [];
let historyReturnView = 'login';
let adminReturnView = 'login';
let wakeLock = null;

/* ---------- Configuración ---------- */

function loadConfig() {
  let c = lsLoad(LS_CONFIG, null);
  if (!c) { c = clone(DEFAULT_CONFIG); lsSave(LS_CONFIG, c); }
  c.club = Object.assign({ name: 'El Descanso', subtitle: '', logo: null }, c.club || {});
  c.settings = Object.assign({ keepAwake: true, vibrate: true }, c.settings || {});
  c.users = c.users || []; c.categories = c.categories || []; c.products = c.products || [];
  c.ticketCounter = c.ticketCounter || 0;
  if (c.lastClosingCash === undefined) c.lastClosingCash = null;
  if (!c.adminPin) c.adminPin = '1234';
  c.sync = Object.assign({ enabled: false, url: '', token: '', autoDownloadJson: true, autoDownloadCsv: false }, c.sync || {});
  c.products.forEach((p) => { if (p.stock === undefined) p.stock = null; if (p.minStock === undefined) p.minStock = null; });
  config = c;
}
const saveConfig = () => lsSave(LS_CONFIG, config);
const saveTurn = () => (turn ? lsSave(LS_TURN, turn) : localStorage.removeItem(LS_TURN));

const activeUsers = () => config.users.filter((u) => u.active !== false);
const userById = (id) => config.users.find((u) => u.id === id);
const catById = (id) => config.categories.find((c) => c.id === id);
const productById = (id) => config.products.find((p) => p.id === id);
const sortedCategories = () => config.categories.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
const productsOf = (catId, includeInactive = false) => config.products
  .filter((p) => p.categoryId === catId && (includeInactive || p.active !== false))
  .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));

function applyBranding() {
  const logo = config.club.logo || 'icons/logo.png';
  $$('.brand-logo').forEach((img) => { if (img.getAttribute('src') !== logo) img.src = logo; });
  $$('.brand-name').forEach((el) => { el.textContent = config.club.name; });
  document.title = `TPV ${config.club.name}`;
}

/* ---------- Navegación entre pantallas ---------- */

const RENDERERS = {
  login: renderLogin, open: renderOpen, sales: renderSales, close: renderClose,
  report: renderReportView, history: renderHistory, admin: () => renderAdmin()
};

function showView(name) {
  closeAllModals();
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${name}`));
  document.body.dataset.view = name;
  if (RENDERERS[name]) RENDERERS[name]();
}

/* ---------- Login ---------- */

function renderLogin() {
  applyBranding();
  $('#login-date').textContent = fmtDateLong(Date.now());
  const users = activeUsers();
  $('#login-users').innerHTML = users.length ? users.map((u) => `
    <button class="user-card" data-action="login-user" data-id="${u.id}">
      <span class="avatar" style="background:${avatarColor(u.name)}">${esc(initials(u.name))}</span>
      <span class="user-name">${esc(u.name)}</span>
    </button>`).join('')
    : '<p class="muted">No hay usuarios activos. Entra en Administración para crearlos.</p>';
  const banner = $('#login-turn-banner');
  if (turn) {
    const valid = turn.tickets.filter((t) => !t.voided);
    banner.className = 'banner banner-open';
    banner.innerHTML = `<strong>Turno abierto</strong> por ${esc(turn.openedByName)} desde las ${fmtTime(turn.openedAt)} (${fmtDate(turn.openedAt)}) · ${valid.length} tickets · ${eur(sum(valid, (t) => t.total))}<br><span class="muted">Identifícate para continuar con este turno.</span>`;
  } else {
    banner.className = 'banner hidden';
    banner.innerHTML = '';
  }
}

ACTIONS['login-user'] = async (btn) => {
  const u = userById(btn.dataset.id);
  if (!u) return;
  if (u.pin) {
    const pin = await askPin({ title: `Hola, ${u.name}`, subtitle: 'Introduce tu PIN', validate: (v) => v === u.pin });
    if (!pin) return;
  }
  session.user = u;
  requestWakeLock();
  if (turn) {
    showView('sales');
    if (turn.openedBy !== u.id) toast(`Continúas el turno abierto por ${turn.openedByName}`);
  } else {
    showView('open');
  }
};

ACTIONS['login-history'] = async () => {
  const users = activeUsers().filter((u) => u.pin);
  const pin = await askPin({
    title: 'Histórico de turnos', subtitle: 'Introduce tu PIN o el de administrador',
    validate: (v) => v === config.adminPin || users.some((u) => u.pin === v)
  });
  if (!pin) return;
  historyReturnView = 'login';
  showView('history');
};

ACTIONS['login-admin'] = async () => {
  const pin = await askPin({ title: 'Administración', subtitle: 'PIN de administrador', validate: (v) => v === config.adminPin });
  if (!pin) return;
  adminReturnView = 'login';
  showView('admin');
};

/* ---------- Apertura de turno ---------- */

function renderOpen() {
  $('#open-user').textContent = `${session.user.name} · ${fmtDateLong(Date.now())}`;
  const display = $('#open-amount');
  const last = config.lastClosingCash;
  openKeypad = mountKeypad($('#open-keypad'), {
    mode: 'money',
    value: last != null ? centsToInput(last) : '',
    onChange: (v) => { display.textContent = `${v || '0'} €`; }
  });
  $('#open-suggest').innerHTML = last != null
    ? `<button class="btn quick-btn" data-action="open-suggest" data-value="${centsToInput(last)}">Usar ${eur(last)} <small>dejado en el último cierre</small></button>
       <button class="btn quick-btn" data-action="open-suggest" data-value="">Borrar</button>`
    : '';
}

ACTIONS['open-suggest'] = (btn) => keypadSet(openKeypad, btn.dataset.value);
ACTIONS['open-cancel'] = () => { session.user = null; showView('login'); };
ACTIONS['open-confirm'] = () => {
  const cents = parseAmountStr(openKeypad._state.value);
  turn = {
    id: `T${fileStamp()}-${Math.random().toString(36).slice(2, 6)}`,
    openedAt: Date.now(),
    openedBy: session.user.id,
    openedByName: session.user.name,
    openingCash: cents,
    tickets: []
  };
  saveTurn();
  ticket = { lines: [] };
  showView('sales');
  toast(`Turno abierto con ${eur(cents)} en caja`, 'success');
};

/* ---------- Ventas ---------- */

function renderSales() {
  applyBranding();
  const cats = sortedCategories();
  if (!currentCat || !cats.find((c) => c.id === currentCat)) currentCat = cats[0] ? cats[0].id : null;
  renderCatTabs();
  renderProducts();
  renderTicket();
  renderTurnInfo();
  updateSyncBadge();
}

function renderCatTabs() {
  $('#cat-tabs').innerHTML = sortedCategories().map((c) => `
    <button class="cat-tab ${c.id === currentCat ? 'active' : ''}" style="--cat:${c.color || '#64748b'}" data-cat="${c.id}">
      <span class="cat-emoji">${esc(c.emoji || '')}</span><span>${esc(c.name)}</span>
    </button>`).join('');
}

function renderProducts() {
  const cat = catById(currentCat);
  const prods = currentCat ? productsOf(currentCat) : [];
  $('#product-grid').innerHTML = prods.length ? prods.map((p) => `
    <button class="product" style="--cat:${p.color || (cat && cat.color) || '#64748b'}" data-product="${p.id}">
      <span class="p-top"><span class="p-emoji">${esc(p.emoji || (cat && cat.emoji) || '')}</span>${stockBadge(p)}</span>
      <span class="p-name">${esc(p.name)}</span>
      <span class="p-price">${eur(p.price)}</span>
    </button>`).join('')
    : '<p class="muted empty">No hay productos visibles en esta categoría.</p>';
}

/* ---------- Inventario (control de stock opcional por producto) ---------- */

function stockLevel(p) {
  if (!p || p.stock == null) return null;
  if (p.stock <= 0) return 'out';
  if (p.minStock != null && p.stock <= p.minStock) return 'low';
  return 'ok';
}

function stockBadge(p) {
  const lvl = stockLevel(p);
  return lvl ? `<span class="p-stock ${lvl}" title="Unidades en stock">${p.stock}</span>` : '';
}

/** Suma o resta al stock las líneas de un ticket (sign = -1 venta, +1 anulación). */
function applyStockDelta(lines, sign) {
  let changed = false;
  lines.forEach((l) => {
    const p = productById(l.productId);
    if (p && p.stock != null) { p.stock += sign * l.qty; changed = true; }
  });
  return changed;
}

function lowStockProducts() {
  return config.products
    .filter((p) => p.stock != null && stockLevel(p) !== 'ok')
    .map((p) => ({ name: p.name, emoji: p.emoji || '', stock: p.stock, minStock: p.minStock, level: stockLevel(p) }))
    .sort((a, b) => a.stock - b.stock);
}

function newStockMove({ product, type, qty, turnId = null, note = '' }) {
  return {
    id: uid('m'), ts: Date.now(), turnId, productId: product.id, name: product.name,
    type, qty, stockAfter: product.stock,
    userId: session.user ? session.user.id : null, userName: session.user ? session.user.name : '', note
  };
}

/** Movimientos resumen de un cierre: una fila por producto con control de stock vendido en el turno. */
function buildClosingStockMoves(closedTurn, rep) {
  const moves = [];
  rep.byProduct.forEach((row) => {
    const p = row.productId && productById(row.productId);
    if (!p || p.stock == null) return;
    moves.push({
      id: uid('m'), ts: closedTurn.closedAt, turnId: closedTurn.id, productId: p.id, name: p.name,
      type: 'venta', qty: -row.units, stockAfter: p.stock,
      userId: closedTurn.closedBy, userName: closedTurn.closedByName,
      note: `Turno ${fmtDate(closedTurn.openedAt)}: ${row.units - row.invitations} vendidas, ${row.invitations} invitadas`
    });
  });
  return moves;
}

/** Copia automática del cierre en la carpeta Descargas (según ajustes). */
function autoDownloadClosing(closedTurn, tickets) {
  const cfg = config.sync || {};
  try {
    if (cfg.autoDownloadJson !== false) {
      downloadFile(`cierre_${fileStamp(closedTurn.openedAt)}.json`, JSON.stringify({
        app: 'tpv-el-descanso', tipo: 'cierre', exportadoEn: new Date().toISOString(), club: config.club.name,
        turno: closedTurn, tickets
      }, null, 1), 'application/json');
    }
    if (cfg.autoDownloadCsv) {
      setTimeout(() => downloadFile(`tickets_${fileStamp(closedTurn.openedAt)}.csv`, ticketsCSV(tickets, { [closedTurn.id]: closedTurn }), 'text/csv'), 800);
    }
  } catch (e) { console.error(e); }
}

function selectCategory(id) {
  currentCat = id;
  renderCatTabs();
  renderProducts();
  $('#product-grid').scrollTop = 0;
}

function renderTurnInfo() {
  if (!turn) return;
  const valid = turn.tickets.filter((t) => !t.voided);
  $('#turn-info').innerHTML = `<strong>${esc(session.user ? session.user.name : '')}</strong> · turno desde las ${fmtTime(turn.openedAt)}`;
  $('#turn-stats').textContent = `${valid.length} tickets · ${eur(sum(valid, (t) => t.total))}`;
  $('#tickets-count').textContent = turn.tickets.length;
}

const ticketTotal = () => sum(ticket.lines, (l) => (l.invitation ? 0 : l.unitPrice * l.qty));

function addProduct(id) {
  const p = productById(id);
  if (!p) return;
  const cat = catById(p.categoryId);
  const existing = ticket.lines.find((l) => l.productId === id && !l.invitation);
  if (existing) existing.qty += 1;
  else ticket.lines.push({
    productId: id, name: p.name, emoji: p.emoji || (cat && cat.emoji) || '',
    categoryId: p.categoryId, categoryName: cat ? cat.name : '',
    unitPrice: p.price, qty: 1, invitation: false
  });
  vibrate(10);
  renderTicket(true);
  flashLine(existing ? ticket.lines.indexOf(existing) : ticket.lines.length - 1);
}

function flashLine(i) {
  const el = $$('#ticket-lines .line')[i];
  if (!el) return;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 350);
}

function renderTicket(scrollToEnd = false) {
  const el = $('#ticket-lines');
  el.innerHTML = ticket.lines.length ? ticket.lines.map((l, i) => `
    <div class="line ${l.invitation ? 'inv' : ''}">
      <div class="line-main">
        <span class="line-name">${esc(l.emoji)} ${esc(l.name)}${l.invitation ? ' <em>Invitación</em>' : ''}</span>
        <span class="line-total">${eur(l.invitation ? 0 : l.unitPrice * l.qty)}</span>
      </div>
      <div class="line-ctrl">
        <div class="qty">
          <button class="qbtn" data-action="line-dec" data-i="${i}" aria-label="Quitar uno">−</button>
          <span class="qnum">${l.qty}</span>
          <button class="qbtn" data-action="line-inc" data-i="${i}" aria-label="Añadir uno">+</button>
        </div>
        <span class="line-unit muted">${eur(l.unitPrice)}/ud</span>
        <button class="ibtn ${l.invitation ? 'on' : ''}" data-action="line-inv" data-i="${i}" title="Marcar como invitación">🎁</button>
        <button class="ibtn del" data-action="line-del" data-i="${i}" title="Quitar línea">✕</button>
      </div>
    </div>`).join('')
    : '<div class="ticket-empty"><span>🧾</span>Toca un producto para añadirlo al ticket</div>';
  $('#ticket-total').textContent = eur(ticketTotal());
  $('#ticket-count').textContent = `${sum(ticket.lines, (l) => l.qty)} art.`;
  $('#btn-pay').disabled = !ticket.lines.length;
  if (scrollToEnd) el.scrollTop = el.scrollHeight;
}

ACTIONS['line-inc'] = (b) => { ticket.lines[+b.dataset.i].qty += 1; vibrate(8); renderTicket(); };
ACTIONS['line-dec'] = (b) => {
  const l = ticket.lines[+b.dataset.i];
  if (l.qty > 1) l.qty -= 1; else ticket.lines.splice(+b.dataset.i, 1);
  vibrate(8); renderTicket();
};
ACTIONS['line-del'] = (b) => { ticket.lines.splice(+b.dataset.i, 1); vibrate(8); renderTicket(); };
ACTIONS['line-inv'] = (b) => {
  const l = ticket.lines[+b.dataset.i];
  l.invitation = !l.invitation;
  vibrate(8); renderTicket();
  toast(l.invitation ? 'Línea marcada como invitación (0,00 €)' : 'Invitación quitada');
};
ACTIONS['ticket-clear'] = async () => {
  if (!ticket.lines.length) return;
  if (await confirmDialog({ title: '¿Vaciar el ticket?', text: 'Se quitarán todas las líneas del ticket actual.', ok: 'Vaciar', danger: true })) {
    ticket = { lines: [] };
    renderTicket();
  }
};

ACTIONS['lock'] = () => { session.user = null; showView('login'); };
ACTIONS['sales-admin'] = async () => {
  const pin = await askPin({ title: 'Administración', subtitle: 'PIN de administrador', validate: (v) => v === config.adminPin });
  if (!pin) return;
  adminReturnView = 'sales';
  showView('admin');
};
ACTIONS['sales-history'] = () => { historyReturnView = 'sales'; showView('history'); };

/* ---------- Cobro ---------- */

function quickAmounts(total) {
  const set = new Set();
  if (total > 0) set.add(total);
  const r1 = Math.ceil(total / 100) * 100;
  if (r1 > total) set.add(r1);
  [500, 1000, 2000, 5000].forEach((n) => { const c = Math.ceil(total / n) * n; if (c > total) set.add(c); });
  return Array.from(set).sort((a, b) => a - b).slice(0, 5);
}

ACTIONS['pay'] = () => {
  if (!ticket.lines.length) return;
  const total = ticketTotal();
  pay = { total, paid: 0, value: '' };
  payModal = openModal(`
    <div class="pay">
      <div class="pay-left">
        <div class="pay-total"><span>Total a cobrar</span><strong>${eur(total)}</strong></div>
        <div class="pay-given"><span>Entregado</span><strong id="pay-given">0 €</strong></div>
        <div id="pay-change" class="pay-change"></div>
        <div class="quick">${quickAmounts(total).map((c) => `<button class="btn quick-btn" data-action="pay-quick" data-value="${centsToInput(c)}">${c === total ? 'Exacto ' : ''}${eur(c)}</button>`).join('')}</div>
      </div>
      <div class="pay-right">
        <div id="pay-keypad"></div>
        <div class="row">
          <button class="btn" data-action="m-close">Cancelar</button>
          <button class="btn btn-primary btn-lg grow" id="pay-confirm" data-action="pay-confirm">Confirmar cobro</button>
        </div>
      </div>
    </div>`, { wide: true, cls: 'modal-pay', onClose: () => { payModal = null; } });
  payKeypad = mountKeypad($('#pay-keypad', payModal), {
    mode: 'money',
    onChange: (v) => { pay.value = v; pay.paid = parseAmountStr(v); updatePay(); }
  });
};

function updatePay() {
  if (!payModal) return;
  $('#pay-given', payModal).textContent = pay.value ? `${pay.value} €` : '0 €';
  const box = $('#pay-change', payModal);
  const btn = $('#pay-confirm', payModal);
  const diff = pay.paid - pay.total;
  if (!pay.value) {
    box.className = 'pay-change';
    box.innerHTML = pay.total === 0
      ? '<span>Ticket sin importe (todo invitaciones)</span>'
      : '<span>Introduce el importe entregado</span>';
    btn.disabled = pay.total !== 0;
  } else if (diff < 0) {
    box.className = 'pay-change neg';
    box.innerHTML = `<span>Faltan</span><strong>${eur(-diff)}</strong>`;
    btn.disabled = true;
  } else {
    box.className = 'pay-change ok';
    box.innerHTML = `<span>Cambio a devolver</span><strong>${eur(diff)}</strong>`;
    btn.disabled = false;
  }
}

ACTIONS['pay-quick'] = (b) => keypadSet(payKeypad, b.dataset.value);

ACTIONS['pay-confirm'] = () => {
  if (!pay || !turn) return;
  if (pay.paid < pay.total) return;
  const change = pay.paid - pay.total;
  config.ticketCounter = (config.ticketCounter || 0) + 1;
  const tk = {
    id: uid('k'), n: config.ticketCounter, turnId: turn.id, ts: Date.now(),
    userId: session.user.id, userName: session.user.name,
    lines: ticket.lines.map((l) => ({ ...l })),
    total: pay.total, paid: pay.paid, change, voided: false
  };
  turn.tickets.push(tk);
  saveTurn();
  applyStockDelta(tk.lines, -1);
  saveConfig();
  ticket = { lines: [] };
  closeModal(payModal);
  renderTicket();
  renderProducts();
  renderTurnInfo();
  vibrate([20, 30, 20]);
  showChangeOverlay(tk);
};

function showChangeOverlay(tk) {
  const el = document.createElement('div');
  el.className = `change-overlay ${tk.change === 0 ? 'exact' : ''}`;
  el.dataset.action = 'change-done';
  el.innerHTML = `
    <div class="change-inner">
      <div class="change-label">${tk.change === 0 ? 'Importe exacto · sin cambio' : 'Cambio a devolver'}</div>
      <div class="change-amount">${eur(tk.change)}</div>
      <div class="change-detail">Ticket #${tk.n} · Total ${eur(tk.total)} · Entregado ${eur(tk.paid)}</div>
      <button class="btn btn-lg btn-light" data-action="change-done">Siguiente cliente</button>
    </div>`;
  document.body.appendChild(el);
}
ACTIONS['change-done'] = (b) => { const o = b.closest('.change-overlay'); if (o) o.remove(); };

/* ---------- Tickets del turno / anulaciones ---------- */

ACTIONS['tickets-list'] = () => {
  const rows = turn.tickets.slice().reverse().map((t) => `
    <div class="tk-row ${t.voided ? 'voided' : ''}">
      <div class="tk-main">
        <div><strong>#${t.n}</strong> <span class="muted">${fmtTime(t.ts)} · ${esc(t.userName)}</span></div>
        <div class="tk-lines">${t.lines.map((l) => `${l.qty}× ${esc(l.name)}${l.invitation ? ' (inv.)' : ''}`).join(', ')}</div>
      </div>
      <div class="tk-total">${eur(t.total)}<small class="muted">entregado ${eur(t.paid)}</small></div>
      ${t.voided
        ? `<span class="badge badge-bad">Anulado<br><small>${esc(t.voidedByName || '')} ${t.voidedAt ? fmtTime(t.voidedAt) : ''}</small></span>`
        : `<button class="btn btn-sm btn-outline-danger" data-action="void-ticket" data-id="${t.id}">Anular</button>`}
    </div>`).join('');
  openModal(`
    <h3 class="modal-title">Tickets del turno <span class="muted">(${turn.tickets.length})</span></h3>
    <div class="tk-list">${rows || '<p class="muted">Todavía no hay tickets en este turno.</p>'}</div>
    <div class="row row-end"><button class="btn" data-action="m-close">Cerrar</button></div>`, { wide: true, cls: 'modal-tickets' });
};

ACTIONS['void-ticket'] = async (b) => {
  const t = turn.tickets.find((x) => x.id === b.dataset.id);
  if (!t || t.voided) return;
  const ok = await confirmDialog({
    title: `¿Anular el ticket #${t.n}?`,
    text: `Importe ${eur(t.total)}. El ticket quedará marcado como anulado y no contará en la recaudación del turno.`,
    ok: 'Anular ticket', danger: true
  });
  if (!ok) return;
  t.voided = true; t.voidedAt = Date.now(); t.voidedBy = session.user.id; t.voidedByName = session.user.name;
  saveTurn();
  if (applyStockDelta(t.lines, +1)) { saveConfig(); renderProducts(); }
  renderTurnInfo();
  closeAllModals();
  ACTIONS['tickets-list']();
  toast(`Ticket #${t.n} anulado`, 'warn');
};

/* ---------- Cierre de turno: arqueo ---------- */

ACTIONS['close-start'] = () => {
  if (ticket.lines.length) { toast('Hay un ticket sin cobrar. Cóbralo o vacíalo antes de cerrar el turno.', 'warn', 4000); return; }
  closing = { counts: {}, manual: null, useManual: false };
  showView('close');
};

const salesTotalOfTurn = () => sum(turn.tickets.filter((t) => !t.voided), (t) => t.total);
const countedTotal = () => (closing.useManual ? (closing.manual || 0) : sum(DENOMS, (d) => d * (closing.counts[d] || 0)));

function renderClose() {
  const salesTotal = salesTotalOfTurn();
  const expected = turn.openingCash + salesTotal;
  $('#close-summary').innerHTML = `
    <div class="kpi"><span>Saldo inicial</span><strong>${eur(turn.openingCash)}</strong></div>
    <div class="kpi"><span>Recaudado</span><strong>${eur(salesTotal)}</strong><small>${turn.tickets.filter((t) => !t.voided).length} tickets</small></div>
    <div class="kpi kpi-primary"><span>Efectivo esperado</span><strong>${eur(expected)}</strong></div>`;
  renderDenoms();
}

function renderDenoms() {
  $('#denoms').innerHTML = DENOMS.map((d) => {
    const n = closing.counts[d] || 0;
    return `
      <div class="den ${d >= 500 ? 'bill' : 'coin'} ${n ? 'has' : ''}">
        <div class="den-label">${eur(d)}</div>
        <div class="den-ctrl">
          <button class="qbtn" data-action="den-dec" data-den="${d}">−</button>
          <button class="den-num" data-action="den-set" data-den="${d}">${n}</button>
          <button class="qbtn" data-action="den-inc" data-den="${d}">+</button>
        </div>
        <div class="den-sub">${n ? eur(d * n) : '&nbsp;'}</div>
      </div>`;
  }).join('');
  $('#denoms-wrap').classList.toggle('hidden', closing.useManual);
  $('#manual-wrap').classList.toggle('hidden', !closing.useManual);
  $('#manual-total').textContent = eur(closing.manual || 0);
  $('#btn-manual-toggle').textContent = closing.useManual ? '🪙 Contar por billetes y monedas' : '⌨️ Introducir el total a mano';
  const counted = countedTotal();
  const expected = turn.openingCash + salesTotalOfTurn();
  const d = differenceLabel(counted - expected);
  $('#counted-total').textContent = eur(counted);
  const diffEl = $('#close-diff');
  diffEl.textContent = d.text;
  diffEl.className = `badge badge-${d.cls}`;
}

ACTIONS['den-inc'] = (b) => { const d = +b.dataset.den; closing.counts[d] = (closing.counts[d] || 0) + 1; vibrate(8); renderDenoms(); };
ACTIONS['den-dec'] = (b) => { const d = +b.dataset.den; closing.counts[d] = Math.max(0, (closing.counts[d] || 0) - 1); vibrate(8); renderDenoms(); };
ACTIONS['den-set'] = async (b) => {
  const d = +b.dataset.den;
  const n = await askAmount({ title: `¿Cuántos de ${eur(d)}?`, mode: 'int', value: closing.counts[d] || null, okLabel: 'Aceptar' });
  if (n == null) return;
  closing.counts[d] = n;
  renderDenoms();
};
ACTIONS['manual-toggle'] = () => { closing.useManual = !closing.useManual; renderDenoms(); };
ACTIONS['manual-edit'] = async () => {
  const v = await askAmount({ title: 'Efectivo total contado en el cajón', value: closing.manual, okLabel: 'Aceptar' });
  if (v == null) return;
  closing.manual = v;
  renderDenoms();
};
ACTIONS['close-cancel'] = () => showView('sales');
ACTIONS['close-continue'] = async () => {
  const counted = countedTotal();
  if (counted === 0) {
    const ok = await confirmDialog({ title: 'El efectivo contado es 0,00 €', text: '¿Seguro que quieres continuar con un arqueo a cero?', ok: 'Continuar' });
    if (!ok) return;
  }
  const leftInDrawer = Math.min(turn.openingCash, counted);
  const rep = computeReport(turn, turn.tickets, { countedCash: counted, leftInDrawer, closedAt: Date.now(), closedByName: session.user.name });
  rep.lowStock = lowStockProducts();
  reportCtx = { mode: 'closing', rep, turnObj: turn, tickets: turn.tickets, countedCash: counted, leftInDrawer };
  showView('report');
};

/* ---------- Informe ---------- */

function renderReportView() {
  const ctx = reportCtx;
  if (!ctx) { showView('login'); return; }
  const rep = ctx.rep;
  $('#report-body').innerHTML = renderReportHTML(rep, config.club.name);
  const back = $('#report-back');
  const title = $('#report-title');
  const foot = $('#report-actions');
  const shareBtns = `
    <button class="btn" data-action="report-share">📤 Compartir informe</button>
    <button class="btn" data-action="report-csv">🗂 CSV del turno</button>`;
  if (ctx.mode === 'closing') {
    back.textContent = '← Volver al arqueo'; back.dataset.action = 'report-back-close'; back.classList.remove('hidden');
    title.textContent = 'Cierre de turno · revisión';
    foot.innerHTML = `
      <div class="closing-box">
        <div class="closing-left">
          <span class="muted">Efectivo que queda en caja para el siguiente turno</span>
          <button class="amount-btn" data-action="report-left">${eur(rep.leftInDrawer)} <small>cambiar</small></button>
          <span class="muted">Retirada del cajón: <strong>${eur(rep.withdrawn)}</strong></span>
        </div>
        <div class="closing-right">
          ${shareBtns}
          <button class="btn btn-primary btn-lg" data-action="report-confirm">✅ Confirmar cierre</button>
        </div>
      </div>`;
  } else if (ctx.mode === 'closed') {
    back.classList.add('hidden');
    title.textContent = 'Turno cerrado';
    foot.innerHTML = `
      <div class="closing-box">
        <div class="banner banner-success">✅ Turno cerrado y guardado en el histórico.</div>
        <div class="closing-right">
          ${shareBtns}
          <button class="btn btn-primary btn-lg" data-action="report-home">Volver al inicio</button>
        </div>
      </div>`;
  } else {
    back.textContent = '← Histórico'; back.dataset.action = 'report-back-history'; back.classList.remove('hidden');
    title.textContent = 'Informe de turno';
    foot.innerHTML = `<div class="closing-box"><div></div><div class="closing-right">${shareBtns}</div></div>`;
  }
  $('#report-scroll').scrollTop = 0;
}

ACTIONS['report-back-close'] = () => showView('close');
ACTIONS['report-back-history'] = () => showView('history');
ACTIONS['report-home'] = () => { session.user = null; reportCtx = null; showView('login'); };
ACTIONS['report-left'] = async () => {
  const ctx = reportCtx;
  const v = await askAmount({
    title: 'Efectivo que queda en caja',
    subtitle: `Contado: ${eur(ctx.countedCash)}. El resto se retira.`,
    value: ctx.leftInDrawer,
    suggestions: [
      { label: `Saldo inicial ${eur(ctx.turnObj.openingCash)}`, value: centsToInput(ctx.turnObj.openingCash) },
      { label: `Todo (${eur(ctx.countedCash)})`, value: centsToInput(ctx.countedCash) },
      { label: 'Nada (0 €)', value: '0' }
    ]
  });
  if (v == null) return;
  if (v > ctx.countedCash) { toast('No puede quedar más efectivo del contado', 'warn'); return; }
  ctx.leftInDrawer = v;
  ctx.rep = computeReport(ctx.turnObj, ctx.tickets, { countedCash: ctx.countedCash, leftInDrawer: v, closedAt: Date.now(), closedByName: session.user.name });
  ctx.rep.lowStock = lowStockProducts();
  renderReportView();
};
ACTIONS['report-share'] = () => shareText(`Cierre de turno ${fmtDate(reportCtx.rep.openedAt)}`, reportText(reportCtx.rep, config.club.name));
ACTIONS['report-csv'] = () => {
  const ctx = reportCtx;
  const turnsById = { [ctx.turnObj.id]: ctx.turnObj };
  const tickets = ctx.tickets.map((t) => ({ ...t, turnId: t.turnId || ctx.turnObj.id }));
  shareOrDownloadFile(`tickets_${fileStamp(ctx.rep.openedAt)}.csv`, ticketsCSV(tickets, turnsById), 'text/csv');
};
ACTIONS['report-confirm'] = async () => {
  const ctx = reportCtx;
  const d = differenceLabel(ctx.rep.difference);
  const ok = await confirmDialog({
    title: 'Confirmar cierre de turno',
    text: `Recaudado <strong>${eur(ctx.rep.salesTotal)}</strong> · Cuadre: <strong>${d.text}</strong><br>Quedan ${eur(ctx.leftInDrawer)} en caja y se retiran ${eur(ctx.countedCash - ctx.leftInDrawer)}.<br><br>Después de cerrar no se podrán añadir ni anular tickets de este turno.`,
    ok: 'Cerrar turno'
  });
  if (!ok) return;
  await finalizeClose();
};

async function finalizeClose() {
  const ctx = reportCtx;
  const rep = ctx.rep;
  const closedAt = Date.now();
  const closedTurn = {
    id: turn.id, openedAt: turn.openedAt, openedBy: turn.openedBy, openedByName: turn.openedByName,
    closedAt, closedBy: session.user.id, closedByName: session.user.name,
    openingCash: turn.openingCash, countedCash: ctx.countedCash, leftInDrawer: ctx.leftInDrawer,
    withdrawn: ctx.countedCash - ctx.leftInDrawer,
    salesTotal: rep.salesTotal, ticketsCount: rep.ticketsCount, items: rep.items,
    expectedCash: rep.expectedCash, difference: rep.difference,
    invitationsUnits: rep.invitations.units, invitationsValue: rep.invitations.value,
    voidedCount: rep.voided.count, voidedAmount: rep.voided.amount
  };
  const tickets = turn.tickets.map((t) => ({ ...t, turnId: turn.id }));
  try {
    await TPVDB.saveClosedTurn(closedTurn, tickets);
  } catch (e) {
    console.error(e);
    const fb = lsLoad('tpv.archive_fallback', []);
    fb.push({ turn: closedTurn, tickets });
    lsSave('tpv.archive_fallback', fb);
    toast('No se pudo guardar en el histórico; se ha guardado una copia de emergencia.', 'error', 6000);
  }
  const moves = buildClosingStockMoves(closedTurn, rep);
  if (moves.length) { try { await TPVDB.addStockMoves(moves); } catch (e) { console.error(e); } }
  config.lastClosingCash = ctx.leftInDrawer;
  saveConfig();
  turn = null;
  saveTurn();
  ticket = { lines: [] };
  closing = null;
  const finalRep = computeReport(closedTurn, tickets);
  finalRep.lowStock = lowStockProducts();
  reportCtx = { mode: 'closed', rep: finalRep, turnObj: closedTurn, tickets };
  renderReportView();
  toast('Turno cerrado correctamente', 'success');
  autoDownloadClosing(closedTurn, tickets);
  syncAfterClosing(closedTurn, tickets, moves);
}

/* ---------- Histórico ---------- */

async function renderHistory() {
  const list = $('#history-list');
  list.innerHTML = '<p class="muted">Cargando…</p>';
  $('#history-back').textContent = historyReturnView === 'sales' ? '← Ventas' : '← Inicio';
  let turns = [];
  try { turns = await TPVDB.getTurns(); }
  catch (e) { console.error(e); list.innerHTML = '<p class="muted">No se pudo leer el histórico en este dispositivo.</p>'; return; }
  turns.sort((a, b) => b.openedAt - a.openedAt);
  historyCache = turns;
  $('#history-summary').textContent = turns.length
    ? `${turns.length} turnos · ${eur(sum(turns, (t) => t.salesTotal))} recaudados · ${sum(turns, (t) => t.ticketsCount)} tickets`
    : '';
  list.innerHTML = turns.length ? turns.map((t) => {
    const d = differenceLabel(t.difference);
    return `
      <button class="hist-row" data-action="history-view" data-id="${t.id}">
        <div class="hist-date"><strong>${fmtDate(t.openedAt)}</strong><span class="muted">${fmtTime(t.openedAt)} – ${fmtTime(t.closedAt)}</span></div>
        <div class="hist-user"><span class="avatar sm" style="background:${avatarColor(t.openedByName)}">${esc(initials(t.openedByName))}</span>${esc(t.openedByName)}</div>
        <div class="hist-num muted">${t.ticketsCount} tickets</div>
        <div class="hist-total">${eur(t.salesTotal)}</div>
        <div class="badge badge-${d.cls}">${d.text}</div>
      </button>`;
  }).join('') : '<p class="muted empty">Todavía no hay turnos cerrados.</p>';
}

ACTIONS['history-back'] = () => showView(historyReturnView);
ACTIONS['history-view'] = async (b) => {
  const t = historyCache.find((x) => x.id === b.dataset.id);
  if (!t) return;
  let tickets = [];
  try { tickets = await TPVDB.getTickets(t.id); } catch (e) { console.error(e); }
  reportCtx = { mode: 'view', rep: computeReport(t, tickets), turnObj: t, tickets };
  showView('report');
};
ACTIONS['history-export-tickets'] = async () => {
  const [turns, tickets] = await Promise.all([TPVDB.getTurns(), TPVDB.getAllTickets()]);
  if (!tickets.length) { toast('No hay tickets en el histórico', 'warn'); return; }
  const byId = Object.fromEntries(turns.map((t) => [t.id, t]));
  shareOrDownloadFile(`tickets_historico_${fileStamp()}.csv`, ticketsCSV(tickets, byId), 'text/csv');
};
ACTIONS['history-export-turns'] = async () => {
  const turns = await TPVDB.getTurns();
  if (!turns.length) { toast('No hay turnos cerrados', 'warn'); return; }
  shareOrDownloadFile(`turnos_${fileStamp()}.csv`, turnsCSV(turns), 'text/csv');
};

/* ---------- Genéricos ---------- */

ACTIONS['m-close'] = (b) => closeModal(b.closest('.modal-backdrop'));

/* ---------- Pantalla siempre encendida ---------- */

async function requestWakeLock() {
  if (!config.settings.keepAwake || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) { /* no disponible */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (session.user && !wakeLock) requestWakeLock();
  flushAndCheck();
});

/* ---------- Service worker (modo offline / instalable) ---------- */

function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Hay una nueva versión del TPV. Cierra la app y vuelve a abrirla para actualizar.', 'info', 7000);
        }
      });
    });
  }).catch((e) => console.warn('SW no registrado', e));
}

/* ---------- Eventos globales ---------- */

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-key],[data-product],[data-cat],[data-action]');
  if (!t) return;
  if (t.dataset.key !== undefined) { keypadPress(t); return; }
  if (t.dataset.product) { addProduct(t.dataset.product); return; }
  if (t.dataset.cat) { selectCategory(t.dataset.cat); return; }
  const fn = ACTIONS[t.dataset.action];
  if (fn) fn(t, e);
});

document.addEventListener('change', (e) => {
  const t = e.target.closest('[data-change]');
  if (!t) return;
  const fn = ACTIONS[`change:${t.dataset.change}`];
  if (fn) fn(t, e);
});

document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.product, .key, .qbtn, .cat-tab, .user-card, .den')) e.preventDefault();
});

window.addEventListener('beforeunload', (e) => {
  if (ticket.lines.length) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- Arranque ---------- */

/*
 * Cada cuánto se vuelve a mirar la hoja. En una tablet la app casi nunca se cierra de verdad: se
 * queda en segundo plano, así que «una vez al arrancar» no bastaba. Se comprueba al abrirla, al
 * volver a ella, al recuperar la red y cada pocos minutos, con esta espera de por medio para no
 * consultar dos veces por lo mismo.
 */
const SHEET_CHECK_EVERY = 2 * 60 * 1000;
let sheetCheckedAt = 0;
let sheetChecking = false;

/*
 * Cuándo se leyó la hoja por última vez CON ÉXITO de verdad (a diferencia de sheetCheckedAt, que
 * marca cada intento, salga bien o no). catalogChanged() sube el catálogo local sin comprobar antes
 * la hoja -si esperara a leerla perdería la propia edición recién hecha-, así que es la única señal
 * que tiene Administración para avisar de que ese envío podría ir con datos desfasados: un
 * dispositivo con un ticket a medias, sin red, o simplemente olvidado varios días, puede llevar todo
 * ese tiempo sin una lectura buena.
 */
let lastSheetOkAt = 0;
const SHEET_STALE_AFTER = 15 * 60 * 1000;
function markSheetOk() { lastSheetOkAt = Date.now(); }
function sheetIsStale() { return syncEnabled() && Date.now() - lastSheetOkAt > SHEET_STALE_AFTER; }

/*
 * Comprobación de la hoja: si el Excel trae algo distinto se aplica sin preguntar (ver sheetImport
 * en admin.js). No se hace con un ticket a medias: cambiar precios debajo de una venta en curso
 * sería peor que esperar. Sin conexión tampoco se intenta; se reintenta al recuperar la red.
 *
 * Devuelve si la hoja se ha leído de verdad. Todas las salidas de arriba son «no se ha leído»: son
 * silenciosas y frecuentes (una tablet sin cobertura, un ticket a medias, dos comprobaciones
 * seguidas), y quien llama tiene que poder distinguirlas de una lectura buena antes de reescribir
 * la hoja.
 */
async function checkSheet() {
  if (sheetChecking || !syncEnabled() || !navigator.onLine) return false;
  if (ticket.lines.length) return false;
  if (Date.now() - sheetCheckedAt < SHEET_CHECK_EVERY) return false;
  sheetChecking = true;
  try { return (await sheetImport({ silent: true })) === true; }
  catch (e) { console.error('No se pudo comprobar la hoja', e); return false; }
  finally { sheetChecking = false; sheetCheckedAt = Date.now(); }
}

/*
 * El orden importa, y es el revés de lo que parece: el catálogo se queda en la cola hasta DESPUÉS
 * de leer la hoja. Un evento de catálogo reescribe las pestañas de configuración, así que enviarlo
 * primero borraría de un plumazo el usuario o el producto que alguien acabara de añadir a mano en
 * el Excel, y la lectura de después ya no vería ninguna diferencia. Los cierres y los movimientos
 * de inventario sí van primero: solo añaden filas y no pisan nada.
 *
 * Al leer la hoja se aplica lo que traiga y se vuelve a poner en la cola un catálogo nuevo (ya
 * fusionado), que es el que sube en el último envío.
 *
 * Y por eso ese último envío va CONDICIONADO a que la lectura haya salido bien. Antes se hacía
 * siempre, y bastaba con que la hoja no se llegara a leer —sin cobertura, con un ticket a medias, o
 * con una sola errata en el Excel que hiciera fallar la validación— para que el catálogo pendiente
 * subiera igual y reescribiera las pestañas de configuración con lo que tuviera la tablet. Quien
 * acabara de editar el Excel veía desaparecer su trabajo justo después de guardarlo.
 *
 * Si la lectura no sale bien el catálogo se queda en la cola (el ☁️ lo marca como pendiente) y sube
 * en la siguiente vuelta que sí lea. Los cierres y los movimientos no esperan a nada: ya han subido
 * en el primer envío.
 */
/*
 * La primera vez en cada arranque —y justo después de un alta con enlace— es cuando la app está
 * vacía o desfasada de verdad, y es la que va con la cortina de carga puesta: si no, la pantalla de
 * acceso parece cargada mientras aún no hay ni usuarios. Las comprobaciones de después (cada pocos
 * minutos, al volver a la app, al recuperar la red) son silenciosas: tapar la pantalla a alguien
 * que está sirviendo sería peor que no decir nada.
 */
let primeraSync = true;

async function flushAndCheck() {
  const conCortina = primeraSync && syncEnabled() && navigator.onLine;
  if (conCortina) { primeraSync = false; showLoader('Conectando con la hoja del club…'); }
  try {
    if (syncState.pending) loaderStep('Enviando lo que quedaba pendiente…');
    await syncFlush({ skipCatalog: true });
    loaderStep('Comprobando la hoja del club…');
    const leida = await checkSheet();
    if (leida) {
      loaderStep('Devolviendo la configuración a la hoja…');
      await syncFlush();
    }
  } finally {
    if (conCortina) hideLoader();
  }
}

/* ---------- Alta desde un enlace o un QR ---------- */

/*
 * Lee el enlace de alta (…/#tpv=…) y lo borra de la barra de direcciones en cuanto lo ha leído: no
 * hace falta que el token se quede en el historial de Chrome ni a la vista en la lista de pestañas.
 * Devuelve { url, token } o null. Ver el bloque del enlace de alta en sync.js.
 */
function readEnrollHash() {
  const m = /^#tpv=(.+)$/.exec(location.hash || '');
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  const alta = enrollParse(m[1]);
  if (!alta) { toast('El enlace de alta no es válido o está incompleto', 'error', 7000); return null; }
  return alta;
}

function applyEnroll(alta) {
  config.sync.url = alta.url;
  config.sync.token = alta.token;
  config.sync.enabled = true;
  saveConfig();
  updateSyncBadge();
}

/*
 * Cambiar de hoja una tablet que ya estaba trabajando sí se pregunta, y con el PIN de
 * administrador: si no, bastaría con colarle un enlace a alguien para que sus cierres acabasen en
 * otra hoja y su lista de usuarios la marcase un desconocido. En una tablet recién puesta no hay
 * nada que perder, y ahí se aplica directamente (es justo el caso para el que existe el enlace).
 */
async function confirmEnroll(alta) {
  const ok = await confirmDialog({
    title: 'Cambiar la hoja de esta tablet',
    text: 'El enlace que has abierto apunta a una hoja de cálculo <strong>distinta</strong> de la que tiene configurada esta tablet. Si continúas, los próximos cierres se enviarán allí y la configuración vendrá de esa hoja.',
    ok: 'Cambiar de hoja', danger: true
  });
  if (!ok) return;
  const pin = await askPin({ title: 'PIN de administrador', subtitle: 'Para cambiar la hoja', validate: (v) => v === config.adminPin });
  if (!pin) return;
  applyEnroll(alta);
  toast('Conectada a la hoja nueva', 'success', 5000);
  sheetCheckedAt = 0;
  primeraSync = true;      // hoja nueva: toca descargarlo todo, y eso sí se tapa
  flushAndCheck();
}

function init() {
  loadConfig();
  turn = lsLoad(LS_TURN, null);
  if (turn && !Array.isArray(turn.tickets)) turn.tickets = [];
  // El alta se aplica antes del primer flushAndCheck(), para que la tablet nueva ya arranque al día.
  const alta = readEnrollHash();
  let altaPendiente = null, altaAviso = null;
  if (alta) {
    if (!config.sync.url) { applyEnroll(alta); altaAviso = ['Conectada a la hoja del club', 'success']; }
    else if (alta.url === config.sync.url && alta.token === config.sync.token) {
      altaAviso = syncEnabled() ? ['Esta tablet ya estaba conectada a esa hoja', 'info'] : ['Envío a la hoja reactivado', 'success'];
      applyEnroll(alta);
    } else altaPendiente = alta;      // otra hoja: se pregunta con el PIN, ya con la app en marcha
  }
  applyBranding();
  $('#app-version').textContent = `v${APP_VERSION}`;
  TPVDB.open().catch((e) => console.error('IndexedDB no disponible', e));
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  registerSW();
  loadSyncState();
  showView('login');
  if (altaAviso) toast(altaAviso[0], altaAviso[1], 5000);
  flushAndCheck();
  if (altaPendiente) confirmEnroll(altaPendiente);
  window.addEventListener('online', flushAndCheck);
  setInterval(flushAndCheck, 5 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
