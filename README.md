# TPV El Descanso

Terminal punto de venta para el bar del club, pensado para una **tablet Android en horizontal**.
No tiene servidor propio ni base de datos: es una web estática (HTML, CSS y JavaScript sin dependencias)
que se instala como aplicación y funciona **sin conexión** una vez cargada. Opcionalmente envía los
cierres, el catálogo y el inventario a una **hoja de Google Sheets** mediante un script gratuito de Apps Script.
Esa misma hoja sirve para **gestionar la configuración** (productos, categorías, usuarios y ajustes) y para
**recuperar el histórico** en una tablet nueva. Al abrir la app se comprueba sola y se pone al día.

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
- **Google Sheets**: envío automático de cierres, tickets, catálogo, usuarios, ajustes e inventario a una hoja de
  cálculo de tu Drive, con cola de reintentos si no hay conexión. El script deja además un JSON por cierre en una
  carpeta de Drive.
- **Alta de otra tablet con un QR**: desde una tablet ya conectada se genera un enlace con su código
  para que otra tablet, un móvil o un navegador queden apuntando a la misma hoja sin teclear nada.
- **Configuración desde la hoja**: se puede editar el catálogo, las categorías, los usuarios y los ajustes del club
  en el Excel y traerlo todo a la tablet con «Actualizar desde la hoja». Es la forma cómoda de mantener varias
  tablets con la misma configuración.
- **Se pone al día al abrir la app**: si la hoja trae algo distinto se aplica sin preguntar, y solo se avisa de lo
  que ha entrado. No hay que acordarse de pulsar nada.
- **Histórico desde la hoja**: esa misma actualización puede traerse de vuelta los turnos cerrados, sus tickets y
  los movimientos de inventario, para dejar como estaba una tablet nueva o a la que se le hayan borrado los datos.
- **Administración**: productos, categorías, inventario, usuarios, nombre y logo del club, ajustes, Google Sheets
  (envío y actualización desde la hoja) y copias de seguridad.
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

### Dar de alta otra tablet (enlace o QR)

Ese paso 5 solo hay que hacerlo **una vez**. Para la segunda tablet, el móvil de alguien o el
navegador del ordenador, en una tablet ya conectada: *Administración → Google Sheets →
**📱 Generar enlace de alta***. Sale un código QR con un enlace de esta forma:

```text
https://TU_USUARIO.github.io/tpv-el-descanso/#tpv=eyJpIjoi…
```

Se escanea con la cámara del dispositivo nuevo (o se pega el enlace en Chrome) y al abrirse queda
conectado a la hoja del club: descarga la configuración y el histórico que falte y empieza a
funcionar. No hay que copiar la URL ni el token a mano.

- **El QR se dibuja en la propia tablet** ([`js/qr.js`](js/qr.js)), sin internet y sin ningún
  servicio de códigos QR: ese enlace lleva la contraseña de la hoja y no puede salir del dispositivo.
- La URL y el token viajan en el **fragmento** (lo que va después de `#`). Los navegadores **no
  envían el fragmento al servidor**, así que no queda en los registros de GitHub Pages ni se escapa
  por la cabecera `Referer`. La app lo lee, lo guarda y lo **borra de la barra de direcciones**.
- Solo se aceptan enlaces `https` hacia `script.google.com` terminados en `/exec`: un enlace ajeno
  no puede desviar los cierres del club a otro servidor.
- En una tablet **recién puesta** se aplica sin preguntar (no hay nada que perder). Si la tablet ya
  estaba trabajando con **otra hoja**, se pide confirmación **y el PIN de administrador**: si no,
  bastaría con colarle un enlace a alguien para que sus cierres acabasen en otro sitio.
- El **PIN de administrador no viaja** en el enlace. En la tablet nueva sigue siendo el de fábrica
  (`1234`) hasta que se cambie a mano.

> ⚠️ **El enlace de alta es la contraseña de la hoja.** Enséñalo en pantalla para escanearlo o
> pégalo tú en el dispositivo; no lo mandes a un grupo de WhatsApp, no lo pegues en un correo a
> varios y no lo subas al repositorio (que es público).

