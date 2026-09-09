/*
 * Sincronización con Google Sheets (Apps Script publicado como aplicación web).
 * Los eventos (cierres, catálogo, inventario) se guardan en una cola local (IndexedDB) y se envían
 * cuando hay conexión. El script es idempotente, así que reenviar un evento no duplica filas.
 */
'use strict';

const LS_SYNC_STATE = 'tpv.sync_state';
const SYNC_BATCH = 10;
const syncState = { running: false, lastOk: null, lastError: null, lastAttempt: null, pending: 0, progress: '' };

function loadSyncState() {
  Object.assign(syncState, lsLoad(LS_SYNC_STATE, {}), { running: false, progress: '' });
  refreshSyncPending();
}
function persistSyncState() {
  lsSave(LS_SYNC_STATE, { lastOk: syncState.lastOk, lastError: syncState.lastError, lastAttempt: syncState.lastAttempt });
}
const syncCfg = () => (config && config.sync) || {};
const syncEnabled = () => !!(syncCfg().enabled && syncCfg().url);

async function refreshSyncPending() {
  try { syncState.pending = await TPVDB.queueCount(); } catch (e) { syncState.pending = 0; }
  updateSyncBadge();
}

/** Indicador ☁️ de la barra de ventas y estado en Administración. */
function updateSyncBadge() {
  const b = $('#sync-badge');
  if (b) {
    b.classList.toggle('hidden', !syncEnabled());
    b.classList.toggle('sync-error', !!syncState.lastError);
    b.classList.toggle('sync-running', syncState.running);
    const c = $('#sync-pending');
    if (c) { c.textContent = syncState.pending; c.classList.toggle('hidden', !syncState.pending); }
  }
  if (typeof renderSyncStatus === 'function') renderSyncStatus();
}

/** Añade un evento a la cola. replaceType: sustituye los eventos pendientes del mismo tipo (para instantáneas). */
async function syncEnqueue(type, data, { replaceType = false } = {}) {
  if (replaceType) {
    const q = await TPVDB.queueAll();
    const ids = q.filter((e) => e.type === type).map((e) => e.id);
    if (ids.length) await TPVDB.queueDelete(ids);
  }
  await TPVDB.queueAdd({ id: uid('e'), type, ts: Date.now(), data });
  await refreshSyncPending();
}

function catalogSnapshot() {
  const cats = sortedCategories();
  return {
    generadoEn: Date.now(),
    club: config.club.name,
    categorias: cats.map((c) => ({ id: c.id, nombre: c.name, emoji: c.emoji || '', color: c.color, orden: c.order || 0 })),
    productos: config.products.slice().sort((a, b) => {
      const ca = cats.findIndex((c) => c.id === a.categoryId), cb = cats.findIndex((c) => c.id === b.categoryId);
      return ca - cb || (a.order || 0) - (b.order || 0);
    }).map((p) => {
      const c = catById(p.categoryId);
      return {
        id: p.id, categoria: c ? c.name : '', nombre: p.name, precio: p.price, emoji: p.emoji || '',
        visible: p.active !== false, controlaStock: p.stock != null, stock: p.stock, minimo: p.minStock, orden: p.order || 0
      };
    })
  };
}

const syncEnqueueCatalog = () => syncEnqueue('catalogo', catalogSnapshot(), { replaceType: true });

let catalogSyncTimer = null;
/** Guarda la configuración y programa el envío del catálogo (con retardo para agrupar cambios). */
function catalogChanged() {
  saveConfig();
  if (!syncEnabled()) return;
  clearTimeout(catalogSyncTimer);
  catalogSyncTimer = setTimeout(async () => { await syncEnqueueCatalog(); syncFlush(); }, 4000);
}

async function syncPost(url, body, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST', redirect: 'follow', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('Respuesta no válida. Comprueba que la URL es la de la aplicación web (termina en /exec) y que el acceso es "Cualquier usuario".'); }
    if (!data.ok) throw new Error(data.error === 'token' ? 'Token incorrecto' : (data.error || 'Error en el script'));
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Tiempo de espera agotado');
    if (e instanceof TypeError) throw new Error('No se pudo conectar con el script. Comprueba la conexión a internet y la URL.');
    throw e;
  } finally { clearTimeout(timer); }
}

