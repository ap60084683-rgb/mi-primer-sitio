import { registrarVecino, iniciarSesion, usuarioActual } from "./backend.js";

const $ = (id) => document.getElementById(id);
const pestanas = { ingresar: $("tab-ingresar"), registro: $("tab-registro") };
const formularios = { ingresar: $("form-ingresar"), registro: $("form-registro") };

function mostrar(cual) {
  for (const k of Object.keys(pestanas)) {
    const activa = k === cual;
    pestanas[k].setAttribute("aria-selected", activa);
    pestanas[k].classList.toggle("bg-[var(--verde)]", activa);
    pestanas[k].classList.toggle("text-white", activa);
    formularios[k].hidden = !activa;
  }
  aviso("");
}

function aviso(texto, tipo = "error") {
  const caja = $("aviso");
  caja.textContent = texto;
  caja.hidden = !texto;
  caja.className = "mt-4 rounded-lg px-4 py-3 text-sm font-medium " +
    (tipo === "ok" ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900");
}

pestanas.ingresar.onclick = () => mostrar("ingresar");
pestanas.registro.onclick = () => mostrar("registro");

formularios.ingresar.onsubmit = async (e) => {
  e.preventDefault();
  try {
    const u = await iniciarSesion($("in-correo").value, $("in-clave").value);
    if (u.rol === "admin") {
      location.href = "panel.html";
      return;
    }
    location.href = u.rol === "respondedor" ? "comunidad.html" : "reporte.html";
  } catch (err) {
    aviso(err.message);
  }
};

formularios.registro.onsubmit = async (e) => {
  e.preventDefault();
  try {
    await registrarVecino({
      nombre: $("rg-nombre").value.trim(),
      dni: $("rg-dni").value.trim(),
      celular: $("rg-celular").value.trim(),
      sector: $("rg-sector").value,
      nacimiento: $("rg-nacimiento").value,
      tutorNombre: $("rg-tutor-nombre").value.trim(),
      tutorCelular: $("rg-tutor-celular").value.trim(),
      correo: $("rg-correo").value,
      clave: $("rg-clave").value,
    });
    formularios.registro.reset();
    aviso("Solicitud enviada. Podrás ingresar cuando el serenazgo apruebe tu cuenta.", "ok");
  } catch (err) {
    aviso(err.message);
  }
};

mostrar("ingresar");
const sesion = await usuarioActual();
if (sesion) {
  location.replace(sesion.rol === "admin" ? "panel.html" : sesion.rol === "respondedor" ? "comunidad.html" : "reporte.html");
}