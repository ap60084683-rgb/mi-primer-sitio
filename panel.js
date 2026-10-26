import {
  usuarioActual, cerrarSesion,
  listarPendientes, contarVecinos, aprobarVecino, rechazarVecino,
  escucharReportes, despacharUnidad, resolverReporte, marcarFalsaAlarma,
  listarVecinos, suspenderVecino, reactivarVecino, designarRespondedor, quitarRespondedor,
} from "./backend.js";

const $ = (id) => document.getElementById(id);
const yo = await usuarioActual();

// Estado del mapa, el sonido y los avisos (se declara antes de usarse)
let mapa = null;
let mapaAjustado = false;
const marcadores = new Map();
let audio = null;
let sonidoActivo = false;
const conocidas = new Set();
let primeraCarga = true;
const tituloBase = document.title;
let parpadeo = null;

if (!yo || yo.rol !== "admin") {
  location.replace("ingresar.html");
} else {
  $("operador").textContent = yo.nombre;
  $("salir").onclick = async () => {
    await cerrarSesion();
    location.replace("ingresar.html");
  };
  pintar();
  iniciarMapa();
  $("sonido").onclick = alternarSonido;
  escucharReportes(pintarAlertas);
  $("visor-cerrar").onclick = () => $("visor").close();
  $("visor").onclick = (e) => { if (e.target.id === "visor") $("visor").close(); };
}

function boton(texto, clases, alHacerClic) {
  const b = document.createElement("button");
  b.textContent = texto;
  b.className = "rounded-lg px-4 py-2 text-sm font-semibold " + clases;
  b.onclick = alHacerClic;
  return b;
}

function tarjeta(v) {
  const li = document.createElement("li");
  li.className = "rounded-xl bg-[#13241b] border border-[#1f3a2b] p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between";

  const datos = document.createElement("div");
  const nombre = document.createElement("p");
  nombre.className = "titulo text-lg font-bold";
  nombre.textContent = v.nombre;
  const detalle = document.createElement("p");
  detalle.className = "text-sm text-green-100/80";
  detalle.textContent = `DNI ${v.dni}, celular ${v.celular}, ${v.correo}, sector ${v.sector || "sin indicar"}`;
  datos.append(nombre, detalle);
  if (v.tutor_nombre) {
    const menor = document.createElement("p");
    menor.className = "mt-1 text-sm font-semibold text-[var(--maiz)]";
    menor.textContent = `Menor de edad. Llamar al adulto responsable: ${v.tutor_nombre}, celular ${v.tutor_celular}`;
    datos.append(menor);
  }

  const acciones = document.createElement("div");
  acciones.className = "flex gap-2";
  acciones.append(
    boton("Aprobar", "bg-[var(--verde-vivo)] text-[var(--suelo)] hover:brightness-110", async () => {
      await aprobarVecino(v.id);
      pintar();
    }),
    boton("Rechazar", "border border-green-200/50 hover:bg-white/10", async () => {
      await rechazarVecino(v.id);
      pintar();
    }),
  );

  li.append(datos, acciones);
  return li;
}

async function pintar() {
  const pendientes = await listarPendientes();
  const { aprobados } = await contarVecinos();
  $("n-pendientes").textContent = pendientes.length;
  $("n-aprobados").textContent = aprobados;
  $("lista").replaceChildren(...pendientes.map(tarjeta));
  $("vacio").hidden = pendientes.length > 0;
  const vecinos = await listarVecinos();
  $("vecinos").replaceChildren(...vecinos.map(tarjetaGestion));
}

function tarjetaGestion(v) {
  const suspendido = v.estado === "suspendido";
  const li = document.createElement("li");
  li.className = "rounded-xl bg-[#13241b] border border-[#1f3a2b] p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between";

  const datos = document.createElement("div");
  const nombre = document.createElement("p");
  nombre.className = "titulo text-lg font-bold";
  nombre.textContent = v.nombre + (v.rol === "respondedor" ? " (red comunitaria)" : "") + (suspendido ? " (suspendido)" : "");
  const detalle = document.createElement("p");
  detalle.className = "text-sm text-green-100/80";
  detalle.textContent = `DNI ${v.dni}, celular ${v.celular}`;
  datos.append(nombre, detalle);

  const acciones = document.createElement("div");
  acciones.className = "flex flex-wrap gap-2";
  if (!suspendido) {
    const esResp = v.rol === "respondedor";
    acciones.append(boton(
      esResp ? "Quitar de la red" : "Sumar a la red comunitaria",
      esResp ? "border border-[var(--maiz)] text-[var(--maiz)] hover:bg-white/10" : "bg-[var(--maiz)] text-[var(--suelo)] hover:brightness-105",
      async () => { await (esResp ? quitarRespondedor(v.id) : designarRespondedor(v.id)); pintar(); },
    ));
  }
  acciones.append(suspendido
    ? boton("Reactivar", "bg-[var(--verde-vivo)] text-[var(--suelo)] hover:brightness-110", async () => { await reactivarVecino(v.id); pintar(); })
    : boton("Suspender acceso", "border border-green-200/50 hover:bg-white/10", async () => { await suspenderVecino(v.id); pintar(); }));
  li.append(datos, acciones);
  return li;
}

