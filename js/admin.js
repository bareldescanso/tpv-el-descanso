/* Administración: productos, categorías, inventario, usuarios, club, Google Sheets y copias de seguridad. */
'use strict';

let adminTab = 'products';
let adminProductFilter = 'all';

const ADMIN_TABS = {
  products: { label: 'Productos', icon: '🍺' },
  categories: { label: 'Categorías', icon: '🗂️' },
  inventory: { label: 'Inventario', icon: '📦' },
  users: { label: 'Usuarios', icon: '👥' },
  club: { label: 'Club y ajustes', icon: '🏷️' },
  cloud: { label: 'Google Sheets', icon: '☁️' },
  data: { label: 'Datos y copias', icon: '💾' }
};

const MOVE_LABEL = { venta: 'Ventas del turno', reposicion: 'Reposición', ajuste: 'Ajuste / recuento' };

function renderAdmin() {
  applyBranding();
  $('#admin-nav').innerHTML = Object.entries(ADMIN_TABS).map(([k, t]) => `
    <button class="admin-nav-btn ${k === adminTab ? 'active' : ''}" data-action="admin-tab" data-tab="${k}"><span>${t.icon}</span>${t.label}</button>`).join('');
  $('#admin-warning').classList.toggle('hidden', config.adminPin !== '1234');
  const body = $('#admin-body');
  body.scrollTop = 0;
  ({
    products: renderAdminProducts, categories: renderAdminCategories, inventory: renderAdminInventory,
    users: renderAdminUsers, club: renderAdminClub, cloud: renderAdminCloud, data: renderAdminData
  })[adminTab](body);
}

ACTIONS['admin-tab'] = (b) => { adminTab = b.dataset.tab; renderAdmin(); };
ACTIONS['admin-exit'] = () => {
  if (adminReturnView === 'sales' && !turn) adminReturnView = 'login';
  showView(adminReturnView);
};

/** Guarda movimientos de inventario en el histórico y los encola para Google Sheets. */
async function recordStockMoves(moves) {
  if (!moves || !moves.length) return;
  try { await TPVDB.addStockMoves(moves); } catch (e) { console.error(e); }
  if (syncEnabled()) { try { await syncEnqueue('inventario', { movimientos: moves }); } catch (e) { console.error(e); } }
}

/* ---------- Productos ---------- */

function renderAdminProducts(body) {
  const cats = sortedCategories();
  if (adminProductFilter !== 'all' && !catById(adminProductFilter)) adminProductFilter = 'all';
  const visibleCats = adminProductFilter === 'all' ? cats : cats.filter((c) => c.id === adminProductFilter);
  const orphan = config.products.filter((p) => !catById(p.categoryId));
  body.innerHTML = `
    <div class="admin-toolbar">
      <div class="chips">
        <button class="chip ${adminProductFilter === 'all' ? 'active' : ''}" data-action="admin-prod-filter" data-id="all">Todas</button>
        ${cats.map((c) => `<button class="chip ${adminProductFilter === c.id ? 'active' : ''}" style="--cat:${c.color}" data-action="admin-prod-filter" data-id="${c.id}">${esc(c.emoji || '')} ${esc(c.name)}</button>`).join('')}
      </div>
      <button class="btn btn-primary" data-action="admin-prod-new">＋ Añadir producto</button>
    </div>
    ${!cats.length ? '<p class="muted">Crea primero una categoría.</p>' : ''}
    ${visibleCats.map((c) => {
      const prods = productsOf(c.id, true);
      return `
        <h4 class="admin-group" style="--cat:${c.color}">${esc(c.emoji || '')} ${esc(c.name)} <span class="muted">(${prods.length})</span></h4>
        <div class="admin-list">${prods.map((p) => productRow(p, c)).join('') || '<p class="muted small">Sin productos en esta categoría.</p>'}</div>`;
    }).join('')}
    ${orphan.length && adminProductFilter === 'all' ? `<h4 class="admin-group">Sin categoría</h4><div class="admin-list">${orphan.map((p) => productRow(p, null)).join('')}</div>` : ''}`;
}

function productRow(p, c) {
  const lvl = stockLevel(p);
  return `
    <div class="admin-row ${p.active === false ? 'inactive' : ''}" style="--cat:${p.color || (c && c.color) || '#64748b'}">
      <span class="row-emoji">${esc(p.emoji || (c && c.emoji) || '')}</span>
      <div class="row-main"><strong>${esc(p.name)}</strong><span class="muted small">${c ? esc(c.name) : 'Sin categoría'}${p.active === false ? ' · oculto' : ''}${lvl ? ` · stock <b class="txt-${lvl === 'ok' ? 'ok' : lvl === 'low' ? 'warn' : 'bad'}">${p.stock}</b>` : ''}</span></div>
      <div class="row-price">${eur(p.price)}</div>
      <label class="switch" title="Visible en ventas"><input type="checkbox" data-action="admin-prod-toggle" data-id="${p.id}" ${p.active !== false ? 'checked' : ''}><span></span></label>
      <div class="row-actions">
        <button class="ibtn" data-action="admin-prod-move" data-dir="-1" data-id="${p.id}" title="Subir">↑</button>
        <button class="ibtn" data-action="admin-prod-move" data-dir="1" data-id="${p.id}" title="Bajar">↓</button>
        <button class="btn btn-sm" data-action="admin-prod-edit" data-id="${p.id}">Editar</button>
        <button class="btn btn-sm btn-outline-danger" data-action="admin-prod-del" data-id="${p.id}" title="Eliminar">🗑</button>
      </div>
    </div>`;
}

