/* Service worker de Alerta Sicaya.
   Guarda los archivos de la página en el teléfono para que abra rápido y también sin señal.
   Los datos (reportes, usuarios, fotos) NUNCA se guardan aquí: siempre van a Supabase.
   Al cambiar archivos de la página, sube el número de VERSION para renovar lo guardado. */

const VERSION = "v1";
const CACHE = `alerta-sicaya-${VERSION}`;

const ARCHIVOS = [
  "./", "index.html", "ingresar.html", "reporte.html", "panel.html", "comunidad.html",
  "css/tailwind.css", "css/estilos.css",
  "js/auth.js", "js/ingresar-ui.js", "js/inicio.js", "js/reporte.js", "js/panel.js",
  "js/comunidad.js", "js/alarma.js", "js/backend.js", "js/pwa.js",
  "img/logo-sicaya.png", "img/icon-192.png", "manifest.webmanifest",
];

// Librerías y tipografías de otros sitios que sí conviene guardar (están fijadas por versión)
const HOSTS_GUARDABLES = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      // Si falta algún archivo (por ejemplo una imagen todavía no subida), no se cancela la instalación
      .then((cache) => Promise.allSettled(ARCHIVOS.map((a) => cache.add(a))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);

  if (url.origin === location.origin) {
    evento.respondWith(redPrimero(pedido));
  } else if (HOSTS_GUARDABLES.includes(url.hostname)) {
    evento.respondWith(guardadoPrimero(pedido));
  }
  // Todo lo demás (Supabase, mapas) va directo a internet
});

function conTiempo(pedido, ms) {
  return new Promise((ok, fallo) => {
    const reloj = setTimeout(() => fallo(new Error("tiempo agotado")), ms);
    fetch(pedido).then(
      (r) => { clearTimeout(reloj); ok(r); },
      (e) => { clearTimeout(reloj); fallo(e); },
    );
  });
}

// Archivos propios: siempre la versión más nueva si hay internet; si no, la guardada
async function redPrimero(pedido) {
  const cache = await caches.open(CACHE);
  try {
    const respuesta = await conTiempo(pedido, 5000);
    if (respuesta.ok) cache.put(pedido, respuesta.clone());
    return respuesta;
  } catch {
    const guardada = await cache.match(pedido);
    if (guardada) return guardada;
    if (pedido.mode === "navigate") {
      const inicio = await cache.match("ingresar.html");
      if (inicio) return inicio;
    }
    return new Response("Sin conexión", { status: 503, statusText: "Sin conexión" });
  }
}

async function guardadoPrimero(pedido) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(pedido);
  if (guardada) return guardada;
  const respuesta = await fetch(pedido);
  if (respuesta.ok) cache.put(pedido, respuesta.clone());
  return respuesta;
}