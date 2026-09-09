/* Cálculo y presentación del informe de cierre de turno (sin IVA: importes netos). */
'use strict';

/**
 * Calcula el informe de un turno a partir de sus tickets.
 * turnObj: { id, openedAt, openedByName, closedAt?, closedByName?, openingCash }
 * opts:    { countedCash, leftInDrawer }  (céntimos)
 */
function computeReport(turnObj, tickets, opts = {}) {
  const valid = tickets.filter((t) => !t.voided);
  const voided = tickets.filter((t) => t.voided);
  const salesTotal = sum(valid, (t) => t.total);

  let items = 0;
  const invitations = { units: 0, value: 0 };
  const byProduct = {}, byCategory = {}, byUser = {};

  valid.forEach((t) => {
    t.lines.forEach((l) => {
      const amount = l.invitation ? 0 : l.unitPrice * l.qty;
      items += l.qty;
      if (l.invitation) { invitations.units += l.qty; invitations.value += l.unitPrice * l.qty; }
      const pk = l.productId || l.name;
      const p = byProduct[pk] || (byProduct[pk] = { productId: l.productId || null, name: l.name, emoji: l.emoji || '', categoryName: l.categoryName || '', units: 0, amount: 0, invitations: 0 });
      p.units += l.qty; p.amount += amount; if (l.invitation) p.invitations += l.qty;
      const ck = l.categoryId || l.categoryName || 'otros';
      const c = byCategory[ck] || (byCategory[ck] = { name: l.categoryName || 'Otros', units: 0, amount: 0 });
      c.units += l.qty; c.amount += amount;
    });
    const u = byUser[t.userId] || (byUser[t.userId] = { name: t.userName, tickets: 0, amount: 0 });
    u.tickets += 1; u.amount += t.total;
  });

  const countedCash = opts.countedCash ?? turnObj.countedCash ?? null;
  const leftInDrawer = opts.leftInDrawer ?? turnObj.leftInDrawer ?? null;
  const expectedCash = turnObj.openingCash + salesTotal;

  return {
    turnId: turnObj.id,
    openedAt: turnObj.openedAt,
    openedByName: turnObj.openedByName,
    closedAt: opts.closedAt ?? turnObj.closedAt ?? null,
    closedByName: opts.closedByName ?? turnObj.closedByName ?? null,
    openingCash: turnObj.openingCash,
    salesTotal,
    ticketsCount: valid.length,
    avgTicket: valid.length ? Math.round(salesTotal / valid.length) : 0,
    items,
    invitations,
    voided: { count: voided.length, amount: sum(voided, (t) => t.total) },
    expectedCash,
    countedCash,
    difference: countedCash == null ? null : countedCash - expectedCash,
    leftInDrawer,
    withdrawn: (countedCash == null || leftInDrawer == null) ? null : countedCash - leftInDrawer,
    byProduct: Object.values(byProduct).sort((a, b) => b.amount - a.amount || b.units - a.units),
    byCategory: Object.values(byCategory).sort((a, b) => b.amount - a.amount),
    byUser: Object.values(byUser).sort((a, b) => b.amount - a.amount),
    firstTicket: valid.length ? Math.min(...valid.map((t) => t.n)) : null,
    lastTicket: valid.length ? Math.max(...valid.map((t) => t.n)) : null
  };
}

function differenceLabel(diff) {
  if (diff == null) return { text: '—', cls: '' };
  if (diff === 0) return { text: 'Cuadra', cls: 'ok' };
  if (diff > 0) return { text: `Sobran ${eur(diff)}`, cls: 'warn' };
  return { text: `Faltan ${eur(-diff)}`, cls: 'bad' };
}

