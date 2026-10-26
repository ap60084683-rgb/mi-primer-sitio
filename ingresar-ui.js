const $ = (id) => document.getElementById(id);

// Mostrar u ocultar la contraseña
document.querySelectorAll("[data-ver]").forEach((boton) => {
  boton.onclick = () => {
    const campo = $(boton.dataset.ver);
    const oculta = campo.type === "password";
    campo.type = oculta ? "text" : "password";
    boton.textContent = oculta ? "Ocultar" : "Ver";
  };
});

// Enlaces que cambian entre "Ingresar" y "Crear cuenta"
document.querySelectorAll("[data-ir]").forEach((enlace) => {
  enlace.onclick = () => $(`tab-${enlace.dataset.ir}`).click();
});
$("ir-registro").onclick = (e) => {
  e.preventDefault();
  $("tab-registro").click();
};
if (location.hash === "#registro") $("tab-registro").click();

// Por ahora la contraseña la restablece el serenazgo
$("olvide").onclick = () => {
  const aviso = $("aviso");
  aviso.hidden = false;
  aviso.className = "mt-4 rounded-lg px-4 py-3 text-sm font-medium bg-yellow-100 text-yellow-900";
  aviso.textContent = "Por ahora, comunícate con el serenazgo para restablecer tu contraseña.";
};

// Entrada suave de la tarjeta
requestAnimationFrame(() => document.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible")));

// Menores de edad: piden los datos de un adulto responsable
function edad(fecha) {
  const hoy = new Date();
  const nac = new Date(fecha);
  let años = hoy.getFullYear() - nac.getFullYear();
  const mes = hoy.getMonth() - nac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) años--;
  return años;
}

const nacimiento = $("rg-nacimiento");
nacimiento.max = new Date().toISOString().slice(0, 10);

function revisarEdad() {
  const menor = Boolean(nacimiento.value) && edad(nacimiento.value) < 18;
  $("bloque-tutor").hidden = !menor;
  ["rg-tutor-nombre", "rg-tutor-celular"].forEach((id) => { $(id).required = menor; });
}

nacimiento.onchange = revisarEdad;
$("form-registro").addEventListener("reset", () => setTimeout(revisarEdad, 0));

// Mascota: se inclina siguiendo el mouse (solo en equipos con mouse y sin "reducir movimiento")
const mascota = $("mascota-img");
if (mascota && matchMedia("(hover: hover)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  addEventListener("pointermove", (e) => {
    const x = (e.clientX / innerWidth - 0.5) * 2;
    const y = (e.clientY / innerHeight - 0.5) * 2;
    mascota.style.transform = `perspective(900px) rotateY(${x * 12}deg) rotateX(${-y * 8}deg)`;
  }, { passive: true });
}