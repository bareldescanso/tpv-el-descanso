# TPV El Descanso

Terminal punto de venta para el bar del club, pensado para una **tablet Android en horizontal**.
No tiene servidor propio ni base de datos: es una web estática (HTML, CSS y JavaScript sin dependencias)
que se instala como aplicación y funciona **sin conexión** una vez cargada. Opcionalmente envía los
cierres, el catálogo y el inventario a una **hoja de Google Sheets** mediante un script gratuito de Apps Script.

## Qué hace

- **Acceso**: cada persona que atiende la barra entra con su nombre y un PIN de 4 dígitos.
  Hay un PIN de administrador aparte para la configuración.
- **Apertura de turno**: pide el saldo inicial de caja y propone el efectivo que se dejó en el cierre anterior.
- **Ventas**: pestañas por categoría, cuadrícula táctil de productos y ticket lateral con cantidades,
  borrado de líneas e **invitaciones** (línea a 0 € que queda registrada en el informe).
- **Cobro solo en efectivo**: importe entregado con teclado numérico o botones rápidos (exacto, 5, 10, 20, 50 €)
  y **cambio a devolver en grande** a pantalla completa.
- **Tickets del turno**: consulta y anulación (se registra quién anula y cuándo).
- **Cierre de turno**: arqueo por billetes y monedas (o total a mano) e informe con total recaudado,
  saldo inicial, efectivo esperado, efectivo contado y **cuadre**. Se indica cuánto efectivo queda en caja
  para el siguiente turno y cuánto se retira. El informe se puede compartir (WhatsApp, email…) y exportar a CSV.
- **Inventario opcional**: para los productos que elijas, el stock se descuenta con cada venta e invitación,
  se recupera al anular, se repone desde Administración y avisa en el botón y en el informe cuando baja del mínimo.
- **Histórico** de turnos cerrados con su informe y exportación CSV (resumen de turnos y detalle de tickets).
- **Copias automáticas**: al cerrar cada turno se descarga un JSON (y opcionalmente el CSV) a la carpeta Descargas.
- **Google Sheets**: envío automático de cierres, tickets, catálogo e inventario a una hoja de cálculo de tu Drive,
  con cola de reintentos si no hay conexión. El script deja además un JSON por cierre en una carpeta de Drive.
- **Administración**: productos, categorías, inventario, usuarios, nombre y logo del club, ajustes, Google Sheets
  y copias de seguridad.
- **Sin IVA**: los precios son netos y finales; no se calculan bases imponibles ni impuestos.

## Puesta en marcha

### Probar en el ordenador

```bash
cd tpv-el-descanso && python3 -m http.server 8473
```

Abre <http://localhost:8473>.

### Publicar en GitHub Pages (gratis)

1. Crea un repositorio en GitHub, por ejemplo `tpv-el-descanso`.
2. Sube el contenido de esta carpeta a la rama `main`:

```bash
cd tpv-el-descanso
git init && git add . && git commit -m "TPV El Descanso"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/tpv-el-descanso.git
git push -u origin main
```

3. En GitHub: *Settings → Pages → Source: Deploy from a branch*, rama `main`, carpeta `/ (root)`.
   En un minuto la app estará en `https://TU_USUARIO.github.io/tpv-el-descanso/`.

Vale cualquier hosting estático con HTTPS (Netlify Drop, Cloudflare Pages…). Las rutas son relativas,
así que funciona en una subcarpeta.

### Sin publicar en internet: servidor local en la tablet

Chrome trata `http://localhost` como origen seguro, así que la app se puede instalar igual.

1. Copia la carpeta a la tablet (por ejemplo a Descargas).
2. Instala Termux (F-Droid) y ejecuta:

```text
pkg install python
termux-setup-storage
cd ~/storage/downloads/tpv-el-descanso
python -m http.server 8473
```

3. Abre `http://localhost:8473` en Chrome e instala la app. El servidor solo hace falta para instalar
   y para actualizar; después la app funciona desde la caché. Usa siempre el mismo puerto.

### Instalar en la tablet Android

1. Abre la URL en Chrome.
2. Menú ⋮ → **Instalar aplicación** (o *Añadir a pantalla de inicio*).
3. Ábrela desde el icono: pantalla completa, horizontal y sin conexión.

La app mantiene la pantalla encendida mientras hay alguien identificado (se puede desactivar en
*Administración → Club y ajustes*). Conviene fijar la orientación horizontal en los ajustes de Android.

## Primer uso

| Qué | Valor de fábrica | Dónde cambiarlo |
|-----|------------------|-----------------|
| PIN de administrador | `1234` | Administración → Usuarios → *Cambiar PIN de administrador* |
| Usuarios de ejemplo | Álvaro `1111`, Socio 2 `2222`, Socio 3 `3333` | Administración → Usuarios |
| Catálogo de ejemplo | bebidas y aperitivos típicos, sin control de stock | Administración → Productos / Categorías / Inventario |
| Nombre y logo | El Descanso | Administración → Club y ajustes |

La app avisa en Administración mientras el PIN de administrador siga siendo el de fábrica.

## Sincronización con Google Sheets

Todo ocurre entre la tablet y tu cuenta de Google: no hay ningún servidor intermedio.

### Publicar el script (una sola vez, desde el ordenador)

1. Crea una hoja de cálculo nueva en Google Sheets (por ejemplo «TPV El Descanso»).
2. Menú **Extensiones → Apps Script**. Borra el contenido, pega el archivo
   [`google-apps-script/Code.gs`](google-apps-script/Code.gs) y cambia el valor de `TOKEN` por una clave larga
   que solo conozcáis vosotros.
3. **Implementar → Nueva implementación**. Tipo: *Aplicación web*. *Ejecutar como*: tú.
   *Quién tiene acceso*: **Cualquier usuario**. Pulsa *Implementar* y autoriza los permisos (Sheets y Drive).
