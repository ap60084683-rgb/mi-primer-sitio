/* backend.js - versión SUPABASE.
   Mismas funciones que backend.demo.js (la versión de respaldo con datos locales).
   La clave publicable es pública por diseño: la seguridad la dan las reglas de esquema.sql. */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.81.1/+esm";

const SUPABASE_URL = "https://kxihtlcrdofsljhtpmxb.supabase.co";
const SUPABASE_KEY = "sb_publishable_cnlup8qfynRB3LcmEX6Mlg_kIlQf7tk";
const BUCKET = "evidencias";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function traducir(error) {
  const m = (error?.message || "").toLowerCase();
  if (m.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (m.includes("already registered")) return "Ese correo ya está registrado.";
  if (m.includes("password should")) return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera unos minutos.";
  if (m.includes("limite_reportes")) return "Enviaste muchos reportes en poco tiempo. Espera un momento o llama directamente al serenazgo.";
  if (m.includes("database error saving new user")) return "Ya existe una cuenta con ese DNI o ese correo.";
  if (m.includes("sin_permiso")) return "No tienes permiso para esta acción.";
  if (m.includes("alerta_cerrada")) return "Esta alerta ya fue cerrada.";
  if (m.includes("failed to fetch")) return "No hay conexión con el servidor. Revisa tu internet.";
  return error?.message || "Ocurrió un error inesperado.";
}

function fallar(error) {
  throw new Error(traducir(error));
}

/* ---------- Cuentas ---------- */

async function leerPerfil(id) {
  const { data } = await supabase.from("perfiles").select("nombre, rol, estado").eq("id", id).maybeSingle();
  return data;
}

export async function registrarVecino({ nombre, dni, celular, sector, nacimiento, tutorNombre, tutorCelular, correo, clave }) {
  const { error } = await supabase.auth.signUp({
    email: correo.trim().toLowerCase(),
    password: clave,
    options: {
      data: {
        nombre, dni, celular, acepto: true, sector, nacimiento,
        tutor_nombre: tutorNombre || null,
        tutor_celular: tutorCelular || null,
      },
    },
  });
  if (error) fallar(error);
  // La cuenta queda "pendiente": no debe quedar con la sesión abierta.
  await supabase.auth.signOut();
}

export async function iniciarSesion(correo, clave) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: correo.trim().toLowerCase(),
    password: clave,
  });
  if (error) fallar(error);
  const perfil = await leerPerfil(data.user.id);
  if (!perfil || perfil.estado !== "aprobado") {
    await supabase.auth.signOut();
    const mensajes = {
      rechazado: "Tu solicitud no fue aprobada. Consulta con el serenazgo.",
      suspendido: "Tu acceso está suspendido. Consulta con el serenazgo.",
    };
    throw new Error(mensajes[perfil?.estado] || "Tu cuenta espera la aprobación del serenazgo.");
  }
  return { id: data.user.id, nombre: perfil.nombre, rol: perfil.rol };
}

export async function cerrarSesion() {
  await supabase.auth.signOut();
}

export async function usuarioActual() {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const perfil = await leerPerfil(user.id);
  if (!perfil || perfil.estado !== "aprobado") return null;
  return { id: user.id, nombre: perfil.nombre, rol: perfil.rol };
}

/* ---------- Gestión de vecinos (solo administrador, lo exige la base de datos) ---------- */

export async function listarPendientes() {
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre, dni, celular, correo, sector, nacimiento, tutor_nombre, tutor_celular")
    .eq("rol", "vecino")
    .eq("estado", "pendiente")
    .order("creado_en");
  if (error) fallar(error);
  return data;
}

export async function contarVecinos() {
  const { data, error } = await supabase.from("perfiles").select("estado").in("rol", ["vecino", "respondedor"]);
  if (error) fallar(error);
  return {
    pendientes: data.filter((v) => v.estado === "pendiente").length,
    aprobados: data.filter((v) => v.estado === "aprobado").length,
  };
}

async function cambiarEstadoVecino(id, estado) {
  const { data, error } = await supabase.from("perfiles").update({ estado }).eq("id", id).select("id");
  if (error) fallar(error);
  if (!data?.length) throw new Error("No tienes permiso para cambiar a este vecino.");
}

export const aprobarVecino = (id) => cambiarEstadoVecino(id, "aprobado");
export const rechazarVecino = (id) => cambiarEstadoVecino(id, "rechazado");

export async function listarVecinos() {
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre, dni, celular, estado, rol")
    .in("rol", ["vecino", "respondedor"])
    .in("estado", ["aprobado", "suspendido"])
    .order("nombre");
  if (error) fallar(error);
  return data;
}

export const suspenderVecino = (id) => cambiarEstadoVecino(id, "suspendido");
export const reactivarVecino = (id) => cambiarEstadoVecino(id, "aprobado");

/* ---------- Reportes ---------- */

