/**
 * TPV El Descanso · receptor en Google Apps Script
 * ------------------------------------------------
 * Recibe de la app los cierres de turno (con sus tickets), el catálogo y los movimientos de
 * inventario, y los guarda en esta hoja de cálculo. Además deja un archivo JSON por cierre en
 * una carpeta de Google Drive.
 *
 * Hojas que crea automáticamente: Turnos, Tickets, Catálogo, Categorías e Inventario.
 *
 * INSTALACIÓN
 *  1. Crea una hoja de cálculo en Google Sheets.
 *  2. Extensiones → Apps Script. Borra el contenido, pega este archivo y cambia TOKEN.
 *  3. Implementar → Nueva implementación → Aplicación web.
 *       Ejecutar como: yo (tu cuenta).  Quién tiene acceso: Cualquier usuario.
 *  4. Autoriza los permisos y copia la URL que termina en /exec.
 *  5. En el TPV: Administración → Google Sheets → pega la URL y el token → Probar conexión → Guardar.
 *
 * Si cambias algo aquí después: Implementar → Gestionar implementaciones → ✎ → Versión: Nueva → Implementar.
 * (Si creas una implementación nueva en vez de editar la existente, la URL cambia.)
 *
 * El script es idempotente: si la app reenvía un cierre o un movimiento ya guardado, no se duplica.
 */

var TOKEN = 'cambia-este-token';                 // debe ser el mismo que en la app
var FOLDER_NAME = 'TPV El Descanso - cierres';   // carpeta de Drive para los JSON (se crea sola)

var SHEETS = {
  turnos: {
    name: 'Turnos',
    headers: ['ID turno', 'Apertura', 'Abierto por', 'Cierre', 'Cerrado por', 'Saldo inicial', 'Tickets', 'Artículos',
      'Recaudado', 'Efectivo esperado', 'Efectivo contado', 'Diferencia', 'Queda en caja', 'Retirado',
      'Invitaciones (uds)', 'Invitaciones (valor)', 'Tickets anulados', 'Importe anulado', 'Recibido'],
    money: [6, 9, 10, 11, 12, 13, 14, 16, 18], dates: [2, 4, 19], days: []
  },
  tickets: {
    name: 'Tickets',
    headers: ['ID turno', 'Nº ticket', 'Fecha', 'Hora', 'Vendedor', 'Producto', 'Categoría', 'Cantidad',
      'Precio unitario', 'Importe', 'Invitación', 'Anulado', 'Total ticket', 'Entregado', 'Cambio', 'ID ticket'],
    money: [9, 10, 13, 14, 15], dates: [], days: [3]
  },
  catalogo: {
    name: 'Catálogo',
    headers: ['ID', 'Categoría', 'Producto', 'Precio', 'Emoji', 'Visible', 'Controla stock', 'Stock', 'Mínimo', 'Orden', 'Actualizado'],
    money: [4], dates: [11], days: []
  },
  categorias: {
    name: 'Categorías',
    headers: ['ID', 'Nombre', 'Emoji', 'Color', 'Orden'],
    money: [], dates: [], days: []
  },
  inventario: {
    name: 'Inventario',
    headers: ['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Stock después', 'Quién', 'ID turno', 'Nota', 'ID movimiento'],
    money: [], dates: [1], days: []
  }
};

var MOVE_TYPES = { venta: 'Ventas del turno', reposicion: 'Reposición', ajuste: 'Ajuste / recuento' };

/* ---------- Puntos de entrada ---------- */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.token !== TOKEN) return json_({ ok: false, error: 'token' });
  return json_({ ok: true, hoja: SpreadsheetApp.getActive().getName(), hora: new Date().toISOString() });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'JSON no válido' }); }
  if (!body || body.token !== TOKEN) return json_({ ok: false, error: 'token' });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (err) { return json_({ ok: false, error: 'El script está ocupado, vuelve a intentarlo' }); }

  var saved = [], errors = [];
  try {
    (body.events || []).forEach(function (ev) {
      try { handleEvent_(ev); saved.push(ev.id); }
      catch (err) { errors.push({ id: ev.id, error: String((err && err.message) || err) }); }
    });
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true, saved: saved, errors: errors });
}

function handleEvent_(ev) {
  switch (ev.type) {
    case 'cierre': saveCierre_(ev.data); break;
    case 'catalogo': saveCatalogo_(ev.data); break;
    case 'inventario': saveInventario_(ev.data); break;
    default: throw new Error('Tipo de evento desconocido: ' + ev.type);
  }
}

/* ---------- Cierres de turno ---------- */