4. Copia la URL que termina en `/exec`.
5. En el TPV: *Administración → Google Sheets*. Pega la URL y el token, pulsa **Probar conexión**, marca
   «Enviar automáticamente» y **Guardar**. Si ya tenías turnos cerrados, pulsa **Enviar todo el histórico**.

Si más adelante cambias el código o el token: *Implementar → Gestionar implementaciones → ✎ →
Versión: Nueva → Implementar*. Así la URL no cambia.

### Qué llega a la hoja

| Pestaña | Contenido | Cuándo |
|---------|-----------|--------|
| Turnos | una fila por cierre: saldo inicial, recaudado, esperado, contado, diferencia, lo que queda en caja… | al cerrar el turno |
| Tickets | una fila por línea de ticket, con nº de ticket, vendedor, producto, cantidad, importe, invitación y anulado | al cerrar el turno |
| Catálogo | todos los productos con precio, categoría, visibilidad, stock y mínimo (se reescribe entera) | al cerrar y al cambiar el catálogo |
| Categorías | las categorías con emoji, color y orden | igual que Catálogo |
| Inventario | movimientos de stock: ventas del turno por producto, reposiciones, recuentos | al cerrar y al reponer |

Además el script guarda `cierre_FECHA_IDTURNO.json` en la carpeta de Drive «TPV El Descanso - cierres».

### Cómo funciona por dentro

- La app guarda cada envío en una cola local (IndexedDB) y lo manda con un `POST` al script cuando hay red.
  Si la tablet está sin conexión, el icono ☁️ de la barra de ventas muestra los pendientes y se reintenta al
  abrir la app, al recuperar la red, cada 5 minutos o al tocar el icono.
- El script es **idempotente**: reenviar un cierre o un movimiento ya guardado no duplica filas.
- La URL del script funciona como dirección pública y el **token** como contraseña. Nadie ve la hoja salvo
  con quien la compartas desde Drive.
- Sin conexión el TPV sigue vendiendo con normalidad; la nube es solo la copia.

## Inventario

- Activa el control por producto desde su ficha («Controlar el stock») o en *Administración → Inventario*
  con «Empezar a controlar», indicando las unidades que hay ahora y, si quieres, un mínimo de aviso.
- Cada venta o invitación descuenta unidades; anular un ticket las devuelve. El stock puede quedar en negativo
  si se vende más de lo apuntado: es la señal de que toca hacer un recuento.
- «Reposición» suma lo que entra y «Recuento» fija las unidades reales. Todo queda en el historial de movimientos
  y en la pestaña Inventario de la hoja.
- El botón del producto muestra las unidades y cambia a ámbar o rojo al bajar del mínimo. El informe de cierre
  incluye la lista de productos bajo mínimo.

## Dónde están los datos

Todo se guarda **en el navegador de la tablet** como documentos JSON:

- Configuración y turno abierto → `localStorage` (`tpv.config`, `tpv.turn`).
- Turnos cerrados, tickets, movimientos de inventario y cola de envíos → IndexedDB (base `tpv-el-descanso`).

Copias fuera de la tablet:

- **Automáticas**: al cerrar cada turno se descarga `cierre_FECHA.json` a Descargas (ajustable en
  *Administración → Google Sheets*). Chrome pide permiso una sola vez para descargar varios archivos.
- **Google Sheets** y la carpeta de Drive, si activas la sincronización.
- **Copia completa** desde *Administración → Datos y copias*: un JSON con todo, que se puede restaurar en la
  misma u otra tablet.

Avisos: si se borran los datos de Chrome, se desinstala la app o se pierde la tablet, se pierden los datos
locales. Dos tablets no comparten datos entre sí. Si el histórico no se pudiera guardar en IndexedDB, el cierre
se guarda en `tpv.archive_fallback` (localStorage) y la app avisa.

## Actualizar la app

Sube los archivos modificados y cambia `VERSION` en `sw.js` (por ejemplo `v1.1.1`). La tablet descarga
la nueva versión la siguiente vez que abra la app con conexión y muestra un aviso; al cerrarla y volver a
abrirla queda aplicada.

## Estructura del proyecto

```
index.html                pantallas (HTML estático)
css/styles.css            estilos
js/defaults.js            configuración inicial: catálogo, usuarios y PIN de ejemplo
js/utils.js               utilidades (importes, fechas, CSV, compartir, registro de acciones)
js/storage.js             localStorage + IndexedDB
js/ui.js                  modales, teclado numérico, PIN y avisos
js/report.js              cálculo del informe, texto para compartir y CSV
js/sync.js                cola y envío a Google Sheets
js/admin.js               pantalla de administración
js/app.js                 flujo principal: acceso, turno, ventas, cobro, cierre, inventario e histórico
sw.js                     service worker (modo sin conexión)
manifest.webmanifest      datos de la app instalable
icons/                    logo e iconos (SVG y PNG)
google-apps-script/       Code.gs: receptor para Google Sheets y Drive
```

Los importes se manejan internamente en **céntimos** (150 = 1,50 €) para evitar errores de redondeo; el script
los convierte a euros al escribirlos en la hoja.

## Formatos de exportación

CSV con separador `;`, decimales con coma y BOM UTF‑8: se abre directamente en Excel en español.

- **Tickets**: una fila por línea de ticket (turno, nº ticket, fecha, hora, vendedor, producto, categoría,
  cantidad, precio unitario, importe, invitación, anulado, total del ticket, entregado, cambio).
- **Turnos**: una fila por turno (apertura, cierre, saldo inicial, tickets, artículos, recaudado, esperado,
  contado, diferencia, queda en caja, retirado, invitaciones, anulados).
