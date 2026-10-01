// Cliente de la API REST de la biblioteca: pide los datos al servidor y pinta
// el catálogo, los préstamos y la lista de deseos.

"use strict";

const $ = (selector, raiz = document) => raiz.querySelector(selector);
const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

let mensajes = {};  // catálogo de traducciones que entrega /api/i18n
let reglas = {};    // expresiones regulares que entrega /api/validation-rules
let idioma = document.documentElement.lang || "es";

// Lo último que respondió el servidor. La interfaz se pinta siempre a partir de aquí.
const datos = {
  libros: [],
  prestamos: [],
  deseos: { book_ids: [], books: [], max: 5 },
};

const filtros = { libros: "todos", prestamos: "todos", busqueda: "" };

const reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- Utilidades --------------------------------------------------------------

/** Traduce una clave sustituyendo sus parámetros: t("wishlist.count", {count: 2, max: 5}) */
function t(clave, params = {}) {
  let texto = mensajes[clave] ?? clave;
  for (const [nombre, valor] of Object.entries(params)) {
    texto = texto.split(`{${nombre}}`).join(valor);
  }
  return texto;
}

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto == null ? "" : texto;
  return div.innerHTML;
}

function icono(nombre) {
  return `<svg class="ic" aria-hidden="true"><use href="#i-${nombre}"/></svg>`;
}

const moneda = (valor) => t("currency", { amount: Number(valor).toFixed(2) });

/** Quita tildes y mayúsculas para que «cortazar» encuentre a «Cortázar». */
function normalizar(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Las fechas llegan como AAAA-MM-DD y se leen como fecha LOCAL: con
// new Date("2026-09-30") el navegador la tomaría en UTC y en Perú mostraría
// el día anterior.
function aFecha(iso) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

function hoyISO() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function diasEntre(desde, hasta) {
  return Math.round((aFecha(hasta) - aFecha(desde)) / 86400000);
}

function fecha(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(idioma === "en" ? "en-US" : "es-PE", {
    day: "numeric", month: "short", year: "numeric",
  }).format(aFecha(iso));
}

/** Llama a la API y convierte el {error} del servidor en una excepción. */
async function api(url, opciones) {
  const respuesta = await fetch(url, opciones);
  const cuerpo = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(cuerpo.error || t("error.unexpected"));
  }
  return cuerpo;
}

// --- Avisos flotantes ----------------------------------------------------------

function avisar(texto, tipo = "ok") {
  const duracion = tipo === "error" ? 7000 : 4500;
  const aviso = document.createElement("div");
  aviso.className = `toast ${tipo}`;
  aviso.setAttribute("role", tipo === "error" ? "alert" : "status");
  aviso.style.setProperty("--duracion", `${duracion}ms`);
  aviso.innerHTML = `
    <span class="toast-ic">${icono(tipo === "error" ? "alert" : "check")}</span>
    <div class="toast-texto">
      <strong>${t(tipo === "error" ? "toast.error" : "toast.ok")}</strong>
      <p>${escapar(texto)}</p>
    </div>
    <button type="button" class="toast-cerrar" aria-label="${t("toast.close")}">${icono("x")}</button>
    <span class="toast-tiempo"></span>`;

  const contenedor = $("#toasts");
  contenedor.prepend(aviso);
  [...contenedor.children].slice(3).forEach((viejo) => viejo.remove());

  const cerrar = () => {
    if (!aviso.isConnected) return;
    aviso.classList.add("saliendo");
    setTimeout(() => aviso.remove(), reducirMovimiento ? 0 : 240);
  };
  aviso.querySelector(".toast-cerrar").addEventListener("click", cerrar);
  setTimeout(cerrar, duracion);
}

// --- Navegación entre secciones -------------------------------------------------

const VISTAS = ["catalogo", "prestamos", "deseos"];

