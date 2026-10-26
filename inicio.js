const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Barra superior: transparente arriba, sólida al bajar
const nav = document.getElementById("nav");
const alDesplazar = () => nav.classList.toggle("nav-solido", scrollY > 40);
addEventListener("scroll", alDesplazar, { passive: true });
alDesplazar();

// Menú del celular
const menu = document.getElementById("menu");
const menuMovil = document.getElementById("menu-movil");
menu.onclick = () => {
  const abierto = menuMovil.classList.toggle("hidden");
  menuMovil.classList.toggle("flex", !abierto);
  menu.setAttribute("aria-expanded", String(!abierto));
};
menuMovil.onclick = (e) => {
  if (e.target.tagName === "A") {
    menuMovil.classList.add("hidden");
    menuMovil.classList.remove("flex");
  }
};

// Aparición suave al hacer scroll
const observador = new IntersectionObserver((entradas) => {
  entradas.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add("visible");
      observador.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll(".reveal").forEach((el) => observador.observe(el));

// Estadísticas reales con contador animado
function contar(el, meta) {
  if (sinMovimiento) {
    el.textContent = meta;
    return;
  }
  const inicio = performance.now();
  const paso = (t) => {
    const p = Math.min(1, (t - inicio) / 1200);
    el.textContent = Math.round(meta * p);
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

// Se carga al final, para no frenar la portada
await new Promise((listo) => (document.readyState === "complete" ? listo() : addEventListener("load", listo)));
let datos = null;
try {
  const { estadisticasPublicas } = await import("./backend.js");
  datos = await estadisticasPublicas();
} catch {
  datos = null;
}
document.querySelectorAll("[data-dato]").forEach((el) => {
  const valor = datos ? datos[el.dataset.dato] : null;
  if (valor == null) el.textContent = "-";
  else contar(el, Number(valor));
});