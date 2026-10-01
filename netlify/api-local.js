// Servidor simulado para la versión estática (Netlify).
//
// Netlify solo publica archivos: no ejecuta Flask ni guarda una base SQLite.
// Este script responde, dentro del navegador, a las mismas rutas /api/... que
// el servidor Flask, con las mismas reglas de la biblioteca, y guarda los datos
// en el localStorage del visitante. Así app.js funciona sin cambios.
//
// Los libros de ejemplo, los patrones de validación y los textos de cada idioma
// no se copian a mano: build.py los toma del código Python (window.DATOS_BIBLIOTECA).

(function () {
  "use strict";

  const D = window.DATOS_BIBLIOTECA;
  const CLAVE_DATOS = "biblioteca.datos";
  const CLAVE_IDIOMA = "biblioteca.idioma";
  const IDIOMA = document.documentElement.lang;  // idioma de esta página: "es" o "en"

  // --- Almacenamiento ---------------------------------------------------------

  function datosIniciales() {
    return {
      libros: D.libros.map((libro, i) => ({ id: i + 1, ...libro, available: true })),
      prestamos: [],
      deseos: [],
      siguienteLibro: D.libros.length + 1,
      siguientePrestamo: 1,
    };
  }

  function cargar() {
    try {
      const guardados = JSON.parse(localStorage.getItem(CLAVE_DATOS));
      if (guardados && Array.isArray(guardados.libros)) return guardados;
    } catch (error) {
      // Sin almacenamiento o con datos dañados: se empieza de nuevo.
    }
    return datosIniciales();
  }

  let db = cargar();

  function guardar() {
    try {
      localStorage.setItem(CLAVE_DATOS, JSON.stringify(db));
    } catch (error) {
      // Sin almacenamiento los datos duran hasta cerrar la página.
    }
  }

  // --- Errores con clave de mensaje, como business/exceptions.py ---------------

  class ErrorNegocio extends Error {
    constructor(clave, params = {}, estado = 400) {
      super(clave);
      this.clave = clave;
      this.params = params;
      this.estado = estado;
    }
  }

  const noEncontrado = (clave, params) => new ErrorNegocio(clave, params, 404);

  function traducir(clave, params) {
    let texto = (D.mensajes[IDIOMA] || D.mensajes.es)[clave] ?? clave;
    for (const [nombre, valor] of Object.entries(params)) {
      texto = texto.split(`{${nombre}}`).join(valor);
    }
    return texto;
  }

  // --- Validación con los mismos regex de business/validators.py -----------------

  const REGEX = Object.fromEntries(
    Object.entries(D.reglas.patterns).map(([campo, patron]) => [campo, new RegExp(patron)]));

  function validar(campo, valor) {
    const texto = String(valor ?? "").trim();
    if (!REGEX[campo]) throw new ErrorNegocio("error.unexpected");
    if (!REGEX[campo].test(texto)) throw new ErrorNegocio("error.invalid_" + campo);
    return texto;
  }

  const normalizarIsbn = (isbn) => (isbn || "").replace(/[-\s]/g, "");

  // --- Fechas (AAAA-MM-DD, como en el servidor) ---------------------------------

  const iso = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  const hoy = () => iso(new Date());
  const partes = (fecha) => fecha.split("-").map(Number);

  function sumarDias(fecha, dias) {
    const [a, m, d] = partes(fecha);
    return iso(new Date(a, m - 1, d + dias));
  }

  function diasEntre(desde, hasta) {
    const utc = (fecha) => { const [a, m, d] = partes(fecha); return Date.UTC(a, m - 1, d); };
    return Math.round((utc(hasta) - utc(desde)) / 86400000);
  }

  // --- Libros (business/book_service.py) -------------------------------------------

  const copia = (objeto) => ({ ...objeto });
  const libroPorId = (id) => db.libros.find((libro) => libro.id === id);
  const prestamoActivo = (bookId) => db.prestamos.find((p) => p.book_id === bookId && !p.return_date);

  // SQLite ordena por el valor binario del texto; así se compara aquí también.
  const porTitulo = (a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);

  function listarLibros(url) {
    const soloDisponibles = url.searchParams.get("available") === "true";
    return db.libros.filter((l) => !soloDisponibles || l.available).sort(porTitulo).map(copia);
  }

  function obtenerLibro(id) {
    const libro = libroPorId(id);
    if (!libro) throw noEncontrado("error.book_not_found", { id });
    return libro;
  }

  function crearLibro(cuerpo) {
    const datos = {
      title: validar("title", cuerpo.title),
      author: validar("author", cuerpo.author),
      year: null,
      isbn: normalizarIsbn(validar("isbn", cuerpo.isbn)),
    };
    // El regex comprueba el formato; el rango de años, la regla de negocio.
    const anio = Number.parseInt(validar("year", cuerpo.year), 10);
    const actual = new Date().getFullYear();
    if (anio < D.primerAnio || anio > actual) {
      throw new ErrorNegocio("error.year_out_of_range", { min: D.primerAnio, max: actual });
    }
    datos.year = anio;

    const libro = { id: db.siguienteLibro++, ...datos, available: true };
    db.libros.push(libro);
    guardar();
    return copia(libro);
  }

  function eliminarLibro(id) {
    const libro = obtenerLibro(id);
    // Regla: un libro que alguien tiene prestado no se puede eliminar.
    const activo = prestamoActivo(id);
    if (activo) {
      throw new ErrorNegocio("error.book_has_active_loan", { title: libro.title, borrower: activo.borrower });
    }
    db.prestamos = db.prestamos.filter((p) => p.book_id !== id);
    db.libros = db.libros.filter((l) => l.id !== id);
    guardar();
    return { message: "Libro eliminado." };
  }

  // --- Préstamos (business/loan_service.py) -------------------------------------------

  function aDiccionario(p) {
    return {
      id: p.id,
      book_id: p.book_id,
      book_title: libroPorId(p.book_id)?.title ?? p.book_title,
      borrower: p.borrower,
      borrower_dni: p.borrower_dni,
      borrower_email: p.borrower_email,
      borrower_phone: p.borrower_phone,
      loan_date: p.loan_date,
      return_date: p.return_date,
      is_active: !p.return_date,
      due_date: null,
      days_late: 0,
      fine: 0,
    };
  }

  function listarPrestamos() {
    const referenciaHoy = hoy();
    // Primero los activos y después el historial, del más reciente al más antiguo.
    const ordenados = [...db.prestamos].sort((a, b) =>
      (Boolean(a.return_date) - Boolean(b.return_date)) || (b.id - a.id));

    return ordenados.map((p) => {
      const prestamo = aDiccionario(p);
      prestamo.due_date = sumarDias(p.loan_date, D.plazoDias);
      const atraso = Math.max(0, diasEntre(prestamo.due_date, p.return_date || referenciaHoy));
      prestamo.days_late = atraso;
      prestamo.fine = Math.round(atraso * D.multaDiaria * 100) / 100;
      return prestamo;
    });
  }

  function prestar(cuerpo) {
    const prestatario = {
      borrower: validar("borrower", cuerpo.borrower),
      dni: validar("dni", cuerpo.dni),
      email: validar("email", cuerpo.email),
      phone: validar("phone", cuerpo.phone),
    };

    const bookId = Number.parseInt(cuerpo.book_id, 10);
    if (!Number.isInteger(bookId)) throw new ErrorNegocio("error.book_required");
    const libro = libroPorId(bookId);
    if (!libro) throw noEncontrado("error.book_not_found", { id: bookId });

    // Regla central: no se presta dos veces el mismo ejemplar.
    if (!libro.available) {
      const activo = prestamoActivo(bookId);
      throw new ErrorNegocio("error.book_already_lent", { title: libro.title, borrower: activo ? activo.borrower : "?" });
    }

    const prestamo = {
      id: db.siguientePrestamo++,
      book_id: bookId,
      book_title: libro.title,
      borrower: prestatario.borrower,
      borrower_dni: prestatario.dni,
      borrower_email: prestatario.email,
      borrower_phone: prestatario.phone,
      loan_date: hoy(),
      return_date: null,
    };
    db.prestamos.push(prestamo);
    libro.available = false;
    guardar();
    return aDiccionario(prestamo);
  }

  function devolver(id) {
    const prestamo = db.prestamos.find((p) => p.id === id);
    if (!prestamo) throw noEncontrado("error.loan_not_found", { id });
    // Regla: un préstamo ya cerrado no se puede devolver otra vez.
    if (prestamo.return_date) {
      const titulo = libroPorId(prestamo.book_id)?.title ?? prestamo.book_title;
      throw new ErrorNegocio("error.loan_already_returned", { title: titulo, date: prestamo.return_date });
    }
    prestamo.return_date = hoy();
    const libro = libroPorId(prestamo.book_id);
    if (libro) libro.available = true;
    guardar();
    return aDiccionario(prestamo);
  }

  // --- Lista de deseos (business/wishlist_service.py) ------------------------------------

  function verDeseos() {
    return {
      book_ids: [...db.deseos],
      books: db.deseos.map(libroPorId).filter(Boolean).map(copia),
      max: D.maxDeseos,
    };
  }

  function alternarDeseo(id) {
    obtenerLibro(id);
    if (db.deseos.includes(id)) {
      db.deseos = db.deseos.filter((x) => x !== id);
    } else {
      // Regla: la lista tiene un tamaño máximo.
      if (db.deseos.length >= D.maxDeseos) throw new ErrorNegocio("error.wishlist_full", { max: D.maxDeseos });
      db.deseos.push(id);
    }
    guardar();
    return { book_ids: [...db.deseos], in_wishlist: db.deseos.includes(id) };
  }

  function vaciarDeseos() {
    db.deseos = [];
    guardar();
    return { book_ids: [] };
  }

  // --- Idioma (presentation/i18n) -------------------------------------------------------
  // Cada idioma es una página (/ y /en/). Elegir uno guarda la preferencia y,
  // al recargar, la página de inicio lleva a la del idioma elegido.

  function catalogo() {
    return { lang: IDIOMA, supported: D.idiomas, messages: D.mensajes[IDIOMA] };
  }

  function elegirIdioma(pedido) {
    const codigo = String(pedido).trim().toLowerCase().slice(0, 2);
    const idioma = D.idiomas.includes(codigo) ? codigo : D.idiomas[0];
    try {
      localStorage.setItem(CLAVE_IDIOMA, idioma);
    } catch (error) {
      // Sin almacenamiento se cambia de página directamente.
    }
    return { lang: idioma, messages: D.mensajes[idioma] };
  }

  // --- Rutas: las mismas que los controladores de Flask -----------------------------------

  const RUTAS = [
    ["GET", /^\/api\/books$/, (m, url) => listarLibros(url)],
    ["POST", /^\/api\/books$/, (m, url, cuerpo) => crearLibro(cuerpo), 201],
    ["GET", /^\/api\/books\/(\d+)$/, (m) => copia(obtenerLibro(Number(m[1])))],
    ["DELETE", /^\/api\/books\/(\d+)$/, (m) => eliminarLibro(Number(m[1]))],
    ["GET", /^\/api\/loans$/, () => listarPrestamos()],
    ["POST", /^\/api\/loans$/, (m, url, cuerpo) => prestar(cuerpo), 201],
    ["POST", /^\/api\/loans\/(\d+)\/return$/, (m) => devolver(Number(m[1]))],
    ["GET", /^\/api\/wishlist$/, () => verDeseos()],
    ["POST", /^\/api\/wishlist\/(\d+)$/, (m) => alternarDeseo(Number(m[1]))],
    ["DELETE", /^\/api\/wishlist$/, () => vaciarDeseos()],
    ["GET", /^\/api\/i18n$/, () => catalogo()],
    ["POST", /^\/api\/i18n\/([^/]+)$/, (m) => elegirIdioma(m[1])],
    ["GET", /^\/api\/validation-rules$/, () => D.reglas],
  ];

  function responder(datos, estado) {
    return new Response(JSON.stringify(datos), {
      status: estado,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fetchDelNavegador = window.fetch.bind(window);

  // Las peticiones a /api/... se responden aquí; el resto (Open Library y sus
  // portadas) sale a Internet como siempre.
  window.fetch = async function (recurso, opciones = {}) {
    const url = new URL(typeof recurso === "string" ? recurso : recurso.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) {
      return fetchDelNavegador(recurso, opciones);
    }

    const metodo = (opciones.method || "GET").toUpperCase();
    let cuerpo = {};
    try {
      cuerpo = opciones.body ? JSON.parse(opciones.body) || {} : {};
    } catch (error) {
      cuerpo = {};
    }

    for (const [verbo, patron, accion, estadoOk = 200] of RUTAS) {
      const coincidencia = verbo === metodo && patron.exec(url.pathname);
      if (!coincidencia) continue;
      try {
        return responder(accion(coincidencia, url, cuerpo), estadoOk);
      } catch (error) {
        if (!(error instanceof ErrorNegocio)) throw error;
        return responder({ error: traducir(error.clave, error.params), code: error.clave }, error.estado);
      }
    }
    return responder({ error: traducir("error.unexpected", {}) }, 404);
  };
})();