function mostrarVista() {
  const pedida = location.hash.replace(/^#\/?/, "");
  const actual = VISTAS.includes(pedida) ? pedida : "catalogo";
  $$(".vista").forEach((seccion) => { seccion.hidden = seccion.dataset.vista !== actual; });

  const enlace = $(`.nav a[data-ir="${actual}"]`);
  $$(".nav a").forEach((a) => {
    a.classList.toggle("activo", a === enlace);
    if (a === enlace) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });

  // El título de la barra superior se copia del menú, que ya viene traducido.
  $("#topbar-texto").textContent = enlace.querySelector("span").textContent;
  $("#topbar-icono").setAttribute("href", `#i-${enlace.dataset.icono}`);

  document.body.classList.remove("menu-abierto");
  $("#velo").hidden = true;
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", mostrarVista);

// Menú lateral en pantallas pequeñas.
$("#btn-menu").addEventListener("click", () => {
  const abierto = document.body.classList.toggle("menu-abierto");
  $("#velo").hidden = !abierto;
});

$("#velo").addEventListener("click", () => {
  document.body.classList.remove("menu-abierto");
  $("#velo").hidden = true;
});

// --- Menú desplegable de idioma --------------------------------------------------

const botonIdioma = $("#idioma-btn");
const menuIdioma = $("#idioma-menu");
const opcionesIdioma = $$("[role='option']", menuIdioma);

function abrirMenuIdioma() {
  menuIdioma.hidden = false;
  botonIdioma.setAttribute("aria-expanded", "true");
  (opcionesIdioma.find((o) => o.getAttribute("aria-selected") === "true") || opcionesIdioma[0]).focus();
}

function cerrarMenuIdioma(devolverFoco = false) {
  if (menuIdioma.hidden) return;
  menuIdioma.hidden = true;
  botonIdioma.setAttribute("aria-expanded", "false");
  if (devolverFoco) botonIdioma.focus();
}

botonIdioma.addEventListener("click", () => {
  if (menuIdioma.hidden) abrirMenuIdioma();
  else cerrarMenuIdioma();
});

menuIdioma.addEventListener("click", (evento) => {
  const opcion = evento.target.closest("[data-lang]");
  if (opcion) cambiarIdioma(opcion.dataset.lang);
});

menuIdioma.addEventListener("keydown", (evento) => {
  const posicion = opcionesIdioma.indexOf(document.activeElement);
  if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
    evento.preventDefault();
    const paso = evento.key === "ArrowDown" ? 1 : -1;
    opcionesIdioma[(posicion + paso + opcionesIdioma.length) % opcionesIdioma.length].focus();
  } else if ((evento.key === "Enter" || evento.key === " ") && posicion !== -1) {
    evento.preventDefault();
    cambiarIdioma(opcionesIdioma[posicion].dataset.lang);
  } else if (evento.key === "Tab") {
    cerrarMenuIdioma();
  }
});

document.addEventListener("click", (evento) => {
  if (!evento.target.closest("#idioma")) cerrarMenuIdioma();
});

// El servidor guarda el idioma en la sesión y se recarga la página para que
// también los textos fijos de la plantilla vengan traducidos.
async function cambiarIdioma(codigo) {
  cerrarMenuIdioma(true);
  if (codigo === idioma) return;
  try {
    await api(`/api/i18n/${codigo}`, { method: "POST" });
  } catch (error) {
    avisar(error.message, "error");
    return;
  }
  // Sin ?lang= en la URL: ese parámetro volvería a imponer el idioma anterior.
  if (location.search) location.href = location.pathname + location.hash;
  else location.reload();
}

// ===========================================================================
//  VALIDACIÓN DE LOS FORMULARIOS
//  Los patrones se piden a /api/validation-rules: el navegador avisa en el
//  momento con las mismas reglas que después aplica el servidor.
// ===========================================================================

function campoValido(input) {
  const patron = reglas[input.dataset.regla];
  if (!patron) return true;
  return new RegExp(patron).test(input.value.trim());
}

/** Pinta el campo (borde, icono y mensaje) según el resultado. */
function marcarCampo(input, valido, mostrarError, mensajeVisible) {
  const campo = input.closest(".campo");
  const fallo = campo.querySelector(".fallo");
  const relleno = input.value.trim() !== "";

  input.classList.toggle("invalido", mostrarError && !valido);
  input.classList.toggle("valido", valido && relleno);
  input.setAttribute("aria-invalid", String(mostrarError && !valido));
  campo.classList.toggle("es-valido", valido && relleno);
  campo.classList.toggle("es-invalido", mostrarError && !valido);

  if (mensajeVisible) {
    fallo.textContent = t("error.invalid_" + input.dataset.regla);
    fallo.hidden = false;
  } else {
    fallo.hidden = true;
  }
}

/** Revisa un campo al salir de él. Un campo vacío se marca, pero sin mensaje. */
function revisarCampo(input) {
  const valido = campoValido(input);
  marcarCampo(input, valido, true, !valido && input.value.trim() !== "");
  return valido;
}

/** Valida el formulario entero. Devuelve true solo si todos los campos pasan. */
function formularioValido(form) {
  const campos = $$("[data-regla]", form);
  const resultados = campos.map((input) => {
    const valido = campoValido(input);
    marcarCampo(input, valido, true, !valido);
    return valido;
  });
  const primerFallo = campos.find((c) => c.classList.contains("invalido"));
  if (primerFallo) primerFallo.focus();
  return resultados.every(Boolean);
}

function activarValidacion(form) {
  $$("[data-regla]", form).forEach((input) => {
    input.addEventListener("blur", () => revisarCampo(input));
    input.addEventListener("input", () => {
      // Mientras se escribe solo se quita el error, no se añade: molesta menos.
      if (input.classList.contains("invalido") && campoValido(input)) revisarCampo(input);
    });
  });
}

function limpiarFormulario(form) {
  form.reset();
  $$("[data-regla]", form).forEach((input) => {
    input.classList.remove("invalido", "valido");
    input.removeAttribute("aria-invalid");
    const campo = input.closest(".campo");
    campo.classList.remove("es-valido", "es-invalido");
    campo.querySelector(".fallo").hidden = true;
  });
}

// --- Portadas -------------------------------------------------------------------
// Cada libro tiene una portada generada (colores derivados del título). Si Open
// Library tiene la portada real de su ISBN, se pone encima; si no, se queda la
// generada.

const PALETAS = [
  ["#7c3aed", "#db2777"], ["#2563eb", "#7c3aed"], ["#0891b2", "#4f46e5"], ["#059669", "#0e7490"],
  ["#ea580c", "#be123c"], ["#c026d3", "#f97316"], ["#4338ca", "#0ea5e9"], ["#9333ea", "#e11d48"],
];

function paleta(texto) {
  let h = 7;
  for (const c of String(texto ?? "")) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return PALETAS[h % PALETAS.length];
}

const portadasCargadas = new Set();
const portadasFallidas = new Set();

function portadaHTML(libro, clase = "") {
  const [c1, c2] = paleta(libro.title);
  let imagen = "";
  if (libro.isbn && !portadasFallidas.has(libro.isbn)) {
    const url = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(libro.isbn)}-L.jpg?default=false`;
    imagen = `<img src="${url}" alt="" decoding="async" data-isbn="${escapar(libro.isbn)}"
                   class="${portadasCargadas.has(libro.isbn) ? "cargada" : ""}">`;
  }
  return `
    <div class="portada ${clase}" style="--c1:${c1};--c2:${c2}">
      <div class="portada-arte" aria-hidden="true">
        <span class="portada-titulo">${escapar(libro.title)}</span>
        <span class="portada-autor">${escapar(libro.author)}</span>
      </div>
      <span class="portada-inicial" aria-hidden="true">${escapar((libro.title || "?").trim().charAt(0))}</span>
      ${imagen}
    </div>`;
}

// Los eventos load y error de las imágenes no burbujean: se capturan.
document.addEventListener("load", (evento) => {
  const img = evento.target;
  if (img.tagName === "IMG" && img.dataset.isbn) {
    portadasCargadas.add(img.dataset.isbn);
    img.classList.add("cargada");
  }
}, true);

document.addEventListener("error", (evento) => {
  const img = evento.target;
  if (img.tagName === "IMG" && img.dataset.isbn) {
    portadasFallidas.add(img.dataset.isbn);
    const enPortadaPrincipal = img.closest("#hero-libros");
    img.remove();
    if (enPortadaPrincipal) pintarHeroLibros();
  }
}, true);

// --- Piezas reutilizables ---------------------------------------------------------

function avatar(nombre) {
  const iniciales = String(nombre).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const [c1, c2] = paleta(nombre);
  return `<span class="avatar" style="--c1:${c1};--c2:${c2}" aria-hidden="true">${escapar(iniciales)}</span>`;
}

function vacioHTML(nombreIcono, texto) {
  return `<div class="vacio"><span class="vacio-ic">${icono(nombreIcono)}</span><p>${texto}</p></div>`;
}

const libroDe = (id) => datos.libros.find((libro) => libro.id === id);
const prestamoActivoDe = (bookId) => datos.prestamos.find((p) => p.book_id === bookId && p.is_active);
const enLista = (id) => datos.deseos.book_ids.includes(id);

/** Los datos del libro de un préstamo (si el libro sigue en el catálogo). */
function libroDelPrestamo(p) {
  return libroDe(p.book_id) || { title: p.book_title, author: "", isbn: null };
}

// --- Catálogo ---------------------------------------------------------------------

/** Tres portadas en abanico; primero las de libros que tienen portada real. */
function pintarHeroLibros() {
  const conPortada = datos.libros.filter((l) => l.isbn && !portadasFallidas.has(l.isbn));
  const elegidos = [...conPortada, ...datos.libros.filter((l) => !conPortada.includes(l))].slice(0, 3);
  $("#hero-libros").innerHTML = elegidos.map((libro) => portadaHTML(libro)).join("");
}

function librosFiltrados() {
  const consulta = normalizar(filtros.busqueda);
  const consultaIsbn = consulta.replace(/[-\s]/g, "");
  return datos.libros.filter((libro) => {
    if (filtros.libros === "disponibles" && !libro.available) return false;
    if (filtros.libros === "prestados" && libro.available) return false;
    if (filtros.libros === "deseos" && !enLista(libro.id)) return false;
    if (!consulta) return true;
    return normalizar(`${libro.title} ${libro.author} ${libro.year ?? ""}`).includes(consulta)
      || (consultaIsbn !== "" && (libro.isbn || "").includes(consultaIsbn));
  });
}

function tarjetaLibro(libro) {
  const prestamo = libro.available ? null : prestamoActivoDe(libro.id);
  const deseado = enLista(libro.id);
  const tituloDeseo = t(deseado ? "action.wishlist_remove" : "action.wishlist_add");

  const estado = libro.available
    ? `<span class="pill pill-ok libro-estado">${icono("check")}${t("status.available")}</span>`
    : `<span class="pill pill-mal libro-estado">${icono("clock")}${t("status.borrowed")}</span>`;

  const detallePrestamo = prestamo ? `
    <div class="libro-prestamo ${prestamo.days_late > 0 ? "tarde" : ""}">
      ${avatar(prestamo.borrower)}
      <span>${t("book.lent_to", { borrower: escapar(prestamo.borrower) })}
        <small>${prestamo.days_late > 0
          ? t("due.late", { days: prestamo.days_late }) + " · " + moneda(prestamo.fine)
          : t("book.due", { date: fecha(prestamo.due_date) })}</small>
      </span>
    </div>` : "";

  const accion = libro.available
    ? `<button type="button" class="btn btn-grad btn-chico" data-prestar="${libro.id}">${icono("send")}${t("action.lend")}</button>`
    : prestamo
      ? `<button type="button" class="btn btn-suave btn-chico" data-devolver="${prestamo.id}">${icono("undo")}${t("action.return")}</button>`
      : "";

  return `
    <article class="libro ${libro.available ? "" : "no-disponible"}" style="--c1:${paleta(libro.title)[0]}">
      <div class="libro-escenario">
        ${estado}
        <button type="button" class="btn-deseo ${deseado ? "activo" : ""}" data-deseo="${libro.id}"
                aria-pressed="${deseado}" title="${tituloDeseo}" aria-label="${tituloDeseo}">${icono("star")}</button>
        ${portadaHTML(libro)}
      </div>
      <div class="libro-cuerpo">
        <h3 class="libro-titulo">${escapar(libro.title)}</h3>
        <p class="libro-autor">${escapar(libro.author)}</p>
        <p class="libro-meta">
          <span>${libro.year ?? ""}</span>
          <span class="mono">${libro.isbn ? "ISBN " + escapar(libro.isbn) : ""}</span>
        </p>
        ${detallePrestamo}
      </div>
      <div class="libro-acciones">
        ${accion}
        <button type="button" class="icono-btn chico peligro" data-eliminar="${libro.id}"
                title="${t("action.delete")}" aria-label="${t("action.delete")}">${icono("trash")}</button>
      </div>
    </article>`;
}

function pintarCatalogo() {
  const disponibles = datos.libros.filter((l) => l.available).length;
  const cuentas = {
    todos: datos.libros.length,
    disponibles,
    prestados: datos.libros.length - disponibles,
    deseos: datos.libros.filter((l) => enLista(l.id)).length,
  };
  $$("#filtros-libros button").forEach((boton) => {
    const activo = boton.dataset.filtro === filtros.libros;
    boton.classList.toggle("activo", activo);
    boton.setAttribute("aria-pressed", String(activo));
    boton.querySelector("b").textContent = cuentas[boton.dataset.filtro];
  });

  const libros = librosFiltrados();
  $("#conteo-libros").textContent = t("catalog.count", { count: libros.length, total: datos.libros.length });
  $("#rejilla-libros").innerHTML = libros.length
    ? libros.map(tarjetaLibro).join("")
    : vacioHTML("search", t(datos.libros.length === 0 ? "empty.books" : "catalog.no_results"));
}

$("#buscar").addEventListener("input", (evento) => {
  filtros.busqueda = evento.target.value;
  pintarCatalogo();
});

$("#filtros-libros").addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-filtro]");
  if (!boton) return;
  filtros.libros = boton.dataset.filtro;
  pintarCatalogo();
});

// --- Préstamos ---------------------------------------------------------------------

/** Barra con los días que han pasado del plazo del préstamo. */
function progresoHTML(p) {
  const plazo = Math.max(1, diasEntre(p.loan_date, p.due_date));
  const transcurridos = Math.max(0, diasEntre(p.loan_date, hoyISO()));
  const quedan = diasEntre(hoyISO(), p.due_date);
  const tono = p.days_late > 0 ? "mal" : quedan <= 3 ? "aviso" : "";
  return `
    <div class="progreso">
      <div class="barra ${tono}"><span style="width:${Math.min(100, (transcurridos / plazo) * 100).toFixed(1)}%"></span></div>
      <small>${t("loan.progress", { elapsed: Math.min(transcurridos, plazo), total: plazo })}</small>
    </div>`;
}

function tarjetaPrestamo(p) {
  const estado = !p.is_active ? "devuelto" : p.days_late > 0 ? "atrasado" : "activo";

  let pastilla;
  if (estado === "devuelto") {
    pastilla = `<span class="pill pill-ok">${icono("check")}${t("loan.status_returned")}</span>`;
  } else if (estado === "atrasado") {
    pastilla = `<span class="pill pill-mal">${icono("alert")}${t("due.late", { days: p.days_late })}</span>`;
  } else {
    const quedan = diasEntre(hoyISO(), p.due_date);
    pastilla = quedan <= 0
      ? `<span class="pill pill-aviso">${icono("clock")}${t("due.today")}</span>`
      : `<span class="pill ${quedan <= 3 ? "pill-aviso" : "pill-info"}">${icono("clock")}${t("due.in_days", { days: quedan })}</span>`;
  }

  const multa = p.fine > 0
    ? `<span class="pill ${p.is_active ? "pill-mal" : "pill-neutro"}">${icono("coins")}${t("loan.fine", { fine: moneda(p.fine) })}</span>`
    : "";

  return `
    <article class="prestamo ${estado}">
      ${portadaHTML(libroDelPrestamo(p), "mini")}
      <div class="prestamo-libro">
        <span class="prestamo-id">#${p.id}</span>
        <h3>${escapar(p.book_title)}</h3>
        <span class="persona">${avatar(p.borrower)}<span>${escapar(p.borrower)}</span></span>
      </div>
      <div class="prestamo-fechas">
        <div class="fecha"><small>${t("table.loan_date")}</small><strong>${fecha(p.loan_date)}</strong></div>
        ${icono("arrow-right")}
        <div class="fecha"><small>${t("table.due_date")}</small><strong>${fecha(p.due_date)}</strong></div>
        ${icono("arrow-right")}
        <div class="fecha"><small>${t("table.return_date")}</small><strong>${fecha(p.return_date)}</strong></div>
      </div>
      <div class="prestamo-estado">
        ${pastilla}
        ${p.is_active && !p.days_late ? progresoHTML(p) : multa}
      </div>
      <div class="prestamo-acciones">${p.is_active
        ? `<button type="button" class="btn btn-suave btn-chico" data-devolver="${p.id}">${icono("undo")}${t("action.return")}</button>`
        : ""}</div>
    </article>`;
}

function pintarPrestamos() {
  const activos = datos.prestamos.filter((p) => p.is_active);
  const grupos = {
    todos: datos.prestamos,
    activos,
    atrasados: activos.filter((p) => p.days_late > 0),
    devueltos: datos.prestamos.filter((p) => !p.is_active),
  };
  $$("#filtros-prestamos button").forEach((boton) => {
    const clave = boton.dataset.filtroPrestamo;
    boton.classList.toggle("activo", clave === filtros.prestamos);
    boton.setAttribute("aria-pressed", String(clave === filtros.prestamos));
    boton.querySelector("b").textContent = grupos[clave].length;
  });

  const lista = grupos[filtros.prestamos];
  $("#lista-prestamos").innerHTML = lista.length
    ? lista.map(tarjetaPrestamo).join("")
    : vacioHTML("inbox", t(datos.prestamos.length === 0 ? "empty.loans" : "loans.no_results"));
}

$("#filtros-prestamos").addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-filtro-prestamo]");
  if (!boton) return;
  filtros.prestamos = boton.dataset.filtroPrestamo;
  pintarPrestamos();
});

// --- Lista de deseos ------------------------------------------------------------------

function pintarDeseos() {
  const d = datos.deseos;
  const huecos = [];
  for (let i = 0; i < d.max; i++) {
    const libro = d.books[i];
    huecos.push(libro
      ? `<div class="hueco">
           ${portadaHTML(libro)}
           <button type="button" class="hueco-quitar" data-deseo="${libro.id}"
                   title="${t("action.wishlist_remove")}" aria-label="${t("action.wishlist_remove")}">${icono("x")}</button>
           <span class="hueco-titulo">${escapar(libro.title)}</span>
           <span class="hueco-autor">${escapar(libro.author)}</span>
         </div>`
      : `<div class="hueco libre"><span>${i + 1}</span><small>${t("wishlist.slot_empty")}</small></div>`);
  }
  $("#lista-deseos").innerHTML = huecos.join("");

  const anillo = $("#anillo-deseos");
  anillo.style.setProperty("--p", (d.books.length / d.max) * 100);
  anillo.querySelector("b").textContent = `${d.books.length}/${d.max}`;
  $("#deseos-pie").textContent = d.books.length === 0
    ? t("wishlist.empty")
    : t("wishlist.count", { count: d.books.length, max: d.max });
}

// --- Recarga general ----------------------------------------------------------------

async function recargar() {
  const [deseos, libros, prestamos] = await Promise.all([
    api("/api/wishlist"),
    api("/api/books"),
    api("/api/loans"),
  ]);
  Object.assign(datos, { deseos, libros, prestamos });

  $("#nav-libros").textContent = libros.length;
  $("#nav-prestamos").textContent = prestamos.filter((p) => p.is_active).length;
  $("#nav-deseos").textContent = deseos.books.length;

  pintarHeroLibros();
  pintarCatalogo();
  pintarPrestamos();
  pintarDeseos();
}

// --- Panel lateral y diálogos ---------------------------------------------------------

let focoAnterior = null;

function abrirCapa(capa, foco) {
  focoAnterior = document.activeElement;
  capa.classList.remove("cerrando");
  capa.hidden = false;
  document.body.classList.add("sin-scroll");
  if (foco) setTimeout(() => foco.focus(), reducirMovimiento ? 0 : 60);
}

function cerrarCapa(capa) {
  if (capa.hidden) return;
  capa.classList.add("cerrando");
  setTimeout(() => {
    capa.hidden = true;
    capa.classList.remove("cerrando");
    if ($$(".capa").every((c) => c.hidden)) document.body.classList.remove("sin-scroll");
  }, reducirMovimiento ? 0 : 200);
  if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus();
}

// Cerrar pulsando fuera del cuadro.
$$(".capa").forEach((capa) => {
  capa.addEventListener("mousedown", (evento) => {
    if (evento.target !== capa) return;
    if (capa.id === "capa-confirmar") responderConfirmacion(false);
    else cerrarCapa(capa);
  });
});

// La tecla Escape cierra lo que esté más arriba.
document.addEventListener("keydown", (evento) => {
  if (evento.key !== "Escape") return;
  if (!menuIdioma.hidden) return cerrarMenuIdioma(true);
  if (!$("#capa-confirmar").hidden) return responderConfirmacion(false);
  if (!$("#capa-prestamo").hidden) return cerrarCapa($("#capa-prestamo"));
  if (!$("#capa-libro").hidden) return cerrarCapa($("#capa-libro"));
  if (document.body.classList.contains("menu-abierto")) $("#velo").click();
});

// Confirmación antes de eliminar.
let resolverConfirmacion = null;

function confirmar(texto) {
  $("#confirmar-cuerpo").textContent = texto;
  abrirCapa($("#capa-confirmar"), $("#confirmar-no"));
  return new Promise((resolver) => { resolverConfirmacion = resolver; });
}

function responderConfirmacion(valor) {
  cerrarCapa($("#capa-confirmar"));
  if (resolverConfirmacion) resolverConfirmacion(valor);
  resolverConfirmacion = null;
}

$("#confirmar-si").addEventListener("click", () => responderConfirmacion(true));
$("#confirmar-no").addEventListener("click", () => responderConfirmacion(false));

// --- Agregar un libro -------------------------------------------------------------------

const capaLibro = $("#capa-libro");
const formLibro = $("#form-libro");
const panelExterno = $("#resultado-externo");
let portadasExternas = [];  // portadas candidatas de Open Library, en orden de preferencia

/** Prueba las portadas en orden; si ninguna existe, quita la imagen. */
function ponerPortada(img, candidatas) {
  let i = 0;
  img.addEventListener("error", () => {
    i += 1;
    if (i < candidatas.length) img.src = candidatas[i];
    else img.remove();
  });
  img.src = candidatas[0];
}

function abrirFormularioLibro() {
  limpiarFormulario(formLibro);
  panelExterno.hidden = true;
  portadasExternas = [];
  actualizarVistaPrevia();
  abrirCapa(capaLibro, $("#isbn"));
}

$$("[data-cerrar]", capaLibro).forEach((boton) =>
  boton.addEventListener("click", () => cerrarCapa(capaLibro)));

/** La vista previa repite en vivo lo que se va escribiendo. */
function actualizarVistaPrevia() {
  const titulo = $("#titulo").value.trim();
  const autor = $("#autor").value.trim();
  const anio = $("#anio").value.trim();
  const isbn = $("#isbn").value.trim();

  const portada = $("#previa-portada");
  const [c1, c2] = paleta(titulo || "?");
  portada.style.setProperty("--c1", c1);
  portada.style.setProperty("--c2", c2);
  portada.querySelector(".portada-titulo").textContent = titulo || t("drawer.preview_title");
  portada.querySelector(".portada-autor").textContent = autor || t("drawer.preview_author");

  let imagen = portada.querySelector("img");
  const clave = portadasExternas.join(" ");
  if (clave && (!imagen || imagen.dataset.clave !== clave)) {
    imagen?.remove();
    imagen = document.createElement("img");
    imagen.alt = "";
    imagen.dataset.clave = clave;
    imagen.addEventListener("load", () => imagen.classList.add("cargada"));
    portada.append(imagen);
    ponerPortada(imagen, portadasExternas);
  } else if (!clave && imagen) {
    imagen.remove();
  }

  $("#previa-titulo").textContent = titulo || t("drawer.preview_title");
  $("#previa-autor").textContent = autor || t("drawer.preview_author");
  $("#previa-meta").textContent = [anio, isbn && "ISBN " + isbn].filter(Boolean).join(" · ") || "—";
}

["titulo", "autor", "anio"].forEach((id) => $("#" + id).addEventListener("input", actualizarVistaPrevia));

$("#isbn").addEventListener("input", () => {
  // Otro ISBN ya no corresponde al resultado ni a la portada encontrados.
  portadasExternas = [];
  panelExterno.hidden = true;
  actualizarVistaPrevia();
});

// Enter en el ISBN busca en Open Library en lugar de enviar el formulario.
$("#isbn").addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") {
    evento.preventDefault();
    $("#btn-buscar-isbn").click();
  }
});

formLibro.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (!formularioValido(formLibro)) return;

  const boton = formLibro.querySelector("[type='submit']");
  boton.disabled = true;
  try {
    await api("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: $("#titulo").value,
        author: $("#autor").value,
        year: $("#anio").value,
        isbn: $("#isbn").value,
      }),
    });
    cerrarCapa(capaLibro);
    avisar(t("msg.book_added"), "ok");
    await recargar();
  } catch (error) {
    avisar(error.message, "error");
  } finally {
    boton.disabled = false;
  }
});

// --- Búsqueda del ISBN en Open Library ----------------------------------------------------
// La consulta sale del navegador directamente a openlibrary.org, con un plazo
// máximo de respuesta. Se distingue «no encontrado», «tardó demasiado» y «no se
// pudo conectar»; en los tres casos el formulario se puede seguir llenando a mano.

const OPEN_LIBRARY = "https://openlibrary.org/search.json";
const PLAZO_EXTERNO = 8000; // ms antes de darlo por perdido

function mostrarExterno(html, tipo) {
  panelExterno.className = "externo " + tipo;
  panelExterno.innerHTML = html;
  panelExterno.hidden = false;
}

async function buscarEnOpenLibrary(isbn) {
  const corte = new AbortController();
  const temporizador = setTimeout(() => corte.abort(), PLAZO_EXTERNO);
  const url = `${OPEN_LIBRARY}?q=isbn:${encodeURIComponent(isbn)}&limit=1`
            + `&fields=title,author_name,first_publish_year,cover_i`;
  try {
    const respuesta = await fetch(url, { signal: corte.signal });
    if (!respuesta.ok) throw new Error("HTTP " + respuesta.status);
    const cuerpo = await respuesta.json();
    return cuerpo.docs && cuerpo.docs.length ? cuerpo.docs[0] : null;
  } finally {
    clearTimeout(temporizador);
  }
}

$("#btn-buscar-isbn").addEventListener("click", async () => {
  const campoIsbn = $("#isbn");
  if (!revisarCampo(campoIsbn)) {
    panelExterno.hidden = true;
    return;
  }

  const isbn = campoIsbn.value.trim().replace(/[-\s]/g, "");
  const boton = $("#btn-buscar-isbn");
  boton.disabled = true;
  mostrarExterno(`
    <span class="externo-ic girando">${icono("loader")}</span>
    <div><p><strong>${t("ext.searching")}</strong></p><p class="fuente">${t("ext.source")}</p></div>`, "neutro");

  try {
    const libro = await buscarEnOpenLibrary(isbn);

    if (!libro) {
      mostrarExterno(`
        <span class="externo-ic">${icono("search")}</span>
        <div><p><strong>${t("ext.not_found")}</strong></p><p class="fuente">${t("ext.source")}</p></div>`, "aviso");
      return;
    }

    $("#titulo").value = libro.title || "";
    $("#autor").value = (libro.author_name && libro.author_name[0]) || "";
    $("#anio").value = libro.first_publish_year || "";
    ["titulo", "autor", "anio"].forEach((id) => revisarCampo($("#" + id)));

    portadasExternas = [`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`];
    if (libro.cover_i) portadasExternas.push(`https://covers.openlibrary.org/b/id/${libro.cover_i}-L.jpg`);
    actualizarVistaPrevia();

    const portada = `<img alt="${escapar(libro.title)}" class="ext-portada">`;

    mostrarExterno(`
      ${portada}
      <div>
        <p><strong>${t("ext.found", { title: escapar(libro.title) })}</strong></p>
        <p>${t("ext.filled")}</p>
        <p class="fuente">${t("ext.source")}</p>
      </div>`, "ok");
    ponerPortada(panelExterno.querySelector(".ext-portada"), portadasExternas);
  } catch (error) {
    const clave = error.name === "AbortError" ? "ext.timeout" : "ext.error";
    mostrarExterno(`
      <span class="externo-ic">${icono("wifi-off")}</span>
      <div><p><strong>${t(clave)}</strong></p><p class="fuente">${t("ext.source")}</p></div>`, "error");
  } finally {
    boton.disabled = false;
  }
});

