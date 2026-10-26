import { usuarioActual, cerrarSesion, enviarReporte } from "./backend.js";

const $ = (id) => document.getElementById(id);
const yo = await usuarioActual();

let foto = null;   // foto comprimida (data URL)
let pos = null;    // { lat, lng, precision, manual }
let mapa = null;
let pin = null;
let circulo = null;
let vigilante = null;

if (!yo) {
  location.replace("ingresar.html");
} else if (yo.rol === "admin") {
  location.replace("panel.html");
} else {
  $("vecino").textContent = yo.nombre;
  if (yo.rol === "respondedor") $("ir-comunidad").hidden = false;
  $("salir").onclick = async () => { await cerrarSesion(); location.replace("ingresar.html"); };
  iniciarMapa();
  ubicar();
}

function aviso(texto) {
  $("aviso").textContent = texto;
  $("aviso").hidden = !texto;
}

/* Reduce la foto para que pese poco (importante con datos móviles y poco espacio). */
function comprimir(archivo, max = 900, calidad = 0.6) {
  return new Promise((ok, fallo) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL("image/jpeg", calidad));
    };
    img.onerror = () => fallo(new Error("No se pudo leer la foto."));
    img.src = url;
  });
}

function iniciarMapa() {
  if (typeof L === "undefined") return; // sin mapa se usa solo el GPS
  mapa = L.map("mapa-reporte").setView([-12.0152, -75.2802], 15); // plaza de Sicaya
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(mapa);
  // Tocar el mapa marca el punto exacto del incidente
  mapa.on("click", (e) => colocarPin(e.latlng.lat, e.latlng.lng, true, null));
}

function limpiarPin() {
  pin?.remove();
  circulo?.remove();
  pin = null;
  circulo = null;
}

function colocarPin(lat, lng, manual, precision) {
  pos = { lat, lng, manual, precision };
  if (mapa) {
    if (!pin) {
      pin = L.marker([lat, lng], {
        draggable: true,
        icon: L.divIcon({ className: "", html: '<div class="pin-reporte"></div>', iconSize: [28, 28], iconAnchor: [14, 28] }),
      }).addTo(mapa);
      pin.on("dragend", () => {
        const p = pin.getLatLng();
        colocarPin(p.lat, p.lng, true, null);
      });
    } else {
      pin.setLatLng([lat, lng]);
    }
    circulo?.remove();
    circulo = null;
    if (!manual && precision) {
      circulo = L.circle([lat, lng], { radius: precision, color: "#14532d", weight: 1, fillOpacity: 0.12, interactive: false }).addTo(mapa);
    }
  }
  $("ubicacion").textContent = manual
    ? "Marcaste el punto en el mapa. Puedes arrastrar el pin si necesitas ajustarlo."
    : `Ubicación por GPS, con una precisión de unos ${precision} metros. Si no es exacta, toca el mapa o arrastra el pin.`;
}

function ubicar() {
  $("ubicacion").textContent = "Buscando tu ubicación...";
  if (!navigator.geolocation) {
    $("ubicacion").textContent = "Este navegador no permite obtener la ubicación. Toca el mapa para marcar el lugar.";
    return;
  }
  if (vigilante !== null) navigator.geolocation.clearWatch(vigilante);
  let mejor = Infinity;
  const detener = () => {
    if (vigilante !== null) navigator.geolocation.clearWatch(vigilante);
    vigilante = null;
  };
  // Se escucha el GPS unos segundos y se queda con la lectura más precisa
  vigilante = navigator.geolocation.watchPosition(
    (p) => {
      if (pos?.manual) return; // si el vecino ya marcó el punto, no se lo cambiamos
      const precision = Math.round(p.coords.accuracy);
      if (precision < mejor) {
        mejor = precision;
        colocarPin(p.coords.latitude, p.coords.longitude, false, precision);
        mapa?.setView([p.coords.latitude, p.coords.longitude], 18);
      }
      if (precision <= 15) detener();
    },
    (e) => {
      detener();
      if (pos) return; // ya hay un punto marcado
      $("ubicacion").textContent = e.code === 1
        ? 'No diste permiso de ubicación. Actívalo en el navegador y pulsa "Actualizar ubicación", o toca el mapa para marcar el lugar.'
        : 'No se pudo obtener la ubicación. Pulsa "Actualizar ubicación" para reintentar, o toca el mapa para marcar el lugar.';
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  );
  setTimeout(detener, 15000);
}

$("reubicar").onclick = () => {
  pos = null;
  limpiarPin();
  ubicar();
};

$("texto").oninput = () => { $("contador").textContent = `${$("texto").value.length} / 200`; };

$("foto").onchange = async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  try {
    foto = await comprimir(archivo);
    $("vista").src = foto;
    $("vista").hidden = false;
    aviso("");
  } catch (err) {
    foto = null;
    aviso(err.message);
  }
};

$("form").onsubmit = async (e) => {
  e.preventDefault();
  const tipo = $("form").elements.tipo.value;
  if (!tipo) return aviso("Elige qué está pasando antes de enviar.");
  if (!pos && !confirm("No marcaste el lugar del incidente. ¿Enviar el reporte sin ubicación?")) return;
  aviso("");
  $("enviar").disabled = true;
  try {
    await enviarReporte({
      tipo, texto: $("texto").value.trim(), foto,
      lat: pos ? pos.lat : null, lng: pos ? pos.lng : null,
      precision: pos ? pos.precision : null, manual: pos ? pos.manual : false,
    });
    const cuando = new Date().toLocaleString("es-PE");
    $("exito-detalle").textContent = `Tu reporte de "${tipo}" llegó al serenazgo el ${cuando}.` +
      (pos ? "" : " Se envió sin ubicación.");
    $("form").hidden = true;
    $("exito").hidden = false;
  } catch (err) {
    aviso(err.message);
  } finally {
    $("enviar").disabled = false;
  }
};

$("otro").onclick = () => {
  $("form").reset();
  foto = null;
  $("vista").hidden = true;
  $("contador").textContent = "0 / 200";
  $("exito").hidden = true;
  $("form").hidden = false;
  limpiarPin();
  pos = null;
  mapa?.invalidateSize();
  ubicar();
};