/* ---------- Alertas en vivo ---------- */

// Rojo = nueva (urgente), maíz = en proceso, verde = resuelta
function estilo(estado) {
  if (estado === "en_proceso") return { texto: "En proceso", badge: "bg-[var(--maiz)] text-[var(--suelo)]", borde: "border-l-[var(--maiz)]" };
  if (estado === "falsa_alarma") return { texto: "Falsa alarma", badge: "bg-slate-500 text-white", borde: "border-l-slate-500" };
  if (estado === "resuelto") return { texto: "Resuelta", badge: "bg-[var(--verde-vivo)] text-[var(--suelo)]", borde: "border-l-[var(--verde-vivo)]" };
  return { texto: "Nueva", badge: "bg-[var(--rojo)] text-white", borde: "border-l-[var(--rojo)]" };
}

function cuando(iso) {
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function abrirVisor(src) {
  $("visor-img").src = src;
  $("visor").showModal();
}

function tarjetaAlerta(r) {
  const e = estilo(r.estado);
  const li = document.createElement("li");
  li.className = `rounded-xl bg-[#13241b] border border-[#1f3a2b] border-l-8 ${e.borde} p-4 flex flex-col gap-3`;

  const cabecera = document.createElement("div");
  cabecera.className = "flex items-center justify-between gap-3";
  const tipo = document.createElement("p");
  tipo.className = "titulo text-xl font-bold";
  tipo.textContent = r.tipo;
  const badge = document.createElement("span");
  badge.className = `rounded-full px-3 py-1 text-sm font-semibold ${e.badge}`;
  badge.textContent = e.texto;
  cabecera.append(tipo, badge);

  const quien = document.createElement("p");
  quien.className = "text-sm text-green-100/80";
  quien.textContent = `Reportó ${r.usuarioNombre}, ${cuando(r.creadoEn)}`;
  li.append(cabecera, quien);

  if (r.ultimoCambioPor) {
    const accion = document.createElement("p");
    accion.className = "text-sm text-[var(--maiz)]";
    accion.textContent = `Última acción: ${e.texto.toLowerCase()} por ${r.ultimoCambioPor}, ${cuando(r.ultimoCambioEn)}`;
    li.append(accion);
  }

  if (r.texto) {
    const texto = document.createElement("p");
    texto.textContent = r.texto;
    li.append(texto);
  }

  if (r.estado === "nuevo" || r.estado === "en_proceso") {
    const contacto = document.createElement("div");
    contacto.className = "flex flex-wrap items-center gap-3 text-sm";
    if (r.usuarioCelular) {
      const llamar = document.createElement("a");
      llamar.href = `tel:${r.usuarioCelular}`;
      llamar.className = "rounded-lg border border-green-200/50 px-3 py-1.5 font-semibold hover:bg-white/10";
      llamar.textContent = `Llamar al vecino: ${r.usuarioCelular}`;
      contacto.append(llamar);
    }
    const compartir = document.createElement("a");
    compartir.href = textoWhatsApp(r);
    compartir.target = "_blank";
    compartir.rel = "noopener";
    compartir.className = "rounded-lg bg-[#25D366] px-3 py-1.5 font-semibold text-[var(--suelo)] hover:brightness-110";
    compartir.textContent = "Compartir por WhatsApp";
    contacto.append(compartir);
    li.append(contacto);
  }

  const activos = (r.respuestas || []).filter((x) => x.estado !== "cancelado");
  if (activos.length && (r.estado === "nuevo" || r.estado === "en_proceso")) {
    const red = document.createElement("p");
    red.className = "text-sm font-semibold text-[var(--verde-vivo)]";
    red.textContent = "Red comunitaria: " + activos
      .map((x) => `${x.usuario_nombre} (${x.estado === "llegue" ? "llegó" : "en camino"}${x.usuario_celular ? ", " + x.usuario_celular : ""})`)
      .join("; ");
    li.append(red);
  }

  const lugar = document.createElement("div");
  lugar.className = "flex flex-col gap-1 text-sm";
  if (r.lat != null && r.lng != null) {
    const fila = document.createElement("div");
    fila.className = "flex flex-wrap items-center gap-3";
    const enlace = document.createElement("a");
    enlace.href = `https://www.google.com/maps?q=${r.lat},${r.lng}`;
    enlace.target = "_blank";
    enlace.rel = "noopener";
    enlace.className = "underline text-[var(--maiz)] font-semibold";
    enlace.textContent = "Abrir en Google Maps";
    fila.append(boton("Ver en el mapa de arriba", "bg-[var(--maiz)] text-[var(--suelo)] hover:brightness-105", () => enfocarEnMapa(r)), enlace);
    lugar.append(fila);
    const imprecisa = !r.ubicacionManual && r.precisionM && r.precisionM > 100;
    const detalle = document.createElement("p");
    detalle.className = imprecisa ? "font-semibold text-red-300" : "text-green-100/80";
    detalle.textContent = textoPrecision(r) + (imprecisa ? ". Ubicación aproximada: confirma el lugar por teléfono." : "");
    lugar.append(detalle);
  } else {
    const sin = document.createElement("p");
    sin.className = "font-semibold text-red-300";
    sin.textContent = "Se envió sin ubicación: llama al vecino para saber dónde es.";
    lugar.append(sin);
  }
  li.append(lugar);

  if (r.foto) {
    const ver = document.createElement("button");
    ver.className = "self-start rounded-lg overflow-hidden border-2 border-[#1f3a2b]";
    ver.setAttribute("aria-label", "Ver foto en grande");
    const mini = document.createElement("img");
    mini.src = r.foto;
    mini.alt = "";
    mini.className = "h-24 w-auto";
    mini.loading = "lazy";
    mini.decoding = "async";
    ver.append(mini);
    ver.onclick = () => abrirVisor(r.foto);
    li.append(ver);
  }

  if (r.estado === "nuevo" || r.estado === "en_proceso") {
    const acciones = document.createElement("div");
    acciones.className = "flex flex-wrap gap-2";
    if (r.estado === "nuevo") {
      acciones.append(boton("Despachar unidad", "bg-[var(--maiz)] text-[var(--suelo)] hover:brightness-105", () => despacharUnidad(r.id)));
    }
    acciones.append(
      boton("Marcar resuelta", "bg-[var(--verde-vivo)] text-[var(--suelo)] hover:brightness-110", () => resolverReporte(r.id)),
      boton("Falsa alarma", "border border-green-200/50 hover:bg-white/10", () => marcarFalsaAlarma(r.id)),
    );
    li.append(acciones);
  }
  return li;
}

function pintarAlertas(lista) {
  const orden = { nuevo: 0, en_proceso: 1, resuelto: 2, falsa_alarma: 3 };
  const ordenadas = [...lista].sort((a, b) => orden[a.estado] - orden[b.estado] || b.creadoEn.localeCompare(a.creadoEn));
  $("n-nuevas").textContent = lista.filter((r) => r.estado === "nuevo").length;
  $("n-proceso").textContent = lista.filter((r) => r.estado === "en_proceso").length;
  $("n-resueltas").textContent = lista.filter((r) => r.estado === "resuelto").length;
  $("alertas").replaceChildren(...ordenadas.map(tarjetaAlerta));
  $("sin-alertas").hidden = lista.length > 0;
  actualizarMapa(lista);
  avisarNuevas(lista);
}

/* ---------- Mapa en vivo ---------- */

function iniciarMapa() {
  if (typeof L === "undefined") {
    $("mapa").textContent = "No se pudo cargar el mapa. Revisa tu conexión a internet.";
    return;
  }
  // Centro: plaza de Sicaya. Se ajusta solo cuando hay alertas abiertas.
  mapa = L.map("mapa").setView([-12.0152, -75.2802], 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(mapa);
}

function colorEstado(estado) {
  return { nuevo: "#dc2626", en_proceso: "#facc15", resuelto: "#22c55e", falsa_alarma: "#64748b" }[estado] || "#64748b";
}

function textoPrecision(r) {
  if (r.ubicacionManual) return "Punto marcado a mano por el vecino";
  if (r.precisionM) return `GPS con precisión de ±${Math.round(r.precisionM)} m`;
  return "Precisión no registrada";
}

function enfocarEnMapa(r) {
  if (!mapa || r.lat == null || r.lng == null) return;
  $("mapa").scrollIntoView({ behavior: "smooth", block: "center" });
  mapa.flyTo([r.lat, r.lng], 18);
  marcadores.get(r.id)?.openPopup();
}

function actualizarMapa(lista) {
  if (!mapa) return;
  const vigentes = new Set();
  const abiertas = [];
  lista.filter((r) => r.lat != null && r.lng != null).forEach((r) => {
    vigentes.add(r.id);
    const abierta = r.estado === "nuevo" || r.estado === "en_proceso";
    let m = marcadores.get(r.id);
    if (!m) {
      m = L.circleMarker([r.lat, r.lng], { radius: 13, weight: 4 }).addTo(mapa);
      m.circulo = null;
      marcadores.set(r.id, m);
    }
    m.setLatLng([r.lat, r.lng]);
    m.setRadius(abierta ? 13 : 8);
    m.setStyle({ color: "#ffffff", fillColor: colorEstado(r.estado), fillOpacity: abierta ? 1 : 0.35, opacity: abierta ? 1 : 0.4 });
    m.bindPopup(`<strong>${r.tipo}</strong><br>${cuando(r.creadoEn)}<br>${estilo(r.estado).texto}<br>${textoPrecision(r)}`);
    // Círculo con el margen de error del GPS (solo en alertas abiertas)
    const radio = abierta && !r.ubicacionManual && r.precisionM ? Math.min(r.precisionM, 3000) : 0;
    if (radio && !m.circulo) {
      m.circulo = L.circle([r.lat, r.lng], { radius: radio, color: colorEstado(r.estado), weight: 1, fillOpacity: 0.12, interactive: false }).addTo(mapa);
    } else if (radio) {
      m.circulo.setLatLng([r.lat, r.lng]);
      m.circulo.setRadius(radio);
    } else if (m.circulo) {
      m.circulo.remove();
      m.circulo = null;
    }
    if (abierta) abiertas.push([r.lat, r.lng]);
  });
  marcadores.forEach((m, id) => {
    if (!vigentes.has(id)) {
      m.circulo?.remove();
      m.remove();
      marcadores.delete(id);
    }
  });
  if (!mapaAjustado && abiertas.length) {
    if (abiertas.length === 1) mapa.setView(abiertas[0], 17);
    else mapa.fitBounds(abiertas, { padding: [40, 40], maxZoom: 17 });
    mapaAjustado = true;
  }
}

/* ---------- Sonido y avisos de alertas nuevas ---------- */

function alternarSonido() {
  const boton = $("sonido");
  if (!sonidoActivo) {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    sonidoActivo = true;
    boton.textContent = "Sonido activado";
    boton.className = "rounded-lg border border-green-200/60 px-3 py-1.5 text-sm font-semibold text-white";
    sonar();
  } else {
    sonidoActivo = false;
    boton.textContent = "Activar sonido";
    boton.className = "rounded-lg bg-[var(--maiz)] px-3 py-1.5 text-sm font-semibold text-[var(--suelo)]";
  }
}

function sonar() {
  if (!sonidoActivo || !audio) return;
  const t = audio.currentTime;
  [0, 0.28, 0.56].forEach((retraso, i) => {
    const onda = audio.createOscillator();
    const volumen = audio.createGain();
    onda.type = "square";
    onda.frequency.value = i % 2 ? 880 : 660;
    volumen.gain.setValueAtTime(0.0001, t + retraso);
    volumen.gain.exponentialRampToValueAtTime(0.25, t + retraso + 0.02);
    volumen.gain.exponentialRampToValueAtTime(0.0001, t + retraso + 0.24);
    onda.connect(volumen).connect(audio.destination);
    onda.start(t + retraso);
    onda.stop(t + retraso + 0.26);
  });
}

function mostrarAviso(texto) {
  const caja = $("aviso-alerta");
  caja.textContent = texto;
  caja.hidden = false;
  setTimeout(() => { caja.hidden = true; }, 8000);
}

function parpadearTitulo(cantidad) {
  if (!document.hidden) return;
  clearInterval(parpadeo);
  let encendido = false;
  parpadeo = setInterval(() => {
    document.title = encendido ? tituloBase : `(${cantidad}) NUEVA ALERTA`;
    encendido = !encendido;
  }, 1000);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    clearInterval(parpadeo);
    document.title = tituloBase;
  }
});

function avisarNuevas(lista) {
  const nuevas = lista.filter((r) => r.estado === "nuevo" && !conocidas.has(r.id));
  lista.forEach((r) => conocidas.add(r.id));
  if (primeraCarga) { // al abrir el panel no suena por las alertas que ya estaban
    primeraCarga = false;
    return;
  }
  if (!nuevas.length) return;
  const r = nuevas[0];
  mostrarAviso(`Nueva alerta: ${r.tipo}` + (nuevas.length > 1 ? ` (y ${nuevas.length - 1} más)` : ""));
  sonar();
  parpadearTitulo(nuevas.length);
  if (mapa && r.lat != null && r.lng != null) mapa.flyTo([r.lat, r.lng], 17);
}

/* ---------- Compartir una alerta por WhatsApp (sin datos personales del vecino) ---------- */

function textoWhatsApp(r) {
  const detalle = r.texto ? `\n${r.texto}` : "";
  const lugar = r.lat != null ? `\nUbicación: https://www.google.com/maps?q=${r.lat},${r.lng}` : "";
  const mensaje = `ALERTA ${r.tipo.toUpperCase()} (${cuando(r.creadoEn)})${detalle}${lugar}`;
  return `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
}