export async function enviarReporte({ tipo, texto, foto, lat, lng, precision, manual }) {
  const u = await usuarioActual();
  if (!u) throw new Error("Tu sesión terminó. Vuelve a ingresar.");

  let foto_path = null;
  if (foto) {
    const blob = await (await fetch(foto)).blob(); // la foto llega comprimida como data URL
    foto_path = `${u.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(foto_path, blob, { contentType: "image/jpeg" });
    if (error) fallar(error);
  }

  const fila = {
    tipo, texto, foto_path, lat, lng,
    precision_m: precision ?? null,
    ubicacion_manual: Boolean(manual),
  };
  let { error } = await supabase.from("reportes").insert(fila);
  // Si la base de datos aún no tiene las columnas nuevas (mejoras_5.sql), se reintenta sin ellas
  if (error && /precision_m|ubicacion_manual/.test(error.message)) {
    console.warn("Falta ejecutar mejoras_5.sql en Supabase: el reporte se envía sin la precisión.");
    const { precision_m, ubicacion_manual, ...basica } = fila;
    ({ error } = await supabase.from("reportes").insert(basica));
  }
  if (error) fallar(error);
}

/* ---------- Alertas en vivo (panel del serenazgo) ---------- */

const oyentes = new Set();
const urlsFotos = new Map(); // ruta -> { url, hasta }
let canal = null;
let reloj = null;

async function firmar(rutas) {
  const ahora = Date.now();
  const faltan = rutas.filter((r) => !(urlsFotos.get(r)?.hasta > ahora));
  if (!faltan.length) return;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(faltan, 3600);
  (data || []).forEach((d) => {
    if (d.signedUrl) urlsFotos.set(d.path, { url: d.signedUrl, hasta: ahora + 50 * 60 * 1000 });
  });
}

async function recargar() {
  const { data, error } = await supabase
    .from("reportes")
    .select("*, perfiles(celular, sector), respuestas(estado, usuario_nombre, usuario_celular)")
    .order("creado_en", { ascending: false })
    .or(`estado.in.(nuevo,en_proceso),creado_en.gte.${new Date(Date.now() - 7 * 86400000).toISOString()}`)
    .limit(100);
  if (error) {
    console.error(error);
    return;
  }
  await firmar(data.filter((r) => r.foto_path).map((r) => r.foto_path));
  const lista = data.map((r) => ({
    id: r.id,
    usuarioNombre: r.usuario_nombre,
    tipo: r.tipo,
    texto: r.texto,
    foto: r.foto_path ? urlsFotos.get(r.foto_path)?.url ?? null : null,
    lat: r.lat,
    lng: r.lng,
    creadoEn: r.creado_en,
    estado: r.estado,
    usuarioCelular: r.perfiles?.celular ?? null,
    usuarioSector: r.perfiles?.sector ?? null,
    precisionM: r.precision_m ?? null,
    ubicacionManual: r.ubicacion_manual ?? false,
    respuestas: r.respuestas ?? [],
    ultimoCambioPor: r.ultimo_cambio_por,
    ultimoCambioEn: r.ultimo_cambio_en,
  }));
  oyentes.forEach((callback) => callback(lista));
}

export function escucharReportes(callback) {
  oyentes.add(callback);
  if (!canal) {
    canal = supabase
      .channel("reportes-en-vivo")
      .on("postgres_changes", { event: "*", schema: "public", table: "reportes" }, recargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "respuestas" }, recargar)
      .subscribe();
    reloj = setInterval(recargar, 30000); // respaldo por si se corta la conexión en vivo
  }
  recargar();
  return () => {
    oyentes.delete(callback);
    if (!oyentes.size && canal) {
      supabase.removeChannel(canal);
      clearInterval(reloj);
      canal = null;
    }
  };
}

async function cambiarReporte(id, campos) {
  const { data, error } = await supabase.from("reportes").update(campos).eq("id", id).select("id");
  if (error) fallar(error);
  if (!data?.length) throw new Error("No tienes permiso para cambiar este reporte.");
  recargar();
}

export const despacharUnidad = (id) =>
  cambiarReporte(id, { estado: "en_proceso", despachado_en: new Date().toISOString() });
export const resolverReporte = (id) =>
  cambiarReporte(id, { estado: "resuelto", resuelto_en: new Date().toISOString() });
export const marcarFalsaAlarma = (id) =>
  cambiarReporte(id, { estado: "falsa_alarma", resuelto_en: new Date().toISOString() });

/* ---------- Estadísticas públicas (solo totales, sin datos personales) ---------- */

export async function estadisticasPublicas() {
  const { data, error } = await supabase.rpc("estadisticas_publicas");
  if (error) fallar(error);
  return data;
}

/* ---------- Red comunitaria (junta directiva y vecinos de confianza) ---------- */

async function cambiarRol(id, rol) {
  const { data, error } = await supabase.from("perfiles").update({ rol }).eq("id", id).select("id");
  if (error) fallar(error);
  if (!data?.length) throw new Error("No tienes permiso para cambiar este rol.");
}

export const designarRespondedor = (id) => cambiarRol(id, "respondedor");
export const quitarRespondedor = (id) => cambiarRol(id, "vecino");

// Solo alertas abiertas y sin datos personales de quien reportó
export async function alertasComunidad() {
  const { data, error } = await supabase.rpc("alertas_comunidad");
  if (error) fallar(error);
  return data.map((r) => ({
    id: r.id, tipo: r.tipo, texto: r.texto, lat: r.lat, lng: r.lng,
    creadoEn: r.creado_en, estado: r.estado,
    enCamino: Number(r.en_camino), miEstado: r.mi_estado,
  }));
}

// estado: "en_camino", "llegue" o "cancelado"
export async function responderAlerta(id, estado) {
  const { error } = await supabase.rpc("responder_alerta", { p_reporte: id, p_estado: estado });
  if (error) fallar(error);
}