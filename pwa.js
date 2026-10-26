// Convierte la página en app instalable: registra el service worker y ofrece instalarla.

if ("serviceWorker" in navigator) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker:", e));
  });
}

const yaInstalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const esIPhone = /iphone|ipad|ipod/i.test(navigator.userAgent);
const CLAVE = "as_pwa_cerrado";
let eventoInstalar = null;
let banner = null;

function recienCerrado() {
  try {
    return Date.now() - Number(localStorage.getItem(CLAVE) || 0) < 7 * 86400000; // 7 días
  } catch {
    return false;
  }
}

function cerrar(recordar) {
  if (recordar) {
    try { localStorage.setItem(CLAVE, String(Date.now())); } catch { /* sin almacenamiento */ }
  }
  banner?.remove();
  banner = null;
}

function boton(texto, clase, alHacerClic) {
  const b = document.createElement("button");
  b.className = clase;
  b.textContent = texto;
  b.onclick = alHacerClic;
  return b;
}

function mostrar(texto, botones) {
  if (banner || yaInstalada || recienCerrado()) return;
  banner = document.createElement("div");
  banner.className = "banner-instalar";
  banner.setAttribute("role", "dialog");
  const p = document.createElement("p");
  p.textContent = texto;
  banner.append(p, ...botones);
  document.body.append(banner);
}

// Android y computadora (Chrome, Edge): el navegador avisa cuando se puede instalar
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  eventoInstalar = e;
  mostrar("Instala Alerta Sicaya en tu celular: se abre más rápido y sin barra del navegador.", [
    boton("Instalar", "principal", async () => {
      cerrar(false);
      eventoInstalar.prompt();
      await eventoInstalar.userChoice;
      eventoInstalar = null;
    }),
    boton("Ahora no", "secundario", () => cerrar(true)),
  ]);
});

addEventListener("appinstalled", () => cerrar(false));

// iPhone: no hay botón automático, hay que guiar el paso a mano
if (esIPhone && !yaInstalada) {
  setTimeout(() => {
    mostrar("Para instalar la app en tu iPhone: toca el botón Compartir y luego \"Agregar a inicio\".", [
      boton("Entendido", "principal", () => cerrar(true)),
    ]);
  }, 2500);
}