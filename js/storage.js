/*
 * Almacenamiento local.
 *  - localStorage: configuración y turno abierto (datos "calientes", acceso síncrono).
 *  - IndexedDB:    histórico de turnos cerrados y sus tickets, movimientos de inventario
 *                  y cola de envíos pendientes a Google Sheets.
 * Todo se guarda como documentos JSON y se puede exportar/importar desde Administración.
 */
'use strict';

const LS_CONFIG = 'tpv.config';
const LS_TURN = 'tpv.turn';

function lsLoad(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('No se pudo leer', key, e);
    return fallback;
  }
}

function lsSave(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('No se pudo guardar', key, e);
    if (typeof toast === 'function') toast('¡Atención! No se pudo guardar en el dispositivo. Haz una copia de seguridad.', 'error', 6000);
    return false;
  }
}

const TPVDB = (() => {
  const NAME = 'tpv-el-descanso';
  const VERSION = 2;
  const STORES = ['turns', 'tickets', 'stockMoves', 'syncQueue'];
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res, rej) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('turns')) db.createObjectStore('turns', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('tickets')) {
          const s = db.createObjectStore('tickets', { keyPath: 'id' });
          s.createIndex('turnId', 'turnId', { unique: false });
        }
        if (!db.objectStoreNames.contains('stockMoves')) {
          const s = db.createObjectStore('stockMoves', { keyPath: 'id' });
          s.createIndex('ts', 'ts', { unique: false });
        }
        if (!db.objectStoreNames.contains('syncQueue')) db.createObjectStore('syncQueue', { keyPath: 'id' });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbPromise;
  }

  const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  async function tx(stores, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(stores, mode);
      let out;
      try { out = fn(t); } catch (e) { rej(e); return; }
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Transacción abortada'));
    });
  }

  const getAll = async (store) => wrap((await open()).transaction(store).objectStore(store).getAll());

  return {
    open,
    /* --- turnos y tickets --- */
    saveClosedTurn: (turn, tickets) => tx(['turns', 'tickets'], 'readwrite', (t) => {
      t.objectStore('turns').put(turn);
      const s = t.objectStore('tickets');
      tickets.forEach((k) => s.put(k));
    }),
    getTurns: () => getAll('turns'),
    getTurn: async (id) => wrap((await open()).transaction('turns').objectStore('turns').get(id)),
    getTickets: async (turnId) => wrap((await open()).transaction('tickets').objectStore('tickets').index('turnId').getAll(turnId)),
    getAllTickets: () => getAll('tickets'),
    /* --- inventario --- */
    addStockMoves: (moves) => tx(['stockMoves'], 'readwrite', (t) => { const s = t.objectStore('stockMoves'); moves.forEach((m) => s.put(m)); }),
    getStockMoves: async (limit = 100) => {
      const all = await getAll('stockMoves');
      all.sort((a, b) => b.ts - a.ts);
      return limit ? all.slice(0, limit) : all;
    },
    /* --- cola de sincronización --- */
    queueAdd: (ev) => tx(['syncQueue'], 'readwrite', (t) => { t.objectStore('syncQueue').put(ev); }),
    queueAll: async () => { const q = await getAll('syncQueue'); q.sort((a, b) => a.ts - b.ts); return q; },
    queueCount: async () => wrap((await open()).transaction('syncQueue').objectStore('syncQueue').count()),
    queueDelete: (ids) => tx(['syncQueue'], 'readwrite', (t) => { const s = t.objectStore('syncQueue'); ids.forEach((id) => s.delete(id)); }),
    queueClear: () => tx(['syncQueue'], 'readwrite', (t) => { t.objectStore('syncQueue').clear(); }),
    /* --- mantenimiento --- */
    clearHistory: () => tx(['turns', 'tickets', 'stockMoves'], 'readwrite', (t) => {
      t.objectStore('turns').clear();
      t.objectStore('tickets').clear();
      t.objectStore('stockMoves').clear();
    }),
    clearAll: () => tx(STORES, 'readwrite', (t) => STORES.forEach((s) => t.objectStore(s).clear())),
    importAll: (turns, tickets, stockMoves) => tx(['turns', 'tickets', 'stockMoves'], 'readwrite', (t) => {
      const st = t.objectStore('turns');
      const sk = t.objectStore('tickets');
      const sm = t.objectStore('stockMoves');
      (turns || []).forEach((x) => st.put(x));
      (tickets || []).forEach((x) => sk.put(x));
      (stockMoves || []).forEach((x) => sm.put(x));
    })
  };
})();