ACTIONS['admin-prod-filter'] = (b) => { adminProductFilter = b.dataset.id; renderAdmin(); };
ACTIONS['admin-prod-new'] = () => productForm(null);
ACTIONS['admin-prod-edit'] = (b) => productForm(productById(b.dataset.id));
ACTIONS['admin-prod-toggle'] = (b) => { const p = productById(b.dataset.id); if (!p) return; p.active = b.checked; catalogChanged(); renderAdmin(); };
ACTIONS['admin-prod-move'] = (b) => {
  const p = productById(b.dataset.id);
  if (!p) return;
  const list = productsOf(p.categoryId, true);
  const i = list.indexOf(p);
  const j = i + (+b.dataset.dir);
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((x, k) => { x.order = k + 1; });
  catalogChanged(); renderAdmin();
};
ACTIONS['admin-prod-del'] = async (b) => {
  const p = productById(b.dataset.id);
  if (!p) return;
  const ok = await confirmDialog({ title: `¿Eliminar "${p.name}"?`, text: 'Los tickets ya cobrados no se modifican. Si solo quieres que no aparezca en ventas, desactívalo con el interruptor.', ok: 'Eliminar', danger: true });
  if (!ok) return;
  config.products = config.products.filter((x) => x.id !== p.id);
  catalogChanged(); renderAdmin();
  toast('Producto eliminado');
};