/** Prueba de conexión (GET con el token). */
async function syncTest(url, token) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}&ping=1`, { redirect: 'follow', signal: ctrl.signal });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('La URL no responde como el script del TPV. Revisa la publicación como aplicación web.'); }
    if (!data.ok) throw new Error(data.error === 'token' ? 'Token incorrecto' : (data.error || 'Error en el script'));
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Tiempo de espera agotado');
    if (e instanceof TypeError) throw new Error('No se pudo conectar con el script. Comprueba la conexión a internet y la URL.');
    throw e;
  } finally { clearTimeout(timer); }
}

/** Envía la cola pendiente. Devuelve { ok | skipped | empty | offline | busy | error, pending }. */
async function syncFlush({ manual = false } = {}) {
  if (!syncEnabled()) return { skipped: true };
  if (syncState.running) return { busy: true };
  let queue = await TPVDB.queueAll();
  if (!queue.length) { await refreshSyncPending(); return { empty: true, pending: 0 }; }
  if (!navigator.onLine && !manual) return { offline: true, pending: queue.length };
  syncState.running = true; syncState.lastAttempt = Date.now(); updateSyncBadge();
  try {
    const cfg = syncCfg();
    while (queue.length) {
      const batch = queue.slice(0, SYNC_BATCH);
      const res = await syncPost(cfg.url, { token: cfg.token, app: 'tpv-el-descanso', version: APP_VERSION, events: batch });
      const saved = (res.saved || []).filter((id) => batch.some((e) => e.id === id));
      if (saved.length) await TPVDB.queueDelete(saved);
      if (res.errors && res.errors.length) throw new Error(res.errors.map((x) => x.error).join(' · '));
      if (!saved.length) throw new Error('El script no confirmó ningún evento');
      queue = await TPVDB.queueAll();
    }
    syncState.lastOk = Date.now(); syncState.lastError = null;
    persistSyncState();
    await refreshSyncPending();
    return { ok: true, pending: 0 };
  } catch (e) {
    syncState.lastError = e.message || String(e);
    persistSyncState();
    await refreshSyncPending();
    return { error: syncState.lastError, pending: syncState.pending };
  } finally {
    syncState.running = false; updateSyncBadge();
  }
}

/** Reenvía todo el histórico (turnos cerrados con sus tickets), directamente y por lotes. */
async function syncSendAllHistory(onProgress) {
  if (!syncEnabled()) throw new Error('Activa y guarda primero la conexión con Google Sheets');
  const cfg = syncCfg();
  const turns = (await TPVDB.getTurns()).sort((a, b) => a.openedAt - b.openedAt);
  let done = 0;
  for (let i = 0; i < turns.length; i += 5) {
    const events = [];
    for (const t of turns.slice(i, i + 5)) {
      const tickets = await TPVDB.getTickets(t.id);
      events.push({ id: `hist-${t.id}`, type: 'cierre', ts: t.closedAt, data: { turno: t, tickets } });
    }
    const res = await syncPost(cfg.url, { token: cfg.token, app: 'tpv-el-descanso', version: APP_VERSION, events }, 60000);
    if (res.errors && res.errors.length) throw new Error(res.errors.map((x) => x.error).join(' · '));
    done += events.length;
    if (onProgress) onProgress(done, turns.length);
  }
  const moves = await TPVDB.getStockMoves(0);
  if (moves.length) {
    for (let i = 0; i < moves.length; i += 200) {
      await syncPost(cfg.url, { token: cfg.token, app: 'tpv-el-descanso', version: APP_VERSION, events: [{ id: `hist-moves-${i}`, type: 'inventario', ts: Date.now(), data: { movimientos: moves.slice(i, i + 200) } }] }, 60000);
    }
  }
  await syncPost(cfg.url, { token: cfg.token, app: 'tpv-el-descanso', version: APP_VERSION, events: [{ id: uid('cat'), type: 'catalogo', ts: Date.now(), data: catalogSnapshot() }] });
  syncState.lastOk = Date.now(); syncState.lastError = null; persistSyncState(); updateSyncBadge();
  return turns.length;
}

/** Después de cerrar un turno: cola + envío. */
async function syncAfterClosing(closedTurn, tickets, moves) {
  if (!syncEnabled()) return;
  try {
    await syncEnqueue('cierre', { turno: closedTurn, tickets });
    if (moves && moves.length) await syncEnqueue('inventario', { movimientos: moves });
    await syncEnqueueCatalog();
    const r = await syncFlush();
    if (r.ok) toast('Cierre enviado a Google Sheets', 'success');
    else if (r.offline || r.error) toast('Cierre guardado en cola. Se enviará a Google Sheets cuando haya conexión.', 'warn', 4500);
  } catch (e) { console.error(e); }
}

ACTIONS['sync-now'] = async () => {
  toast('Enviando…');
  const r = await syncFlush({ manual: true });
  if (r.ok || r.empty) toast(`Todo sincronizado con Google Sheets${syncState.lastOk ? ` · ${fmtTime(syncState.lastOk)}` : ''}`, 'success');
  else if (r.error) toast(`No se pudo enviar: ${r.error}`, 'error', 6000);
  else if (r.offline) toast('Sin conexión. Se enviará más tarde.', 'warn');
};
