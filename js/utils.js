/* Utilidades generales: formato de importes, fechas, escape de HTML, etc. */
'use strict';

/** Registro global de acciones de botones (data-action). Se rellena en app.js y admin.js. */
const ACTIONS = {};

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const _fmtEur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/** Céntimos → "1,50 €" */
const eur = (cents) => _fmtEur.format((cents || 0) / 100);

/** Céntimos → "1,50" (para CSV, sin símbolo) */
const eurPlain = (cents) => ((cents || 0) / 100).toFixed(2).replace('.', ',');

/** Céntimos → texto para el teclado numérico ("3,70", "5") */
const centsToInput = (cents) => ((cents || 0) / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');

/** Texto del teclado ("12,5") → céntimos (1250). Admite punto o coma. */
function parseAmountStr(str) {
  if (!str) return 0;
  const n = parseFloat(String(str).replace(/\s|€/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const fmtDate = (ts) => new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const fmtDateTime = (ts) => `${fmtDate(ts)} ${fmtTime(ts)}`;
const fmtDateLong = (ts) => new Date(ts).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Fecha para nombres de archivo: 2026-09-08_1830 */
function fileStamp(ts = Date.now()) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

const uid = (prefix = '') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const clone = (o) => JSON.parse(JSON.stringify(o));

const sum = (arr, fn) => arr.reduce((acc, x) => acc + (fn ? fn(x) : x), 0);

function vibrate(pattern) {
  try {
    if (typeof config !== 'undefined' && config && config.settings && config.settings.vibrate === false) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* sin soporte */ }
}

/** Color de avatar determinista a partir de un texto. */
function avatarColor(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return `hsl(${h} 45% 45%)`;
}

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/** Descarga un archivo de texto generado en el navegador. */
function downloadFile(name, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 3000);
}

/** Comparte un texto con el menú del sistema; si no es posible, lo copia al portapapeles. */
async function shareText(title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return true; }
    catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  try { await navigator.clipboard.writeText(text); toast('Informe copiado al portapapeles'); return true; }
  catch (e) { toast('No se pudo compartir en este dispositivo', 'error'); return false; }
}

/** Comparte un archivo si el dispositivo lo permite; si no, lo descarga. */
async function shareOrDownloadFile(name, content, mime) {
  try {
    const file = new File([content], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  downloadFile(name, content, mime);
}

/** Línea CSV con separador ";" (formato Excel en español). */
function csvLine(values) {
  return values.map((v) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';');
}

const csvDocument = (rows) => '﻿' + rows.map(csvLine).join('\r\n');

/** Lee un archivo del <input type="file"> como texto. */
const readFileText = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsText(file);
});

/** Convierte una imagen a data URL cuadrada de tamaño máximo `max` px. */
function imageFileToDataUrl(file, max = 256) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Imagen no válida')); };
    img.src = url;
  });
}