#### Si el enlace o el token se escapan

Cambiar el token es la única forma de revocar el acceso, y se hace en dos minutos:

1. Apps Script → cambia el valor de `var TOKEN = '…'` por otra clave larga.
2. *Implementar → Gestionar implementaciones → ✎ → Versión: **Nueva** → Implementar*.
   Así la URL sigue siendo la misma y solo cambia la contraseña.
3. En una tablet: *Administración → Google Sheets*, pega el token nuevo y **Guardar**.
4. Desde ella, **📱 Generar enlace de alta** y vuelve a dar de alta las demás con el código nuevo.

Las tablets que sigan con el token viejo dejan de subir y de actualizarse, y avisan del error en
*Administración → Google Sheets*; sus turnos pendientes **no se pierden**: se quedan en la cola y
suben en cuanto se les ponga el token nuevo.

### Qué llega a la hoja

| Pestaña | Contenido | Cuándo |
|---------|-----------|--------|
| Turnos | una fila por cierre: saldo inicial, recaudado, esperado, contado, diferencia, lo que queda en caja… | al cerrar el turno |
| Tickets | una fila por línea de ticket, con nº de ticket, vendedor, producto, cantidad, importe, invitación y anulado | al cerrar el turno |
| Catálogo | todos los productos con precio, categoría, visibilidad, stock y mínimo (se reescribe entera) | al cerrar y al cambiar el catálogo |
| Categorías | las categorías con emoji, color y orden | igual que Catálogo |
| Usuarios | nombre, PIN y si está activo (se reescribe entera) | igual que Catálogo |
| Ajustes | nombre y subtítulo del club, pantalla encendida y vibración (se reescribe entera) | igual que Catálogo |
| Inventario | movimientos de stock: ventas del turno por producto, reposiciones, recuentos | al cerrar y al reponer |

Además el script guarda `cierre_FECHA_IDTURNO.json` en la carpeta de Drive «TPV El Descanso - cierres».

### Gestionar la configuración desde la hoja

Las pestañas **Catálogo**, **Categorías**, **Usuarios** y **Ajustes** se pueden editar a mano en el Excel.
Después, en la tablet: *Administración → Google Sheets → **📥 Actualizar desde la hoja***.

- **Manda la hoja**: lo que no esté en ella se elimina de la tablet. Antes de aplicar nada la app enseña un
  resumen con las altas, los cambios y —con su nombre— las bajas.
- Si algo no cuadra (un PIN de menos de 4 dígitos o repetido, ningún usuario activo, un producto con una
  categoría que no existe, un precio que no es un número, hojas vacías) **no se cambia nada** y la app enumera
  todos los problemas para corregirlos en la hoja.
- **Las existencias son opcionales**, con una casilla en cada actualización. Sin marcarla se conservan las de la
  tablet, que suelen estar más al día. Marcándola con un turno abierto, a las unidades de la hoja se les resta lo
  que ya se ha vendido en ese turno, así que se respeta el recuento hecho en el Excel sin perder las ventas.
- **No se importan nunca** el PIN de administrador ni la URL y el token de la conexión: un valor equivocado en la
  hoja dejaría la tablet sin acceso o incomunicada. Esos se cambian solo desde Administración.
- Las filas nuevas pueden dejar la columna **ID** en blanco: la app genera el identificador y lo devuelve a la
  hoja en el siguiente envío. Las columnas *Activo*, *Visible* y *Controla stock* aceptan `Sí`, `No`, `X`, `1`
  o `TRUE`, y en blanco se entienden como *Sí* (salvo *Controla stock*, que se deduce de si hay stock escrito).
- El **color** de cada producto no viaja a la hoja: se conserva el que tuviera en la tablet.

> ⚠️ **Los PIN de los usuarios quedan escritos en la hoja en texto plano**: quien tenga acceso al documento puede
> entrar en el TPV como cualquiera. No lo compartas con enlace público y que el PIN de administrador —que nunca
> sale de la tablet— sea distinto de todos ellos.