function renderReportHTML(rep, clubName) {
  const d = differenceLabel(rep.difference);
  const row = (label, value, cls = '') => `<div class="rep-row ${cls}"><span>${label}</span><strong>${value}</strong></div>`;
  return `
    <div class="rep-head">
      <div class="rep-title">${esc(clubName)} · Informe de cierre de turno</div>
      <div class="rep-meta">
        <div><span class="muted">Apertura</span><br><strong>${fmtDateTime(rep.openedAt)}</strong> · ${esc(rep.openedByName || '')}</div>
        <div><span class="muted">Cierre</span><br><strong>${rep.closedAt ? fmtDateTime(rep.closedAt) : fmtDateTime(Date.now())}</strong> · ${esc(rep.closedByName || '')}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi"><span>Total recaudado</span><strong>${eur(rep.salesTotal)}</strong><small>${rep.ticketsCount} tickets · ${rep.items} artículos</small></div>
      <div class="kpi"><span>Saldo inicial</span><strong>${eur(rep.openingCash)}</strong><small>efectivo base del cajón</small></div>
      <div class="kpi"><span>Efectivo esperado</span><strong>${eur(rep.expectedCash)}</strong><small>inicial + recaudado</small></div>
      <div class="kpi kpi-${d.cls}"><span>Cuadre</span><strong>${d.text}</strong><small>${rep.countedCash == null ? 'sin arqueo' : `contado ${eur(rep.countedCash)}`}</small></div>
    </div>

    <div class="rep-cols">
      <section class="rep-card">
        <h4>Caja</h4>
        ${row('Saldo inicial', eur(rep.openingCash))}
        ${row('Ventas en efectivo', `+ ${eur(rep.salesTotal)}`)}
        ${row('Efectivo esperado', eur(rep.expectedCash), 'total')}
        ${row('Efectivo contado', rep.countedCash == null ? '—' : eur(rep.countedCash))}
        ${row('Diferencia', d.text, `diff ${d.cls}`)}
        ${rep.leftInDrawer == null ? '' : row('Queda en caja para el siguiente turno', eur(rep.leftInDrawer))}
        ${rep.withdrawn == null ? '' : row('Efectivo retirado', eur(rep.withdrawn), 'total')}
      </section>
      <section class="rep-card">
        <h4>Ventas</h4>
        ${row('Tickets cobrados', String(rep.ticketsCount))}
        ${row('Ticket medio', eur(rep.avgTicket))}
        ${row('Artículos vendidos', String(rep.items))}
        ${row('Invitaciones', `${rep.invitations.units} uds · ${eur(rep.invitations.value)} de valor`)}
        ${row('Tickets anulados', `${rep.voided.count} · ${eur(rep.voided.amount)}`)}
        ${rep.firstTicket ? row('Numeración', `#${rep.firstTicket} – #${rep.lastTicket}`) : ''}
      </section>
    </div>

    <div class="rep-cols">
      <section class="rep-card">
        <h4>Por categoría</h4>
        ${rep.byCategory.length ? `<table class="table"><thead><tr><th>Categoría</th><th class="num">Uds</th><th class="num">Importe</th></tr></thead><tbody>
          ${rep.byCategory.map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${c.units}</td><td class="num">${eur(c.amount)}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">Sin ventas.</p>'}
      </section>
      ${rep.byUser.length > 1 ? `<section class="rep-card">
        <h4>Por persona</h4>
        <table class="table"><thead><tr><th>Persona</th><th class="num">Tickets</th><th class="num">Importe</th></tr></thead><tbody>
          ${rep.byUser.map((u) => `<tr><td>${esc(u.name)}</td><td class="num">${u.tickets}</td><td class="num">${eur(u.amount)}</td></tr>`).join('')}
        </tbody></table>
      </section>` : ''}
    </div>

    <section class="rep-card">
      <h4>Por producto</h4>
      ${rep.byProduct.length ? `<table class="table"><thead><tr><th>Producto</th><th>Categoría</th><th class="num">Uds</th><th class="num">Invit.</th><th class="num">Importe</th></tr></thead><tbody>
        ${rep.byProduct.map((p) => `<tr><td>${esc(p.emoji)} ${esc(p.name)}</td><td class="muted">${esc(p.categoryName)}</td><td class="num">${p.units}</td><td class="num">${p.invitations || ''}</td><td class="num">${eur(p.amount)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Sin ventas.</p>'}
    </section>
    ${rep.lowStock && rep.lowStock.length ? `<section class="rep-card rep-low">
      <h4>Stock bajo mínimo</h4>
      <table class="table"><thead><tr><th>Producto</th><th class="num">Quedan</th><th class="num">Mínimo</th></tr></thead><tbody>
        ${rep.lowStock.map((s) => `<tr><td>${esc(s.emoji)} ${esc(s.name)}</td><td class="num ${s.level === 'out' ? 'txt-bad' : 'txt-warn'}"><strong>${s.stock}</strong></td><td class="num muted">${s.minStock == null ? '—' : s.minStock}</td></tr>`).join('')}
      </tbody></table>
    </section>` : ''}`;
}

/** Versión en texto plano para compartir por WhatsApp / email. */
function reportText(rep, clubName) {
  const d = differenceLabel(rep.difference);
  const L = [];
  L.push(`*${clubName} · Cierre de turno*`);
  L.push(`Apertura: ${fmtDateTime(rep.openedAt)} (${rep.openedByName || ''})`);
  L.push(`Cierre: ${fmtDateTime(rep.closedAt || Date.now())} (${rep.closedByName || ''})`);
  L.push('');
  L.push('*CAJA*');
  L.push(`Saldo inicial: ${eur(rep.openingCash)}`);
  L.push(`Total recaudado: ${eur(rep.salesTotal)} (${rep.ticketsCount} tickets)`);
  L.push(`Efectivo esperado: ${eur(rep.expectedCash)}`);
  L.push(`Efectivo contado: ${rep.countedCash == null ? '—' : eur(rep.countedCash)}`);
  L.push(`Cuadre: ${d.text}`);
  if (rep.leftInDrawer != null) L.push(`Queda en caja: ${eur(rep.leftInDrawer)}`);
  if (rep.withdrawn != null) L.push(`Retirado: ${eur(rep.withdrawn)}`);
  L.push('');
  L.push('*VENTAS*');
  L.push(`Artículos: ${rep.items} · Ticket medio: ${eur(rep.avgTicket)}`);
  L.push(`Invitaciones: ${rep.invitations.units} uds (${eur(rep.invitations.value)})`);
  L.push(`Anulados: ${rep.voided.count} (${eur(rep.voided.amount)})`);
  if (rep.byCategory.length) {
    L.push('');
    L.push('*POR CATEGORÍA*');
    rep.byCategory.forEach((c) => L.push(`${c.name}: ${c.units} uds · ${eur(c.amount)}`));
  }
  if (rep.byProduct.length) {
    L.push('');
    L.push('*POR PRODUCTO*');
    rep.byProduct.forEach((p) => L.push(`${p.units}× ${p.name}${p.invitations ? ` (${p.invitations} inv.)` : ''} · ${eur(p.amount)}`));
  }
  if (rep.byUser.length > 1) {
    L.push('');
    L.push('*POR PERSONA*');
    rep.byUser.forEach((u) => L.push(`${u.name}: ${u.tickets} tickets · ${eur(u.amount)}`));
  }
  if (rep.lowStock && rep.lowStock.length) {
    L.push('');
    L.push('*STOCK BAJO MÍNIMO*');
    rep.lowStock.forEach((s) => L.push(`${s.name}: quedan ${s.stock}${s.minStock != null ? ` (mínimo ${s.minStock})` : ''}`));
  }
  return L.join('\n');
}

/** CSV de tickets (una fila por línea de ticket). `turnsById` permite añadir datos del turno. */
function ticketsCSV(tickets, turnsById = {}) {
  const rows = [[
    'Turno', 'Apertura turno', 'Responsable turno', 'Nº ticket', 'Fecha', 'Hora', 'Vendedor',
    'Producto', 'Categoría', 'Cantidad', 'Precio unitario', 'Importe', 'Invitación', 'Anulado', 'Total ticket', 'Entregado', 'Cambio'
  ]];
  tickets.slice().sort((a, b) => a.ts - b.ts).forEach((t) => {
    const turn = turnsById[t.turnId] || {};
    t.lines.forEach((l) => rows.push([
      t.turnId, turn.openedAt ? fmtDateTime(turn.openedAt) : '', turn.openedByName || '',
      t.n, fmtDate(t.ts), fmtTime(t.ts), t.userName,
      l.name, l.categoryName || '', l.qty, eurPlain(l.unitPrice), eurPlain(l.invitation ? 0 : l.unitPrice * l.qty),
      l.invitation ? 'Sí' : 'No', t.voided ? 'Sí' : 'No', eurPlain(t.total), eurPlain(t.paid), eurPlain(t.change)
    ]));
  });
  return csvDocument(rows);
}

/** CSV resumen de turnos cerrados (una fila por turno). */
function turnsCSV(turns) {
  const rows = [[
    'Turno', 'Apertura', 'Abierto por', 'Cierre', 'Cerrado por', 'Saldo inicial', 'Tickets', 'Artículos',
    'Total recaudado', 'Efectivo esperado', 'Efectivo contado', 'Diferencia', 'Queda en caja', 'Retirado',
    'Invitaciones (uds)', 'Invitaciones (valor)', 'Tickets anulados', 'Importe anulado'
  ]];
  turns.slice().sort((a, b) => a.openedAt - b.openedAt).forEach((t) => rows.push([
    t.id, fmtDateTime(t.openedAt), t.openedByName, fmtDateTime(t.closedAt), t.closedByName,
    eurPlain(t.openingCash), t.ticketsCount, t.items,
    eurPlain(t.salesTotal), eurPlain(t.expectedCash), eurPlain(t.countedCash), eurPlain(t.difference),
    eurPlain(t.leftInDrawer), eurPlain(t.withdrawn),
    t.invitationsUnits, eurPlain(t.invitationsValue), t.voidedCount, eurPlain(t.voidedAmount)
  ]));
  return csvDocument(rows);
}
