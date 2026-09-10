/*
 * TPV El Descanso · generador de códigos QR
 * -----------------------------------------
 * Lo justo para pintar el enlace de alta en la pantalla y que otra tablet lo lea con la cámara:
 * modo byte (UTF-8), corrección de errores nivel M y versiones 1 a 13 (hasta 334 bytes), que da
 * de sobra para una URL con la dirección del script y el token.
 *
 * Está a mano y no con una librería por lo mismo que el resto del proyecto: sin dependencias y sin
 * CDN. Y sobre todo, sin mandar el enlace a ningún servicio de QR por internet: ese enlace es la
 * contraseña de la hoja, así que no puede salir del dispositivo.
 *
 * Referencia: ISO/IEC 18004. Se ha comprobado que el resultado lo lee un lector real.
 */
'use strict';

const QR = (() => {
  /* ---------- Reed-Solomon sobre GF(256) ---------- */

  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  /** Polinomio generador para `n` palabras de corrección: producto de (x - α^i). */
  function genPoly(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
      g = next;
    }
    return g;
  }

  /** Palabras de corrección de un bloque de datos (resto de la división por el generador). */
  function ecc(data, n) {
    const g = genPoly(n);
    const res = data.concat(new Array(n).fill(0));
    for (let i = 0; i < data.length; i++) {
      const c = res[i];
      if (!c) continue;
      for (let j = 0; j < g.length; j++) res[i + j] ^= mul(g[j], c);
    }
    return res.slice(data.length);
  }

  /*
   * Reparto en bloques del nivel M, versión por versión: [palabras de corrección por bloque,
   * [[nº de bloques, palabras de datos por bloque], …]] (tabla 9 de la norma).
   */
  const RS = {
    1: [10, [[1, 16]]],
    2: [16, [[1, 28]]],
    3: [26, [[1, 44]]],
    4: [18, [[2, 32]]],
    5: [24, [[2, 43]]],
    6: [16, [[4, 27]]],
    7: [18, [[4, 31]]],
    8: [22, [[2, 38], [2, 39]]],
    9: [22, [[3, 36], [2, 37]]],
    10: [26, [[4, 43], [1, 44]]],
    11: [30, [[1, 50], [4, 51]]],
    12: [22, [[6, 36], [2, 37]]],
    13: [22, [[8, 37], [1, 38]]]
  };

  /** Centros de los patrones de alineación de cada versión. */
  const ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
    11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62]
  };

  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
    (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0
  ];

  const dataWords = (v) => RS[v][1].reduce((n, [b, d]) => n + b * d, 0);

  /** Versión más pequeña en la que caben `len` bytes, o 0 si no cabe en ninguna. */
  function pickVersion(len) {
    for (let v = 1; v <= 13; v++) {
      if (4 + (v < 10 ? 8 : 16) + len * 8 <= dataWords(v) * 8) return v;
    }
    return 0;
  }

  /** Cabecera + datos + relleno hasta llenar la capacidad de la versión. */
  function codewords(data, v) {
    const total = dataWords(v);
    const bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(0b0100, 4);                       // modo byte
    push(data.length, v < 10 ? 8 : 16);
    data.forEach((b) => push(b, 8));
    for (let i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0);   // terminador
    while (bits.length % 8) bits.push(0);
    const cw = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      cw.push(b);
    }
    for (let i = 0; cw.length < total; i++) cw.push(i % 2 ? 0x11 : 0xEC);   // relleno de la norma
    return cw;
  }

  /** Entrelaza los bloques de datos y los de corrección en el orden en que se pintan. */
  function interleave(cw, v) {
    const [ecn, groups] = RS[v];
    const blocks = [];
    let i = 0;
    groups.forEach(([n, d]) => { for (let k = 0; k < n; k++) { blocks.push(cw.slice(i, i + d)); i += d; } });
    const eccs = blocks.map((b) => ecc(b, ecn));
    const out = [];
    const maxD = Math.max(...blocks.map((b) => b.length));
    for (let c = 0; c < maxD; c++) blocks.forEach((b) => { if (c < b.length) out.push(b[c]); });
    for (let c = 0; c < ecn; c++) eccs.forEach((e) => out.push(e[c]));
    return out;
  }

  /* ---------- Dibujo de la cuadrícula ---------- */

  /*
   * `fixed` marca los módulos que son estructura (buscadores, temporizadores, alineación y las
   * reservas de formato y versión): el recorrido de los datos los salta, y la máscara no los toca.
   */
  function build(v, words, mask) {
    const n = 17 + v * 4;
    const m = [], fixed = [];
    for (let i = 0; i < n; i++) { m.push(new Array(n).fill(0)); fixed.push(new Array(n).fill(false)); }
    const set = (r, c, val) => {
      if (r < 0 || c < 0 || r >= n || c >= n) return;
      m[r][c] = val ? 1 : 0; fixed[r][c] = true;
    };

    // Buscadores de las tres esquinas, con su separador en blanco alrededor.
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(([r0, c0]) => {
      for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
        const dentro = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const d = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        set(r0 + dr, c0 + dc, dentro && d !== 2);
      }
    });

    // Temporizadores: la fila y la columna 6, alternando entre los buscadores.
    for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }

    // Alineación, saltando los tres cruces que caerían sobre un buscador.
    const al = ALIGN[v], ult = al[al.length - 1];
    al.forEach((r) => al.forEach((c) => {
      if ((r === 6 && c === 6) || (r === 6 && c === ult) || (r === ult && c === 6)) return;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    }));

    // Módulo oscuro fijo y reserva de las dos copias de la información de formato.
    set(n - 8, 8, 1);
    for (let i = 0; i < 9; i++) { if (!fixed[8][i]) set(8, i, 0); if (!fixed[i][8]) set(i, 8, 0); }
    for (let i = 0; i < 8; i++) { if (!fixed[8][n - 1 - i]) set(8, n - 1 - i, 0); if (!fixed[n - 1 - i][8]) set(n - 1 - i, 8, 0); }
    if (v >= 7) {
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { set(n - 11 + j, i, 0); set(i, n - 11 + j, 0); }
    }

    // Datos: columnas de dos en dos desde la esquina inferior derecha, en zigzag.
    const bits = [];
    words.forEach((b) => { for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1); });
    const mk = MASKS[mask];
    let bit = 0, arriba = true;
    for (let c = n - 1; c > 0; c -= 2) {
      if (c === 6) c--;                    // la columna del temporizador no cuenta como columna
      for (let k = 0; k < n; k++) {
        const r = arriba ? n - 1 - k : k;
        for (const cc of [c, c - 1]) {
          if (fixed[r][cc]) continue;
          const val = bit < bits.length ? bits[bit++] : 0;
          m[r][cc] = mk(r, cc) ? val ^ 1 : val;
        }
      }
      arriba = !arriba;
    }

    // Información de formato: nivel M (00) y máscara, con su BCH(15,5).
    const d = (0b00 << 3) | mask;
    let rem = d << 10;
    for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
    const fmt = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i < 15; i++) {
      const b = (fmt >> i) & 1;
      // Copia de al lado del buscador de arriba a la izquierda: baja por la columna 8 y sigue por la fila 8.
      if (i < 6) m[i][8] = b;
      else if (i === 6) m[7][8] = b;
      else if (i === 7) m[8][8] = b;
      else if (i === 8) m[8][7] = b;
      else m[8][14 - i] = b;
      // Segunda copia, repartida entre las otras dos esquinas.
      if (i < 8) m[8][n - 1 - i] = b;
      else m[n - 15 + i][8] = b;
    }

    // Información de versión, solo de la 7 en adelante, con su BCH(18,6).
    if (v >= 7) {
      let vr = v << 12;
      for (let i = 17; i >= 12; i--) if ((vr >> i) & 1) vr ^= 0x1F25 << (i - 12);
      const vi = (v << 12) | vr;
      for (let i = 0; i < 18; i++) {
        const b = (vi >> i) & 1;
        m[n - 11 + (i % 3)][Math.floor(i / 3)] = b;
        m[Math.floor(i / 3)][n - 11 + (i % 3)] = b;
      }
    }
    return m;
  }

  /*
   * Penalización de la norma, para elegir entre las ocho máscaras. No hace falta para que el
   * código sea válido —la máscara elegida va escrita en la información de formato—, pero evita
   * dibujos que se parezcan a un buscador y que despistan a los lectores.
   */
  function penalty(m) {
    const n = m.length;
    let p = 0;

    const racha = (get) => {
      for (let a = 0; a < n; a++) {
        let run = 1;
        for (let b = 1; b < n; b++) {
          if (get(a, b) === get(a, b - 1)) { run++; continue; }
          if (run >= 5) p += 3 + (run - 5);
          run = 1;
        }
        if (run >= 5) p += 3 + (run - 5);
      }
    };
    racha((a, b) => m[a][b]);
    racha((a, b) => m[b][a]);

    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
    }

    const PAT = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const busca = (get) => {
      for (let a = 0; a < n; a++) for (let b = 0; b + 11 <= n; b++) {
        let igual = true;
        for (let k = 0; k < 11; k++) if (get(a, b + k) !== PAT[k]) { igual = false; break; }
        if (igual) { p += 40; continue; }
        igual = true;
        for (let k = 0; k < 11; k++) if (get(a, b + k) !== PAT[10 - k]) { igual = false; break; }
        if (igual) p += 40;
      }
    };
    busca((a, b) => m[a][b]);
    busca((a, b) => m[b][a]);

    let oscuros = 0;
    m.forEach((fila) => fila.forEach((v) => { if (v) oscuros++; }));
    p += Math.floor(Math.abs(oscuros * 100 / (n * n) - 50) / 5) * 10;
    return p;
  }

  /** Cuadrícula de 0 y 1 del texto dado (sin margen), o null si no cabe. */
  function matrix(text) {
    const data = Array.from(new TextEncoder().encode(String(text)));
    const v = pickVersion(data.length);
    if (!v) return null;
    const words = interleave(codewords(data, v), v);
    let mejor = null, mejorP = Infinity;
    for (let k = 0; k < 8; k++) {
      const m = build(v, words, k);
      const p = penalty(m);
      if (p < mejorP) { mejorP = p; mejor = m; }
    }
    return mejor;
  }

  /**
   * Dibuja el texto como QR en un canvas. `scale` son los píxeles de cada módulo y `quiet` el
   * margen blanco en módulos (la norma pide 4: sin él muchos lectores no lo encuentran).
   */
  function canvas(text, { scale = 6, quiet = 4 } = {}) {
    const m = matrix(text);
    if (!m) return null;
    const n = m.length, lado = (n + quiet * 2) * scale;
    const cv = document.createElement('canvas');
    cv.width = cv.height = lado;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lado, lado);
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (m[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
    return cv;
  }

  return { matrix, canvas };
})();