### Recuperar el histórico desde la hoja

Si una tablet se rompe, se le borran los datos de Chrome o se sustituye por otra, los turnos cerrados siguen
estando en la hoja. La misma acción **📥 Actualizar desde la hoja** los devuelve a la app: en el resumen aparece
una fila *Histórico* con cuántos turnos hay en la hoja y cuántos faltan en la tablet, y una **casilla —desmarcada
por defecto—** para traerlos junto con sus tickets y los movimientos de inventario.

- **Solo se añade lo que falte**, emparejando por ID de turno. Un turno que ya esté en la tablet **no se modifica**,
  no se borra nada y el **turno abierto no se toca**. Volver a pulsar no duplica nada, así que si la descarga se
  corta a medias basta con repetirla: continúa por donde iba.
- Va **desmarcada por defecto** porque una temporada son decenas de miles de filas de tickets y tarda un rato.
  Sin marcarla, actualizar la configuración va igual de rápido que siempre.
- La hoja solo tiene los cierres que se **enviaron con éxito**: un turno cerrado sin conexión sigue esperando en la
  cola de la tablet y no está en el Excel. Por eso nunca se reemplaza el histórico local con el de la hoja.
- Lo que la hoja no guarda **se recupera por el nombre**, contra el catálogo y los usuarios que se acaban de
  importar: el vendedor de cada ticket, el producto, la categoría y su emoji. Si alguien ya no está en la lista de
  usuarios, sus tickets quedan agrupados aparte con su nombre, sin mezclarse con los de otra persona.
- El **contador de tickets** se sube al número más alto que venga de la hoja, para que los tickets nuevos de una
  tablet recién restaurada no repitan números ya usados.
- Si a la hoja **Tickets** le faltan filas (alguien las borró a mano), el turno se importa igual y la app avisa de
  la diferencia entre el «Recaudado» de la hoja y lo que suman sus tickets. Al revés que con la configuración, aquí
  un problema **no cancela la importación**: recuperar 40 turnos de 42 es mejor que ninguno.
- Los informes de los turnos recuperados se recalculan desde sus tickets, así que el cuadre, «Por persona», «Por
  producto» y los CSV salen igual que en la tablet original.

### Se actualiza sola al abrir la app

No hace falta entrar en Administración: **cada vez que se abre la app se comprueba la hoja**. Si trae algo
distinto se aplica en el momento, sin preguntar, y solo aparece un aviso con lo que ha entrado
(«Actualizado desde la hoja: 1 usuario, 2 productos»). Si todo está igual no se dice nada.

- **La hoja se lee antes de reescribirla.** Los cierres y los movimientos de inventario pendientes suben primero
  (solo añaden filas), pero el catálogo espera: un envío de catálogo reescribe las pestañas de configuración, así
  que mandarlo antes de leer borraría el usuario o el producto que alguien acabara de añadir a mano en el Excel.
  Después de leer, la tablet devuelve a la hoja el resultado ya fusionado.
- **No se comprueba con un ticket a medias** ni con la pantalla de cobro abierta: cambiar precios debajo de una
  venta en curso sería peor que esperar.
- Se comprueba al abrir la app, **al volver a ella**, al recuperar la conexión y cada pocos minutos, con una espera
  mínima de dos minutos entre consultas. En una tablet la app casi nunca se cierra de verdad —se queda en segundo
  plano—, así que «una vez al arrancar» no bastaría: se edita el Excel en el ordenador, se coge la tablet y ya
  está puesta al día.
- **Sin cobertura no dice nada** —una tablet sin red es lo normal—, pero un token equivocado o un script sin
  implementar **sí avisan**: si no, lo único que se vería es que «no se actualiza nada».
- **Las existencias no se tocan** en la comprobación automática: el recuento de la tablet baja con cada venta, así
  que es más de fiar que el de la hoja. Siguen siendo la casilla del botón manual.
- Si la hoja está a medio editar (un PIN repetido, un producto sin categoría, una pestaña vacía) **no se cambia
  nada** y se avisa de que hay datos que corregir; el detalle está en *Administración → Google Sheets*.