function saveCierre_(data) {
  var t = data && data.turno;
  var tickets = (data && data.tickets) || [];
  if (!t || !t.id) throw new Error('Cierre sin datos de turno');

  var shT = sheet_(SHEETS.turnos);
  if (!idSet_(shT, 1).has(t.id)) {
    shT.appendRow([
      t.id, date_(t.openedAt), t.openedByName || '', date_(t.closedAt), t.closedByName || '',
      eur_(t.openingCash), t.ticketsCount || 0, t.items || 0,
      eur_(t.salesTotal), eur_(t.expectedCash), eur_(t.countedCash), eur_(t.difference), eur_(t.leftInDrawer), eur_(t.withdrawn),
      t.invitationsUnits || 0, eur_(t.invitationsValue), t.voidedCount || 0, eur_(t.voidedAmount), new Date()
    ]);
  }

  var shK = sheet_(SHEETS.tickets);
  if (tickets.length && !idSet_(shK, 1).has(t.id)) {
    var rows = [];
    tickets.slice().sort(function (a, b) { return a.ts - b.ts; }).forEach(function (k) {
      (k.lines || []).forEach(function (l) {
        rows.push([
          t.id, k.n, date_(k.ts), time_(k.ts), k.userName || '', l.name, l.categoryName || '', l.qty,
          eur_(l.unitPrice), eur_(l.invitation ? 0 : l.unitPrice * l.qty), l.invitation ? 'Sí' : 'No', k.voided ? 'Sí' : 'No',
          eur_(k.total), eur_(k.paid), eur_(k.change), k.id
        ]);
      });
    });
    appendRows_(shK, rows);
  }

  saveJsonToDrive_('cierre_' + stamp_(t.openedAt) + '_' + t.id + '.json', data);
}

/* ---------- Catálogo (se reescribe entero con cada envío) ---------- */

function saveCatalogo_(data) {
  var when = date_((data && data.generadoEn) || Date.now());
  var rows = ((data && data.productos) || []).map(function (p) {
    return [p.id, p.categoria || '', p.nombre, eur_(p.precio), p.emoji || '', p.visible ? 'Sí' : 'No',
      p.controlaStock ? 'Sí' : 'No', p.controlaStock ? p.stock : '', p.minimo == null ? '' : p.minimo, p.orden || 0, when];
  });
  rewrite_(sheet_(SHEETS.catalogo), rows);
  rewrite_(sheet_(SHEETS.categorias), ((data && data.categorias) || []).map(function (c) {
    return [c.id, c.nombre, c.emoji || '', c.color || '', c.orden || 0];
  }));
}

/* ---------- Inventario (movimientos, se añaden sin duplicar) ---------- */

function saveInventario_(data) {
  var sh = sheet_(SHEETS.inventario);
  var existing = idSet_(sh, 9);
  var rows = ((data && data.movimientos) || []).filter(function (m) {
    return m && m.id && !existing.has(String(m.id));
  }).map(function (m) {
    return [date_(m.ts), m.name || '', MOVE_TYPES[m.type] || m.type, m.qty, m.stockAfter, m.userName || '', m.turnId || '', m.note || '', m.id];
  });
  appendRows_(sh, rows);
}

/* ---------- Utilidades ---------- */

function sheet_(def) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    def.money.forEach(function (c) { sh.getRange(col_(c) + '2:' + col_(c)).setNumberFormat('#,##0.00 €'); });
    def.dates.forEach(function (c) { sh.getRange(col_(c) + '2:' + col_(c)).setNumberFormat('dd/MM/yyyy HH:mm'); });
    def.days.forEach(function (c) { sh.getRange(col_(c) + '2:' + col_(c)).setNumberFormat('dd/MM/yyyy'); });
  }
  return sh;
}

function appendRows_(sh, rows) {
  if (!rows.length) return;
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function rewrite_(sh, rows) {
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, sh.getLastColumn()).clearContent();
  appendRows_(sh, rows);
}

/** Conjunto de valores de una columna (para no duplicar filas al reintentar). */
function idSet_(sh, col) {
  var set = new Set();
  var last = sh.getLastRow();
  if (last < 2) return set;
  sh.getRange(2, col, last - 1, 1).getValues().forEach(function (r) { if (r[0] !== '') set.add(String(r[0])); });
  return set;
}

function saveJsonToDrive_(name, data) {
  var folder = folder_();
  if (folder.getFilesByName(name).hasNext()) return;
  folder.createFile(name, JSON.stringify(data, null, 1), 'application/json');
}

function folder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function col_(n) { // 1 → A, 27 → AA
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); }
function eur_(c) { return (c == null || c === '') ? '' : Math.round(c) / 100; }   // céntimos → euros
function date_(ts) { return ts ? new Date(ts) : ''; }
function time_(ts) { return ts ? Utilities.formatDate(new Date(ts), tz_(), 'HH:mm') : ''; }
function stamp_(ts) { return Utilities.formatDate(new Date(ts || Date.now()), tz_(), 'yyyy-MM-dd_HHmm'); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