function productForm(p) {
  const isNew = !p;
  const cats = sortedCategories();
  if (!cats.length) { toast('Crea primero una categoría', 'warn'); return; }
  const prod = p || { name: '', price: null, categoryId: adminProductFilter !== 'all' ? adminProductFilter : cats[0].id, emoji: '', color: null, active: true, stock: null, minStock: null };
  const tracked = prod.stock != null;
  const m = openModal(`
    <form class="form" autocomplete="off">
      <h3 class="modal-title">${isNew ? 'Nuevo producto' : 'Editar producto'}</h3>
      <div class="field"><label>Nombre</label><input name="name" required maxlength="40" value="${esc(prod.name)}" placeholder="Ej. Caña"></div>
      <div class="field-row">
        <div class="field"><label>Precio (€, neto sin IVA)</label><input name="price" inputmode="decimal" required value="${prod.price == null ? '' : centsToInput(prod.price)}" placeholder="1,50"></div>
        <div class="field"><label>Categoría</label><select name="categoryId">${cats.map((c) => `<option value="${c.id}" ${c.id === prod.categoryId ? 'selected' : ''}>${esc((c.emoji || '') + ' ' + c.name)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Emoji del botón</label>
        <div class="emoji-row"><input name="emoji" maxlength="8" value="${esc(prod.emoji || '')}" class="emoji-input" placeholder="🍺">
        <div class="emoji-picker">${EMOJI_SUGGESTIONS.map((e) => `<button type="button" class="emoji-opt" data-action="pick-emoji">${e}</button>`).join('')}</div></div>
      </div>
      <div class="field"><label>Color del botón <span class="muted">(opcional, por defecto el de la categoría)</span></label>
        <div class="color-picker">
          <button type="button" class="swatch none ${!prod.color ? 'sel' : ''}" data-action="pick-color" data-color="">Auto</button>
          ${COLOR_PALETTE.map((c) => `<button type="button" class="swatch ${prod.color === c ? 'sel' : ''}" style="background:${c}" data-action="pick-color" data-color="${c}" aria-label="${c}"></button>`).join('')}
        </div>
        <input type="hidden" name="color" value="${esc(prod.color || '')}">
      </div>
      <div class="field stock-field">
        <label class="check"><input type="checkbox" name="trackStock" data-action="toggle-stock-fields" ${tracked ? 'checked' : ''}> Controlar el stock de este producto</label>
        <div class="field-row stock-fields ${tracked ? '' : 'hidden'}">
          <div class="field"><label>Unidades en stock ahora</label><input name="stock" inputmode="numeric" value="${tracked ? prod.stock : ''}" placeholder="0"></div>
          <div class="field"><label>Avisar cuando queden</label><input name="minStock" inputmode="numeric" value="${prod.minStock == null ? '' : prod.minStock}" placeholder="p. ej. 6"></div>
        </div>
      </div>
      <label class="check"><input type="checkbox" name="active" ${prod.active !== false ? 'checked' : ''}> Visible en la pantalla de ventas</label>
      <div class="row row-end">
        <button type="button" class="btn" data-action="m-close">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>`, { wide: true, cls: 'modal-form' });
  m.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const name = data.name.trim();
    const price = parseAmountStr(data.price);
    if (!name) { toast('El nombre es obligatorio', 'warn'); return; }
    if (!/^\d+([,.]\d{1,2})?$/.test(data.price.trim())) { toast('Precio no válido. Ejemplo: 1,50', 'warn'); return; }
    const track = !!data.trackStock;
    const stock = track ? parseInt(data.stock || '0', 10) : null;
    const minStock = track && String(data.minStock || '').trim() !== '' ? parseInt(data.minStock, 10) : null;
    if (track && (!Number.isFinite(stock) || stock < 0)) { toast('El stock debe ser un número entero', 'warn'); return; }
    if (track && minStock != null && (!Number.isFinite(minStock) || minStock < 0)) { toast('El mínimo debe ser un número entero', 'warn'); return; }
    const fields = { name, price, categoryId: data.categoryId, emoji: data.emoji.trim(), color: data.color || null, active: !!data.active, stock, minStock };
    const moves = [];
    if (isNew) {
      const np = { id: uid('p'), order: productsOf(fields.categoryId, true).length + 1, ...fields };
      config.products.push(np);
      if (track) moves.push(newStockMove({ product: np, type: 'ajuste', qty: stock, note: 'Inicio del control de stock' }));
    } else {
      const before = p.stock;
      Object.assign(p, fields);
      if (track && before == null) moves.push(newStockMove({ product: p, type: 'ajuste', qty: stock, note: 'Inicio del control de stock' }));
      else if (track && before !== stock) moves.push(newStockMove({ product: p, type: 'ajuste', qty: stock - before, note: 'Ajuste desde la ficha del producto' }));
    }
    catalogChanged();
    recordStockMoves(moves);
    closeModal(m); renderAdmin();
    toast('Producto guardado', 'success');
  });
  setTimeout(() => { const i = $('input[name="name"]', m); if (i && isNew) i.focus(); }, 50);
}

ACTIONS['toggle-stock-fields'] = (cb) => { const f = cb.closest('form'); if (f) $('.stock-fields', f).classList.toggle('hidden', !cb.checked); };
ACTIONS['pick-emoji'] = (b) => { const f = b.closest('form'); if (f) f.elements.emoji.value = b.textContent.trim(); };
ACTIONS['pick-color'] = (b) => {
  const f = b.closest('form');
  if (!f) return;
  f.elements.color.value = b.dataset.color;
  $$('.swatch', f).forEach((s) => s.classList.toggle('sel', s === b));
};

/* ---------- Categorías ---------- */

function renderAdminCategories(body) {
  const cats = sortedCategories();
  body.innerHTML = `
    <div class="admin-toolbar"><p class="muted">Las categorías son las pestañas de la pantalla de ventas.</p><button class="btn btn-primary" data-action="admin-cat-new">＋ Añadir categoría</button></div>
    <div class="admin-list">${cats.map((c) => `
      <div class="admin-row" style="--cat:${c.color}">
        <span class="row-emoji">${esc(c.emoji || '')}</span>
        <div class="row-main"><strong>${esc(c.name)}</strong><span class="muted small">${productsOf(c.id, true).length} productos</span></div>
        <span class="color-dot" style="background:${c.color}"></span>
        <div class="row-actions">
          <button class="ibtn" data-action="admin-cat-move" data-dir="-1" data-id="${c.id}" title="Subir">↑</button>
          <button class="ibtn" data-action="admin-cat-move" data-dir="1" data-id="${c.id}" title="Bajar">↓</button>
          <button class="btn btn-sm" data-action="admin-cat-edit" data-id="${c.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-action="admin-cat-del" data-id="${c.id}" title="Eliminar">🗑</button>
        </div>
      </div>`).join('') || '<p class="muted">No hay categorías.</p>'}</div>`;
}

ACTIONS['admin-cat-new'] = () => categoryForm(null);
ACTIONS['admin-cat-edit'] = (b) => categoryForm(catById(b.dataset.id));
ACTIONS['admin-cat-move'] = (b) => {
  const list = sortedCategories();
  const i = list.findIndex((c) => c.id === b.dataset.id);
  const j = i + (+b.dataset.dir);
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((c, k) => { c.order = k + 1; });
  catalogChanged(); renderAdmin();
};
ACTIONS['admin-cat-del'] = async (b) => {
  const c = catById(b.dataset.id);
  if (!c) return;
  const n = productsOf(c.id, true).length;
  if (n) { await alertDialog('No se puede eliminar', `La categoría "${esc(c.name)}" tiene ${n} productos. Muévelos a otra categoría o elimínalos primero.`); return; }
  const ok = await confirmDialog({ title: `¿Eliminar la categoría "${c.name}"?`, ok: 'Eliminar', danger: true });
  if (!ok) return;
  config.categories = config.categories.filter((x) => x.id !== c.id);
  catalogChanged(); renderAdmin();
};

function categoryForm(c) {
  const isNew = !c;
  const cat = c || { name: '', emoji: '', color: COLOR_PALETTE[0] };
  const m = openModal(`
    <form class="form" autocomplete="off">
      <h3 class="modal-title">${isNew ? 'Nueva categoría' : 'Editar categoría'}</h3>
      <div class="field"><label>Nombre</label><input name="name" required maxlength="30" value="${esc(cat.name)}" placeholder="Ej. Refrescos"></div>
      <div class="field"><label>Emoji</label>
        <div class="emoji-row"><input name="emoji" maxlength="8" value="${esc(cat.emoji || '')}" class="emoji-input">
        <div class="emoji-picker">${EMOJI_SUGGESTIONS.map((e) => `<button type="button" class="emoji-opt" data-action="pick-emoji">${e}</button>`).join('')}</div></div>
      </div>
      <div class="field"><label>Color</label>
        <div class="color-picker">${COLOR_PALETTE.map((col) => `<button type="button" class="swatch ${cat.color === col ? 'sel' : ''}" style="background:${col}" data-action="pick-color" data-color="${col}" aria-label="${col}"></button>`).join('')}</div>
        <input type="hidden" name="color" value="${esc(cat.color)}">
      </div>
      <div class="row row-end">
        <button type="button" class="btn" data-action="m-close">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>`, { wide: true, cls: 'modal-form' });
  m.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const name = data.name.trim();
    if (!name) { toast('El nombre es obligatorio', 'warn'); return; }
    const fields = { name, emoji: data.emoji.trim(), color: data.color || COLOR_PALETTE[0] };
    if (isNew) config.categories.push({ id: uid('c'), order: config.categories.length + 1, ...fields });
    else Object.assign(c, fields);
    catalogChanged(); closeModal(m); renderAdmin();
    toast('Categoría guardada', 'success');
  });
}

/* ---------- Inventario ---------- */

async function renderAdminInventory(body) {
  const cats = sortedCategories();
  const tracked = config.products.filter((p) => p.stock != null).length;
  body.innerHTML = `
    <div class="admin-toolbar">
      <p class="muted">El stock se descuenta con cada venta e invitación y se recupera al anular un ticket. Con el cierre de turno se envía a la hoja «Inventario» un resumen por producto.${tracked ? '' : ' Todavía no controlas el stock de ningún producto: pulsa «Empezar a controlar».'}</p>
    </div>
    ${cats.map((c) => {
      const prods = productsOf(c.id, true);
      if (!prods.length) return '';
      return `<h4 class="admin-group" style="--cat:${c.color}">${esc(c.emoji || '')} ${esc(c.name)}</h4>
        <div class="admin-list">${prods.map((p) => inventoryRow(p, c)).join('')}</div>`;
    }).join('')}
    <h4 class="admin-group">Últimos movimientos</h4>
    <div id="stock-moves" class="rep-card"><p class="muted">Cargando…</p></div>`;
  let moves = [];
  try { moves = await TPVDB.getStockMoves(60); } catch (e) { console.error(e); }
  const el = $('#stock-moves');
  if (!el) return;
  el.innerHTML = moves.length ? `<table class="table"><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="num">Cantidad</th><th class="num">Stock</th><th>Quién</th></tr></thead><tbody>
      ${moves.map((m) => `<tr><td class="muted">${fmtDateTime(m.ts)}</td><td>${esc(m.name)}</td><td>${MOVE_LABEL[m.type] || esc(m.type)}${m.note ? `<br><span class="muted small">${esc(m.note)}</span>` : ''}</td><td class="num ${m.qty < 0 ? 'txt-bad' : 'txt-ok'}">${m.qty > 0 ? '+' : ''}${m.qty}</td><td class="num">${m.stockAfter}</td><td class="muted">${esc(m.userName || '')}</td></tr>`).join('')}
    </tbody></table>` : '<p class="muted">Todavía no hay movimientos.</p>';
}

function inventoryRow(p, c) {
  const lvl = stockLevel(p);
  return `
    <div class="admin-row ${p.active === false ? 'inactive' : ''}" style="--cat:${p.color || c.color}">
      <span class="row-emoji">${esc(p.emoji || c.emoji || '')}</span>
      <div class="row-main"><strong>${esc(p.name)}</strong><span class="muted small">${p.stock == null ? 'Sin control de stock' : `Aviso por debajo de: ${p.minStock == null ? '—' : p.minStock}`}</span></div>
      ${p.stock == null ? '<span class="stock-num muted">—</span>' : `<span class="stock-num ${lvl}">${p.stock} <small>uds</small></span>`}
      <div class="row-actions">
        ${p.stock == null
          ? `<button class="btn btn-sm" data-action="stock-start" data-id="${p.id}">Empezar a controlar</button>`
          : `<button class="btn btn-sm btn-primary" data-action="stock-add" data-id="${p.id}">＋ Reposición</button>
             <button class="btn btn-sm" data-action="stock-set" data-id="${p.id}">Recuento</button>
             <button class="ibtn" data-action="stock-stop" data-id="${p.id}" title="Dejar de controlar">✕</button>`}
      </div>
    </div>`;
}

ACTIONS['stock-start'] = async (b) => {
  const p = productById(b.dataset.id);
  if (!p) return;
  const n = await askAmount({ title: `Unidades actuales de ${p.name}`, subtitle: 'Cuenta lo que hay ahora en el almacén y la barra', mode: 'int', okLabel: 'Empezar' });
  if (n == null) return;
  p.stock = n;
  catalogChanged();
  await recordStockMoves([newStockMove({ product: p, type: 'ajuste', qty: n, note: 'Inicio del control de stock' })]);
  renderAdmin();
};
ACTIONS['stock-add'] = async (b) => {
  const p = productById(b.dataset.id);
  if (!p || p.stock == null) return;
  const n = await askAmount({ title: `Reposición de ${p.name}`, subtitle: `Stock actual: ${p.stock}. Unidades que entran:`, mode: 'int', okLabel: 'Añadir', allowZero: false });
  if (!n) return;
  p.stock += n;
  catalogChanged();
  await recordStockMoves([newStockMove({ product: p, type: 'reposicion', qty: n })]);
  renderAdmin();
  toast(`${p.name}: ahora ${p.stock} uds`, 'success');
};
ACTIONS['stock-set'] = async (b) => {
  const p = productById(b.dataset.id);
  if (!p || p.stock == null) return;
  const n = await askAmount({ title: `Recuento de ${p.name}`, subtitle: `La app tiene ${p.stock}. Escribe las unidades reales:`, mode: 'int', value: p.stock, okLabel: 'Guardar' });
  if (n == null) return;
  const delta = n - p.stock;
  p.stock = n;
  catalogChanged();
  if (delta !== 0) await recordStockMoves([newStockMove({ product: p, type: 'ajuste', qty: delta, note: 'Recuento manual' })]);
  renderAdmin();
};
ACTIONS['stock-stop'] = async (b) => {
  const p = productById(b.dataset.id);
  if (!p) return;
  const ok = await confirmDialog({ title: `¿Dejar de controlar el stock de ${p.name}?`, text: 'Los movimientos anteriores se conservan en el histórico.', ok: 'Dejar de controlar' });
  if (!ok) return;
  p.stock = null; p.minStock = null;
  catalogChanged(); renderAdmin();
};

/* ---------- Usuarios ---------- */

function renderAdminUsers(body) {
  body.innerHTML = `
    <div class="admin-toolbar">
      <p class="muted">Cada persona que atiende la barra entra con su nombre y un PIN de 4 dígitos.</p>
      <div class="row"><button class="btn" data-action="admin-pin-change">🔑 Cambiar PIN de administrador</button><button class="btn btn-primary" data-action="admin-user-new">＋ Añadir usuario</button></div>
    </div>
    <div class="admin-list">${config.users.map((u) => `
      <div class="admin-row ${u.active === false ? 'inactive' : ''}">
        <span class="avatar" style="background:${avatarColor(u.name)}">${esc(initials(u.name))}</span>
        <div class="row-main"><strong>${esc(u.name)}</strong><span class="muted small">PIN <span class="pin-mask" data-action="admin-pin-reveal" data-pin="${esc(u.pin)}">••••</span>${u.active === false ? ' · desactivado' : ''}</span></div>
        <label class="switch" title="Activo"><input type="checkbox" data-action="admin-user-toggle" data-id="${u.id}" ${u.active !== false ? 'checked' : ''}><span></span></label>
        <div class="row-actions">
          <button class="btn btn-sm" data-action="admin-user-edit" data-id="${u.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-action="admin-user-del" data-id="${u.id}" title="Eliminar">🗑</button>
        </div>
      </div>`).join('') || '<p class="muted">No hay usuarios.</p>'}</div>`;
}

ACTIONS['admin-pin-reveal'] = (b) => { const shown = b.textContent !== '••••'; b.textContent = shown ? '••••' : b.dataset.pin; };
ACTIONS['admin-user-new'] = () => userForm(null);
ACTIONS['admin-user-edit'] = (b) => userForm(userById(b.dataset.id));
ACTIONS['admin-user-toggle'] = (b) => { const u = userById(b.dataset.id); if (!u) return; u.active = b.checked; saveConfig(); renderAdmin(); };
ACTIONS['admin-user-del'] = async (b) => {
  const u = userById(b.dataset.id);
  if (!u) return;
  const ok = await confirmDialog({ title: `¿Eliminar a ${u.name}?`, text: 'Los turnos y tickets anteriores conservan su nombre.', ok: 'Eliminar', danger: true });
  if (!ok) return;
  config.users = config.users.filter((x) => x.id !== u.id);
  saveConfig(); renderAdmin();
};

function userForm(u) {
  const isNew = !u;
  const user = u || { name: '', pin: '', active: true };
  const m = openModal(`
    <form class="form" autocomplete="off">
      <h3 class="modal-title">${isNew ? 'Nuevo usuario' : 'Editar usuario'}</h3>
      <div class="field"><label>Nombre</label><input name="name" required maxlength="30" value="${esc(user.name)}" placeholder="Nombre"></div>
      <div class="field"><label>PIN (4 dígitos)</label><input name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required value="${esc(user.pin)}" placeholder="1234"></div>
      <label class="check"><input type="checkbox" name="active" ${user.active !== false ? 'checked' : ''}> Activo (aparece en la pantalla de acceso)</label>
      <div class="row row-end">
        <button type="button" class="btn" data-action="m-close">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>`, { cls: 'modal-form' });
  m.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const name = data.name.trim();
    const pin = data.pin.trim();
    if (!name) { toast('El nombre es obligatorio', 'warn'); return; }
    if (!/^\d{4}$/.test(pin)) { toast('El PIN debe tener 4 dígitos', 'warn'); return; }
    if (config.users.some((x) => x !== u && x.pin === pin)) { toast('Ese PIN ya lo usa otra persona', 'warn'); return; }
    if (pin === config.adminPin) { toast('Ese PIN coincide con el de administrador', 'warn'); return; }
    const fields = { name, pin, active: !!data.active };
    if (isNew) config.users.push({ id: uid('u'), ...fields });
    else Object.assign(u, fields);
    saveConfig(); closeModal(m); renderAdmin();
    toast('Usuario guardado', 'success');
  });
}

ACTIONS['admin-pin-change'] = async () => {
  const first = await askPin({ title: 'Nuevo PIN de administrador', subtitle: 'Introduce 4 dígitos', validate: (v) => !config.users.some((u) => u.pin === v), errorText: 'Ese PIN ya lo usa un usuario' });
  if (!first) return;
  const second = await askPin({ title: 'Repite el nuevo PIN', validate: (v) => v === first, errorText: 'No coincide, vuelve a intentarlo' });
  if (!second) return;
  config.adminPin = first;
  saveConfig(); renderAdmin();
  toast('PIN de administrador actualizado', 'success');
};

/* ---------- Club y ajustes ---------- */

function renderAdminClub(body) {
  body.innerHTML = `
    <form class="form form-club" autocomplete="off">
      <div class="club-grid">
        <div>
          <div class="field"><label>Nombre del club</label><input name="name" required maxlength="40" value="${esc(config.club.name)}"></div>
          <div class="field"><label>Subtítulo <span class="muted">(opcional)</span></label><input name="subtitle" maxlength="60" value="${esc(config.club.subtitle || '')}" placeholder="Bar del club"></div>
          <label class="check"><input type="checkbox" name="keepAwake" ${config.settings.keepAwake ? 'checked' : ''}> Mantener la pantalla encendida mientras hay alguien identificado</label>
          <label class="check"><input type="checkbox" name="vibrate" ${config.settings.vibrate ? 'checked' : ''}> Vibración al pulsar botones</label>
        </div>
        <div class="logo-box">
          <label>Logo</label>
          <img class="logo-preview" src="${esc(config.club.logo || 'icons/logo.svg')}" alt="Logo">
          <label class="btn file-btn">📷 Cambiar logo<input type="file" accept="image/*" data-change="logo" hidden></label>
          ${config.club.logo ? '<button type="button" class="btn btn-ghost" data-action="admin-logo-reset">Volver al logo por defecto</button>' : ''}
          <p class="muted small">Se recomienda una imagen cuadrada. Se guarda reducida a 256 px.</p>
        </div>
      </div>
      <div class="row row-end"><button type="submit" class="btn btn-primary">Guardar cambios</button></div>
    </form>`;
  $('form', body).addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const name = data.name.trim();
    if (!name) { toast('El nombre es obligatorio', 'warn'); return; }
    config.club.name = name;
    config.club.subtitle = data.subtitle.trim();
    config.settings.keepAwake = !!data.keepAwake;
    config.settings.vibrate = !!data.vibrate;
    saveConfig(); applyBranding();
    toast('Ajustes guardados', 'success');
  });
}

ACTIONS['change:logo'] = async (input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    config.club.logo = await imageFileToDataUrl(file, 256);
    saveConfig(); applyBranding(); renderAdmin();
    toast('Logo actualizado', 'success');
  } catch (e) { toast('No se pudo leer la imagen', 'error'); }
};
ACTIONS['admin-logo-reset'] = () => { config.club.logo = null; saveConfig(); applyBranding(); renderAdmin(); };

/* ---------- Google Sheets ---------- */

function renderAdminCloud(body) {
  const s = config.sync;
  body.innerHTML = `
    <div class="data-grid">
      <section class="rep-card">
        <h4>Conexión con Google Sheets</h4>
        <p class="muted">Cada cierre se envía con sus tickets a una hoja de cálculo de tu Google Drive, junto con el catálogo y el inventario. El script guarda además un JSON por cierre en una carpeta de Drive. Sin conexión, todo queda en cola y se envía después.</p>
        <form class="form" id="cloud-form" autocomplete="off">
          <label class="check"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}> Enviar automáticamente a Google Sheets</label>
          <div class="field"><label>URL de la aplicación web <span class="muted">(termina en /exec)</span></label><input name="url" type="url" inputmode="url" value="${esc(s.url || '')}" placeholder="https://script.google.com/macros/s/…/exec"></div>
          <div class="field"><label>Token <span class="muted">(el mismo que pusiste en el script)</span></label><input name="token" value="${esc(s.token || '')}" placeholder="una-clave-larga-y-dificil"></div>
          <div class="row wrap"><button type="button" class="btn" data-action="cloud-test">🔌 Probar conexión</button><button type="submit" class="btn btn-primary">Guardar</button></div>
        </form>
      </section>
      <section class="rep-card">
        <h4>Estado de la sincronización</h4>
        <div id="sync-status"></div>
        <div class="row wrap">
          <button class="btn" data-action="sync-now">📤 Enviar pendientes</button>
          <button class="btn" data-action="cloud-send-catalog">🗂 Enviar catálogo e inventario</button>
          <button class="btn" data-action="cloud-send-history">🕘 Enviar todo el histórico</button>
        </div>
      </section>
      <section class="rep-card">
        <h4>Copias automáticas en la tablet</h4>
        <label class="check"><input type="checkbox" data-action="cloud-toggle" data-key="autoDownloadJson" ${s.autoDownloadJson !== false ? 'checked' : ''}> Descargar el JSON de cada cierre en la carpeta Descargas</label>
        <label class="check"><input type="checkbox" data-action="cloud-toggle" data-key="autoDownloadCsv" ${s.autoDownloadCsv ? 'checked' : ''}> Descargar también el CSV de tickets del turno</label>
        <p class="muted small">Chrome pedirá permiso una sola vez para descargar varios archivos seguidos.</p>
      </section>
      <section class="rep-card">
        <h4>Cómo publicar el script</h4>
        <ol class="steps">
          <li>Crea una hoja de cálculo nueva en Google Sheets.</li>
          <li>Menú Extensiones → Apps Script. Borra el contenido, pega el archivo <code>google-apps-script/Code.gs</code> del proyecto y cambia el valor de <code>TOKEN</code>.</li>
          <li>Implementar → Nueva implementación → tipo «Aplicación web». Ejecutar como: tú. Quién tiene acceso: «Cualquier usuario».</li>
          <li>Autoriza los permisos y copia la URL que termina en <code>/exec</code>.</li>
          <li>Pégala aquí con el token, pulsa «Probar conexión» y después «Guardar».</li>
        </ol>
      </section>
    </div>`;
  renderSyncStatus();
  $('#cloud-form', body).addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const url = (data.url || '').trim();
    if (data.enabled && !/^https?:\/\/.+/.test(url)) { toast('Introduce la URL de la aplicación web', 'warn'); return; }
    config.sync.enabled = !!data.enabled;
    config.sync.url = url;
    config.sync.token = (data.token || '').trim();
    saveConfig(); updateSyncBadge();
    toast('Conexión guardada', 'success');
    if (config.sync.enabled) { await syncEnqueueCatalog(); syncFlush(); }
  });
}

function renderSyncStatus() {
  const el = $('#sync-status');
  if (!el) return;
  const s = syncState;
  el.innerHTML = `
    <div class="rep-row"><span>Estado</span><strong>${syncEnabled() ? (s.running ? 'Enviando…' : 'Activado') : 'Desactivado'}</strong></div>
    <div class="rep-row"><span>Pendientes de enviar</span><strong>${s.pending}</strong></div>
    <div class="rep-row"><span>Último envío correcto</span><strong>${s.lastOk ? fmtDateTime(s.lastOk) : '—'}</strong></div>
    <div class="rep-row ${s.lastError ? 'diff bad' : ''}"><span>Último error</span><strong class="wrap-text">${s.lastError ? esc(s.lastError) : '—'}</strong></div>
    ${s.progress ? `<div class="rep-row"><span>Progreso</span><strong>${esc(s.progress)}</strong></div>` : ''}`;
}

ACTIONS['cloud-test'] = async (b) => {
  const f = b.closest('form');
  const url = f.elements.url.value.trim();
  const token = f.elements.token.value.trim();
  if (!url) { toast('Introduce la URL de la aplicación web', 'warn'); return; }
  toast('Probando la conexión…');
  try {
    const r = await syncTest(url, token);
    toast(`Conectado con la hoja «${r.hoja || ''}»`, 'success', 4000);
  } catch (e) { toast(`Sin conexión: ${e.message}`, 'error', 7000); }
};
ACTIONS['cloud-toggle'] = (cb) => { config.sync[cb.dataset.key] = cb.checked; saveConfig(); };
ACTIONS['cloud-send-catalog'] = async () => {
  if (!syncEnabled()) { toast('Activa y guarda primero la conexión', 'warn'); return; }
  await syncEnqueueCatalog();
  const r = await syncFlush({ manual: true });
  if (r.ok) toast('Catálogo e inventario enviados', 'success');
  else toast(`No se pudo enviar: ${r.error || 'sin conexión'}`, 'error', 6000);
};
ACTIONS['cloud-send-history'] = async () => {
  if (!syncEnabled()) { toast('Activa y guarda primero la conexión', 'warn'); return; }
  const turns = await TPVDB.getTurns();
  if (!turns.length) { toast('No hay turnos cerrados', 'warn'); return; }
  const ok = await confirmDialog({ title: 'Enviar todo el histórico', text: `Se enviarán ${turns.length} turnos con sus tickets, los movimientos de inventario y el catálogo. Lo que ya esté en la hoja no se duplica.`, ok: 'Enviar' });
  if (!ok) return;
  try {
    syncState.progress = 'Preparando…'; renderSyncStatus();
    const n = await syncSendAllHistory((d, t) => { syncState.progress = `${d} de ${t} turnos`; renderSyncStatus(); });
    syncState.progress = ''; renderSyncStatus();
    toast(`Histórico enviado: ${n} turnos`, 'success', 4000);
  } catch (e) {
    syncState.progress = ''; syncState.lastError = e.message; persistSyncState(); renderSyncStatus();
    toast(`Error al enviar: ${e.message}`, 'error', 7000);
  }
};

/* ---------- Datos y copias de seguridad ---------- */

function renderAdminData(body) {
  body.innerHTML = `
    <div class="data-grid">
      <section class="rep-card">
        <h4>Copia de seguridad</h4>
        <p class="muted">Un único archivo JSON con la configuración, el turno abierto, el histórico y el inventario. Guárdalo fuera de la tablet (Drive, email, WhatsApp…) de forma periódica.</p>
        <div class="row wrap">
          <button class="btn btn-primary" data-action="admin-backup">⬇️ Descargar copia (JSON)</button>
          <button class="btn" data-action="admin-backup-share">📤 Compartir copia</button>
          <label class="btn file-btn">♻️ Restaurar copia<input type="file" accept="application/json,.json" data-change="restore" hidden></label>
        </div>
      </section>
      <section class="rep-card">
        <h4>Exportar a Excel (CSV)</h4>
        <p class="muted">Archivos con separador «;» listos para abrir en Excel o Google Sheets.</p>
        <div class="row wrap">
          <button class="btn" data-action="history-export-turns">🗂 Resumen de turnos</button>
          <button class="btn" data-action="history-export-tickets">🧾 Todos los tickets</button>
        </div>
      </section>
      <section class="rep-card">
        <h4>Almacenamiento</h4>
        <p class="muted" id="storage-info">Calculando…</p>
        <p class="muted small">Los datos viven en el navegador de esta tablet (no hay servidor). Si se borran los datos de Chrome o se pierde la tablet, se pierden. La copia de seguridad y Google Sheets son el respaldo.</p>
      </section>
      <section class="rep-card danger-zone">
        <h4>Zona peligrosa</h4>
        <div class="row wrap">
          <button class="btn btn-outline-danger" data-action="admin-reset-catalog">Restablecer catálogo de ejemplo</button>
          <button class="btn btn-outline-danger" data-action="admin-clear-history">Borrar histórico de turnos</button>
          <button class="btn btn-danger" data-action="admin-factory-reset">Borrar todo y empezar de cero</button>
        </div>
      </section>
    </div>
    <p class="muted small">TPV ${esc(config.club.name)} · versión ${APP_VERSION}</p>`;
  fillStorageInfo();
}

async function fillStorageInfo() {
  const el = $('#storage-info');
  if (!el) return;
  try {
    const [turns, tickets, moves] = await Promise.all([TPVDB.getTurns(), TPVDB.getAllTickets(), TPVDB.getStockMoves(0)]);
    let usage = '';
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      usage = ` · ${(est.usage / 1024).toFixed(0)} KB usados`;
    }
    let persisted = '';
    if (navigator.storage && navigator.storage.persisted) {
      persisted = (await navigator.storage.persisted()) ? ' · almacenamiento persistente' : '';
    }
    el.textContent = `${turns.length} turnos cerrados · ${tickets.length} tickets · ${moves.length} movimientos de inventario${turn ? ` · turno abierto con ${turn.tickets.length} tickets` : ''}${usage}${persisted}`;
  } catch (e) { el.textContent = 'No se pudo consultar el almacenamiento.'; }
}

async function buildBackup() {
  const [turns, tickets, stockMoves] = await Promise.all([TPVDB.getTurns(), TPVDB.getAllTickets(), TPVDB.getStockMoves(0)]);
  return JSON.stringify({
    app: 'tpv-el-descanso', version: APP_VERSION, exportedAt: new Date().toISOString(),
    config, currentTurn: turn, turns, tickets, stockMoves
  }, null, 1);
}

ACTIONS['admin-backup'] = async () => {
  downloadFile(`copia_tpv_${fileStamp()}.json`, await buildBackup(), 'application/json');
  toast('Copia de seguridad generada', 'success');
};
ACTIONS['admin-backup-share'] = async () => shareOrDownloadFile(`copia_tpv_${fileStamp()}.json`, await buildBackup(), 'application/json');

ACTIONS['change:restore'] = async (input) => {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await readFileText(file)); }
  catch (e) { toast('El archivo no es un JSON válido', 'error'); return; }
  if (!data || data.app !== 'tpv-el-descanso' || !data.config) { toast('El archivo no es una copia de seguridad de este TPV', 'error'); return; }
  const ok = await confirmDialog({
    title: 'Restaurar copia de seguridad',
    text: `Se reemplazarán la configuración y el histórico actuales por los del archivo:<br>${(data.turns || []).length} turnos · ${(data.tickets || []).length} tickets · exportado el ${data.exportedAt ? fmtDateTime(Date.parse(data.exportedAt)) : '?'}.<br><br><strong>Esta acción no se puede deshacer.</strong>`,
    ok: 'Restaurar', danger: true
  });
  if (!ok) return;
  try {
    await TPVDB.clearHistory();
    await TPVDB.importAll(data.turns || [], data.tickets || [], data.stockMoves || []);
    lsSave(LS_CONFIG, data.config);
    if (data.currentTurn) lsSave(LS_TURN, data.currentTurn); else localStorage.removeItem(LS_TURN);
    location.reload();
  } catch (e) { console.error(e); toast('No se pudo restaurar la copia', 'error'); }
};

ACTIONS['admin-reset-catalog'] = async () => {
  const ok = await confirmDialog({ title: 'Restablecer catálogo de ejemplo', text: 'Se reemplazarán TODAS las categorías y productos actuales por los de ejemplo. Usuarios, ajustes e histórico no cambian.', ok: 'Restablecer', danger: true });
  if (!ok) return;
  config.categories = clone(DEFAULT_CONFIG.categories);
  config.products = clone(DEFAULT_CONFIG.products);
  config.products.forEach((p) => { p.stock = null; p.minStock = null; });
  catalogChanged(); renderAdmin();
  toast('Catálogo restablecido');
};

ACTIONS['admin-clear-history'] = async () => {
  const ok = await confirmDialog({ title: 'Borrar histórico de turnos', text: 'Se eliminarán todos los turnos cerrados, sus tickets y los movimientos de inventario de esta tablet. Lo ya enviado a Google Sheets no se toca. Haz antes una copia de seguridad.<br><br><strong>Esta acción no se puede deshacer.</strong>', ok: 'Borrar histórico', danger: true });
  if (!ok) return;
  try { await TPVDB.clearHistory(); localStorage.removeItem('tpv.archive_fallback'); toast('Histórico borrado'); renderAdmin(); }
  catch (e) { toast('No se pudo borrar el histórico', 'error'); }
};

ACTIONS['admin-factory-reset'] = async () => {
  const ok = await confirmDialog({ title: 'Borrar todo y empezar de cero', text: 'Se borrarán configuración, usuarios, catálogo, turno abierto, histórico y cola de envíos. La app volverá al estado inicial.<br><br><strong>Esta acción no se puede deshacer.</strong>', ok: 'Borrar todo', danger: true });
  if (!ok) return;
  const again = await confirmDialog({ title: '¿Seguro del todo?', text: 'Última confirmación.', ok: 'Sí, borrar todo', danger: true });
  if (!again) return;
  try { await TPVDB.clearAll(); } catch (e) { /* ignorar */ }
  [LS_CONFIG, LS_TURN, 'tpv.archive_fallback', LS_SYNC_STATE].forEach((k) => localStorage.removeItem(k));
  location.reload();
};