- Los **turnos que falten** se traen en la misma comprobación, con sus tickets y los movimientos de inventario,
  con las mismas reglas del apartado anterior: solo se añade lo que no esté.
- La URL y el token **no van en el código** (el repositorio es público), así que una tablet nueva hay que conectarla
  una vez: lo más rápido es el **enlace o el QR de alta** de otra tablet (ver [Dar de alta otra
  tablet](#dar-de-alta-otra-tablet-enlace-o-qr)); también se pueden pegar a mano en *Administración → Google Sheets*.
  A partir de ahí ya se actualiza sola, y de hecho el alta misma deja la tablet al día antes de la primera venta.

El botón **📥 Actualizar desde la hoja** sigue estando para forzarlo en el momento, y es el único que enseña el
resumen antes de aplicar y el que permite traer también las existencias.

### Cómo funciona por dentro

- La app guarda cada envío en una cola local (IndexedDB) y lo manda con un `POST` al script cuando hay red.
  Si la tablet está sin conexión, el icono ☁️ de la barra de ventas muestra los pendientes y se reintenta al
  abrir la app, al volver a ella, al recuperar la red, cada 5 minutos o al tocar el icono. Los envíos de
  **catálogo** son una excepción: son una instantánea que reescribe la hoja, así que en el arranque se dejan para
  después de haberla leído (`syncFlush({ skipCatalog: true })`).
- El script es **idempotente**: reenviar un cierre o un movimiento ya guardado no duplica filas.
- «Actualizar desde la hoja» no usa la cola: son consultas directas (`GET …/exec?token=…&accion=…`) y no cambian
  nada en la tablet hasta que se confirma. La comprobación del arranque es la misma función en modo silencioso:
  aplica lo que venga sin diálogo y sin tocar las existencias. Hay cuatro: `accion=config` devuelve las cuatro pestañas de
  configuración; `accion=turnos`, solo los totales de cada cierre, que es lo justo para saber qué turnos faltan
  sin descargar nada gordo; `accion=tickets&turnos=id1,id2`, las líneas de esos cierres y de ninguno más (en
  lotes de cinco turnos); y `accion=inventario&desde=&limite=`, los movimientos por páginas de 500.
- El histórico se guarda **lote a lote** en IndexedDB con `put` por ID: nunca se borra nada, así que importar dos
  veces deja lo mismo. Y no se reenvía a la hoja: viene de ella, ya está allí.
- La URL del script funciona como dirección pública y el **token** como contraseña. Nadie ve la hoja salvo
  con quien la compartas desde Drive.
- El **enlace de alta** es ese par (URL + token) en base64url dentro del fragmento `#tpv=`. `enrollPayload`
  guarda solo el identificador de la implementación cuando la URL tiene la forma habitual, para que el código QR
  salga más pequeño; `enrollParse` es la parte desconfiada (https, `script.google.com`, `/exec`, identificador sin
  barras ni puntos) y `readEnrollHash` lo aplica y limpia la barra de direcciones con `history.replaceState`.
- `js/qr.js` es un generador de códigos QR escrito para esto: modo byte, corrección de errores nivel M,
  versiones 1 a 13 (hasta 331 caracteres) y la máscara elegida por las cuatro reglas de penalización del estándar.
  Son 300 líneas para no mandar el token a un servicio de QR ajeno.
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
locales; con la sincronización activada se pueden recuperar desde la hoja (*Actualizar desde la hoja*, marcando la
casilla del histórico), pero solo los cierres que llegaron a subir. Dos tablets no trabajan sobre el mismo turno:
cada una tiene el suyo y sus tickets, y solo se juntan al pasar por la hoja de Google. Si el histórico no se
pudiera guardar en IndexedDB, el cierre se guarda en `tpv.archive_fallback` (localStorage) y la app avisa.

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
js/sync.js                cola y envío a Google Sheets, y vuelta de la configuración y del histórico desde la hoja
js/qr.js                  generador de códigos QR (para el enlace de alta, sin salir del dispositivo)
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
