import { usuarioActual, cerrarSesion, alertasComunidad, responderAlerta } from "./backend.js";
import { alternarSonido, sonar } from "./alarma.js";

const $ = (id) => document.getElementById(id);
const yo = await usuarioActual();

let mapa = null;
let ajustado = false;
const marcadores = new Map();
const conocidas = new Set();
let primeraCarga = true;

if (!yo) {
  location.replace("ingresar.html");
} else if (yo.rol !== "respondedor" && yo.rol !== "admin") {
  location.replace("reporte.html");
} else {
  iniciar();
}

function iniciar() {
  $("nombre").textContent = yo.nombre;
  $("salir").onclick = async () => {
    await cerrarSesion();
    location.replace("ingresar.html");
  };
  $("sonido").onclick = () => {
    const activo = alternarSonido();
    $("sonido").textContent = activo ? "Sonido activado" : "Activar sonido";
    $("sonido").className = activo
      ? "rounded-lg border border-green-200/60 px-3 py-1.5 text-sm font-semibold text-white"
      : "rounded-lg bg-[var(--maiz)] px-3 py-1.5 text-sm font-semibold text-[var(--suelo)]";
  };
  iniciarMapa();
  cargar();
  setInterval(cargar, 10000); // se actualiza sola cada 10 segundos
}

async function cargar() {
  try {
    const lista = await alertasComunidad();
    $("error").hidden = true;
    pintar(lista);
    avisarNuevas(lista);
  } catch (err) {
    $("error").textContent = err.message;
    $("error").hidden = false;
  }
}

async function responder(id, estado) {
  try {
    await responderAlerta(id, estado);
    await cargar();
  } catch (err) {
    $("error").textContent = err.message;
    $("error").hidden = false;
  }
}

function haceCuanto(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

function boton(texto, clases, alHacerClic) {
  const b = document.createElement("button");
  b.textContent = texto;
  b.className = "rounded-lg px-4 py-2.5 text-sm font-semibold " + clases;
  b.onclick = alHacerClic;
  return b;
}

function tarjeta(r) {
  const li = document.createElement("li");
  const borde = r.estado === "nuevo" ? "border-l-[var(--rojo)]" : "border-l-[var(--maiz)]";
  li.className = `flex flex-col gap-3 rounded-xl border border-[#1f3a2b] border-l-8 ${borde} bg-[#13241b] p-4`;

  const cabecera = document.createElement("div");
  cabecera.className = "flex items-center justify-between gap-3";
  const tipo = document.createElement("p");
  tipo.className = "titulo text-xl font-bold";
  tipo.textContent = r.tipo;
  const cuando = document.createElement("span");
  cuando.className = "text-sm text-green-100/80";
  cuando.textContent = haceCuanto(r.creadoEn);
  cabecera.append(tipo, cuando);
  li.append(cabecera);

  if (r.texto) {
    const texto = document.createElement("p");
    texto.textContent = r.texto;
    li.append(texto);
  }

  const camino = document.createElement("p");
  camino.className = "text-sm font-semibold text-[var(--verde-vivo)]";
  camino.textContent = r.enCamino === 0 ? "Nadie ha salido todavía" : `${r.enCamino} en camino o ya en el lugar`;
  li.append(camino);

  if (r.lat != null && r.lng != null) {
    const como = document.createElement("a");
    como.href = `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`;
    como.target = "_blank";
    como.rel = "noopener";
    como.className = "self-start text-sm font-semibold text-[var(--maiz)] underline";
    como.textContent = "Cómo llegar";
    li.append(como);
  }

  const acciones = document.createElement("div");
  acciones.className = "flex flex-wrap gap-2";
  if (r.miEstado === "en_camino") {
    acciones.append(
      boton("Ya llegué", "bg-[var(--maiz)] text-[var(--suelo)] hover:brightness-105", () => responder(r.id, "llegue")),
      boton("Ya no puedo ir", "border border-green-200/50 hover:bg-white/10", () => responder(r.id, "cancelado")),
    );
  } else if (r.miEstado === "llegue") {
    const ok = document.createElement("p");
    ok.className = "text-sm font-semibold text-[var(--maiz)]";
    ok.textContent = "Marcaste que ya llegaste. Gracias.";
    acciones.append(ok);
  } else {
    acciones.append(boton("Voy en camino", "bg-[var(--verde-vivo)] text-[var(--suelo)] hover:brightness-110", () => responder(r.id, "en_camino")));
  }
  li.append(acciones);
  return li;
}

function pintar(lista) {
  $("alertas").replaceChildren(...lista.map(tarjeta));
  $("sin-alertas").hidden = lista.length > 0;
  actualizarMapa(lista);
}

/* ---------- Mapa ---------- */

function iniciarMapa() {
  if (typeof L === "undefined") {
    $("mapa").textContent = "No se pudo cargar el mapa. Revisa tu conexión a internet.";
    return;
  }
  mapa = L.map("mapa").setView([-12.0152, -75.2802], 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(mapa);
}

function actualizarMapa(lista) {
  if (!mapa) return;
  const vigentes = new Set();
  const puntos = [];
  lista.filter((r) => r.lat != null && r.lng != null).forEach((r) => {
    vigentes.add(r.id);
    let m = marcadores.get(r.id);
    if (!m) {
      m = L.circleMarker([r.lat, r.lng], { radius: 11, weight: 3, color: "#ffffff", fillOpacity: 0.95 }).addTo(mapa);
      marcadores.set(r.id, m);
    }
    m.setStyle({ fillColor: r.estado === "nuevo" ? "#dc2626" : "#facc15" });
    m.bindPopup(`<strong>${r.tipo}</strong><br>${haceCuanto(r.creadoEn)}`);
    puntos.push([r.lat, r.lng]);
  });
  marcadores.forEach((m, id) => {
    if (!vigentes.has(id)) {
      m.remove();
      marcadores.delete(id);
    }
  });
  if (!ajustado && puntos.length) {
    mapa.fitBounds(puntos, { padding: [40, 40], maxZoom: 16 });
    ajustado = true;
  }
}

/* ---------- Aviso de alertas nuevas ---------- */

function avisarNuevas(lista) {
  const nuevas = lista.filter((r) => !conocidas.has(r.id));
  lista.forEach((r) => conocidas.add(r.id));
  if (primeraCarga) {
    primeraCarga = false;
    return;
  }
  if (!nuevas.length) return;
  const caja = $("aviso-alerta");
  caja.textContent = `Nueva alerta: ${nuevas[0].tipo}` + (nuevas.length > 1 ? ` (y ${nuevas.length - 1} más)` : "");
  caja.hidden = false;
  setTimeout(() => { caja.hidden = true; }, 8000);
  sonar();
  if (mapa && nuevas[0].lat != null) mapa.flyTo([nuevas[0].lat, nuevas[0].lng], 17);
}