// --- Formulario de préstamo ---------------------------------------------------------------

const capaPrestamo = $("#capa-prestamo");
const formPrestamo = $("#form-prestamo");
let libroAPrestar = null;

function abrirFormularioPrestamo(bookId) {
  const libro = libroDe(bookId);
  if (!libro) return;
  libroAPrestar = bookId;

  $("#prestamo-libro").innerHTML = `
    ${portadaHTML(libro)}
    <div>
      <small>${t("loanform.book")}</small>
      <strong>${escapar(libro.title)}</strong>
      <span>${escapar(libro.author)}${libro.year ? " · " + libro.year : ""}</span>
    </div>`;

  limpiarFormulario(formPrestamo);
  abrirCapa(capaPrestamo, $("#p-nombre"));
}

$("#btn-cancelar-prestamo").addEventListener("click", () => cerrarCapa(capaPrestamo));

formPrestamo.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (!formularioValido(formPrestamo)) return;

  const boton = formPrestamo.querySelector("[type='submit']");
  boton.disabled = true;
  try {
    await api("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        book_id: libroAPrestar,
        borrower: $("#p-nombre").value,
        dni: $("#p-dni").value,
        email: $("#p-email").value,
        phone: $("#p-telefono").value,
      }),
    });
    cerrarCapa(capaPrestamo);
    avisar(t("msg.loan_created"), "ok");
    await recargar();
  } catch (error) {
    avisar(error.message, "error");
  } finally {
    boton.disabled = false;
  }
});

