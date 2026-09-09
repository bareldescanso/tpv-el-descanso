/*
 * Configuración inicial del TPV "El Descanso".
 * Se copia al almacenamiento local del navegador la primera vez que se abre la app.
 * A partir de ahí todo se edita desde la pantalla de Administración: este archivo
 * solo es la semilla (catálogo de ejemplo, usuarios de ejemplo y PIN de administrador).
 *
 * Los importes están en CÉNTIMOS (150 = 1,50 €) para evitar errores de redondeo.
 */
const DEFAULT_CONFIG = {
  "version": 1,
  "club": {
    "name": "El Descanso",
    "subtitle": "Bar del club",
    "logo": null
  },
  "adminPin": "1234",
  "settings": {
    "keepAwake": true,
    "vibrate": true
  },
  "sync": {
    "enabled": false,
    "url": "",
    "token": "",
    "autoDownloadJson": true,
    "autoDownloadCsv": false
  },
  "ticketCounter": 0,
  "lastClosingCash": 10000,
  "users": [
    { "id": "u1", "name": "Álvaro",  "pin": "1111", "active": true },
    { "id": "u2", "name": "Socio 2", "pin": "2222", "active": true },
    { "id": "u3", "name": "Socio 3", "pin": "3333", "active": true }
  ],
  "categories": [
    { "id": "c-cervezas",   "name": "Cervezas",         "emoji": "🍺", "color": "#e0a526", "order": 1 },
    { "id": "c-refrescos",  "name": "Refrescos",        "emoji": "🥤", "color": "#3b82f6", "order": 2 },
    { "id": "c-cafes",      "name": "Cafés",            "emoji": "☕", "color": "#8b5a2b", "order": 3 },
    { "id": "c-vinos",      "name": "Vinos y vermut",   "emoji": "🍷", "color": "#a13a5c", "order": 4 },
    { "id": "c-copas",      "name": "Copas y licores",  "emoji": "🥃", "color": "#7c3aed", "order": 5 },
    { "id": "c-aperitivos", "name": "Aperitivos",       "emoji": "🫒", "color": "#2f9e6b", "order": 6 }
  ],
  "products": [
    { "id": "p01", "name": "Caña",               "price": 150, "categoryId": "c-cervezas",   "emoji": "🍺", "color": null, "active": true, "order": 1 },
    { "id": "p02", "name": "Doble",              "price": 200, "categoryId": "c-cervezas",   "emoji": "🍺", "color": null, "active": true, "order": 2 },
    { "id": "p03", "name": "Tercio",             "price": 200, "categoryId": "c-cervezas",   "emoji": "🍻", "color": null, "active": true, "order": 3 },
    { "id": "p04", "name": "Botellín",           "price": 150, "categoryId": "c-cervezas",   "emoji": "🍾", "color": null, "active": true, "order": 4 },
    { "id": "p05", "name": "Clara con limón",    "price": 180, "categoryId": "c-cervezas",   "emoji": "🍋", "color": null, "active": true, "order": 5 },
    { "id": "p06", "name": "Cerveza sin alcohol","price": 180, "categoryId": "c-cervezas",   "emoji": "🍺", "color": null, "active": true, "order": 6 },
    { "id": "p07", "name": "Cerveza especial",   "price": 250, "categoryId": "c-cervezas",   "emoji": "🍻", "color": null, "active": true, "order": 7 },

    { "id": "p10", "name": "Coca-Cola",          "price": 180, "categoryId": "c-refrescos",  "emoji": "🥤", "color": null, "active": true, "order": 1 },
    { "id": "p11", "name": "Coca-Cola Zero",     "price": 180, "categoryId": "c-refrescos",  "emoji": "🥤", "color": null, "active": true, "order": 2 },
    { "id": "p12", "name": "Fanta naranja",      "price": 180, "categoryId": "c-refrescos",  "emoji": "🍊", "color": null, "active": true, "order": 3 },
    { "id": "p13", "name": "Fanta limón",        "price": 180, "categoryId": "c-refrescos",  "emoji": "🍋", "color": null, "active": true, "order": 4 },
    { "id": "p14", "name": "Aquarius",           "price": 180, "categoryId": "c-refrescos",  "emoji": "🥤", "color": null, "active": true, "order": 5 },
    { "id": "p15", "name": "Nestea",             "price": 180, "categoryId": "c-refrescos",  "emoji": "🧋", "color": null, "active": true, "order": 6 },
    { "id": "p16", "name": "Tónica",             "price": 180, "categoryId": "c-refrescos",  "emoji": "🥤", "color": null, "active": true, "order": 7 },
    { "id": "p17", "name": "Agua",               "price": 100, "categoryId": "c-refrescos",  "emoji": "💧", "color": null, "active": true, "order": 8 },
    { "id": "p18", "name": "Agua con gas",       "price": 120, "categoryId": "c-refrescos",  "emoji": "💧", "color": null, "active": true, "order": 9 },
    { "id": "p19", "name": "Zumo",               "price": 180, "categoryId": "c-refrescos",  "emoji": "🧃", "color": null, "active": true, "order": 10 },
    { "id": "p20", "name": "Mosto",              "price": 150, "categoryId": "c-refrescos",  "emoji": "🍇", "color": null, "active": true, "order": 11 },

    { "id": "p30", "name": "Café solo",          "price": 120, "categoryId": "c-cafes",      "emoji": "☕", "color": null, "active": true, "order": 1 },
    { "id": "p31", "name": "Cortado",            "price": 120, "categoryId": "c-cafes",      "emoji": "☕", "color": null, "active": true, "order": 2 },
    { "id": "p32", "name": "Café con leche",     "price": 140, "categoryId": "c-cafes",      "emoji": "☕", "color": null, "active": true, "order": 3 },
    { "id": "p33", "name": "Café con hielo",     "price": 130, "categoryId": "c-cafes",      "emoji": "🧊", "color": null, "active": true, "order": 4 },
    { "id": "p34", "name": "Descafeinado",       "price": 130, "categoryId": "c-cafes",      "emoji": "☕", "color": null, "active": true, "order": 5 },
    { "id": "p35", "name": "Carajillo",          "price": 200, "categoryId": "c-cafes",      "emoji": "☕", "color": null, "active": true, "order": 6 },
    { "id": "p36", "name": "Infusión",           "price": 120, "categoryId": "c-cafes",      "emoji": "🍵", "color": null, "active": true, "order": 7 },
    { "id": "p37", "name": "ColaCao",            "price": 150, "categoryId": "c-cafes",      "emoji": "🍫", "color": null, "active": true, "order": 8 },
    { "id": "p38", "name": "Vaso de leche",      "price": 100, "categoryId": "c-cafes",      "emoji": "🥛", "color": null, "active": true, "order": 9 },

    { "id": "p40", "name": "Vino tinto",         "price": 180, "categoryId": "c-vinos",      "emoji": "🍷", "color": null, "active": true, "order": 1 },
    { "id": "p41", "name": "Vino blanco",        "price": 180, "categoryId": "c-vinos",      "emoji": "🥂", "color": null, "active": true, "order": 2 },
    { "id": "p42", "name": "Tinto de verano",    "price": 200, "categoryId": "c-vinos",      "emoji": "🍷", "color": null, "active": true, "order": 3 },
    { "id": "p43", "name": "Vermut",             "price": 250, "categoryId": "c-vinos",      "emoji": "🍸", "color": null, "active": true, "order": 4 },
    { "id": "p44", "name": "Sangría (copa)",     "price": 250, "categoryId": "c-vinos",      "emoji": "🍹", "color": null, "active": true, "order": 5 },

    { "id": "p50", "name": "Cubata",             "price": 500, "categoryId": "c-copas",      "emoji": "🥃", "color": null, "active": true, "order": 1 },
    { "id": "p51", "name": "Gin-tonic",          "price": 600, "categoryId": "c-copas",      "emoji": "🍸", "color": null, "active": true, "order": 2 },
    { "id": "p52", "name": "Whisky",             "price": 400, "categoryId": "c-copas",      "emoji": "🥃", "color": null, "active": true, "order": 3 },
    { "id": "p53", "name": "Copa de licor",      "price": 250, "categoryId": "c-copas",      "emoji": "🥃", "color": null, "active": true, "order": 4 },
    { "id": "p54", "name": "Chupito",            "price": 150, "categoryId": "c-copas",      "emoji": "🥃", "color": null, "active": true, "order": 5 },

    { "id": "p60", "name": "Patatas fritas",     "price": 150, "categoryId": "c-aperitivos", "emoji": "🍟", "color": null, "active": true, "order": 1 },
    { "id": "p61", "name": "Aceitunas",          "price": 150, "categoryId": "c-aperitivos", "emoji": "🫒", "color": null, "active": true, "order": 2 },
    { "id": "p62", "name": "Frutos secos",       "price": 150, "categoryId": "c-aperitivos", "emoji": "🥜", "color": null, "active": true, "order": 3 },
    { "id": "p63", "name": "Banderillas",        "price": 200, "categoryId": "c-aperitivos", "emoji": "🥒", "color": null, "active": true, "order": 4 },
    { "id": "p64", "name": "Berberechos (lata)", "price": 300, "categoryId": "c-aperitivos", "emoji": "🥫", "color": null, "active": true, "order": 5 },
    { "id": "p65", "name": "Mejillones (lata)",  "price": 300, "categoryId": "c-aperitivos", "emoji": "🦪", "color": null, "active": true, "order": 6 },
    { "id": "p66", "name": "Chuches",            "price": 100, "categoryId": "c-aperitivos", "emoji": "🍬", "color": null, "active": true, "order": 7 },
    { "id": "p67", "name": "Helado",             "price": 150, "categoryId": "c-aperitivos", "emoji": "🍦", "color": null, "active": true, "order": 8 }
  ]
};

/* Paleta de colores disponible en Administración para categorías y productos. */
const COLOR_PALETTE = [
  "#e0a526", "#e0862c", "#d64545", "#a13a5c", "#7c3aed", "#3b82f6",
  "#0ea5b7", "#2f9e6b", "#65a30d", "#8b5a2b", "#64748b", "#1f5f4a"
];

/* Emojis sugeridos en el formulario de productos y categorías. */
const EMOJI_SUGGESTIONS = [
  "🍺","🍻","🍾","🍷","🥂","🍸","🍹","🥃","🍶","🧉",
  "🥤","🧃","🧋","💧","🍋","🍊","🍇","🍎","🍓","🥥",
  "☕","🍵","🧊","🥛","🍫","🍪","🍩","🥐","🍰","🍬",
  "🍟","🫒","🥜","🥒","🥫","🦪","🍢","🥪","🧀","🍿",
  "🍦","🥨","🍕","🌭","🥗","🍽️","🎁","⭐","🔥","❄️"
];