// --- Acciones sobre libros y préstamos -------------------------------------------------------

document.addEventListener("click", async (evento) => {
  const boton = evento.target.closest("button");
  if (!boton) return;

  if (boton.dataset.accion === "nuevo-libro") {
    abrirFormularioLibro();
    return;
  }

  const { prestar, eliminar, devolver, deseo } = boton.dataset;
  if (!prestar && !eliminar && !devolver && !deseo) return;

  if (prestar) {
    abrirFormularioPrestamo(Number(prestar));  // el préstamo se registra al enviar el formulario
    return;
  }

  try {
    if (deseo) {
      const resultado = await api(`/api/wishlist/${deseo}`, { method: "POST" });
      avisar(resultado.in_wishlist ? t("msg.wishlist_added") : t("msg.wishlist_removed"), "ok");
    } else if (devolver) {
      await api(`/api/loans/${devolver}/return`, { method: "POST" });
      avisar(t("msg.book_returned"), "ok");
    } else {
      const libro = libroDe(Number(eliminar));
      if (!(await confirmar(t("confirm.delete_body", { title: libro ? libro.title : "" })))) return;
      await api(`/api/books/${eliminar}`, { method: "DELETE" });
      avisar(t("msg.book_deleted"), "ok");
    }
    await recargar();
  } catch (error) {
    avisar(error.message, "error");
  }
});

$("#btn-vaciar-deseos").addEventListener("click", async () => {
  try {
    await api("/api/wishlist", { method: "DELETE" });
    avisar(t("msg.wishlist_cleared"), "ok");
    await recargar();
  } catch (error) {
    avisar(error.message, "error");
  }
});

// --- Arranque ---------------------------------------------------------------------------

async function iniciar() {
  mostrarVista();
  try {
    const [i18n, validacion] = await Promise.all([api("/api/i18n"), api("/api/validation-rules")]);
    mensajes = i18n.messages;
    reglas = validacion.patterns;
    idioma = i18n.lang;
    document.documentElement.lang = i18n.lang;

    activarValidacion(formLibro);
    activarValidacion(formPrestamo);
    await recargar();
  } catch (error) {
    avisar(error.message || t("error.unexpected"), "error");
  }
}

iniciar();
