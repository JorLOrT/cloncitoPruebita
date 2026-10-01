"""Genera la versión estática de la biblioteca para Netlify (carpeta dist/).

Netlify publica archivos estáticos: no ejecuta Flask ni guarda una base SQLite.
Este script:

  1. Renderiza la misma plantilla (presentation/templates/index.html) en cada
     idioma: dist/index.html en español y dist/en/index.html en inglés.
  2. Copia los estilos y el JavaScript de la interfaz.
  3. Exporta lo que el navegador necesita del código Python —libros de ejemplo,
     patrones de validación, textos de cada idioma y constantes del negocio—
     a dist/static/datos.js.
  4. Añade netlify/api-local.js, que responde a las rutas /api/... en el
     navegador y guarda los datos en el localStorage de cada visitante.

Uso:  python3 netlify/build.py
"""

import json
import os
import shutil
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from jinja2 import Environment, FileSystemLoader, select_autoescape  # noqa: E402

from business.book_service import FIRST_PRINTED_YEAR  # noqa: E402
from business.library_calculator import DAILY_FINE, DEFAULT_LOAN_DAYS  # noqa: E402
from business.validators import PATTERNS  # noqa: E402
from business.wishlist_service import MAX_WISHLIST  # noqa: E402
from data_access.database import SEED_BOOKS  # noqa: E402
from presentation.i18n import DEFAULT, SUPPORTED, catalog, translate  # noqa: E402
from presentation.validation_controller import FORM_FIELDS  # noqa: E402

SALIDA = os.path.join(RAIZ, "dist")

# Antes de que se pinte la página: si el visitante eligió otro idioma (o su
# navegador está en otro), se va a la página de ese idioma conservando la
# sección (#/catalogo, #/prestamos...).
REDIRECCION_IDIOMA = """<script>
    (function () {
      var pagina = "%s", elegido = null;
      try { elegido = localStorage.getItem("biblioteca.idioma"); } catch (e) {}
      if (!elegido) elegido = (navigator.language || "").slice(0, 2).toLowerCase();
      if (%s.indexOf(elegido) === -1) elegido = "%s";
      if (elegido !== pagina) location.replace((elegido === "%s" ? "/" : "/" + elegido + "/") + location.hash);
    })();
  </script>"""


def pagina(plantilla, lang):
    html = plantilla.render(
        lang=lang,
        supported=SUPPORTED,
        t=lambda clave, **params: translate(clave, lang=lang, **params),
        url_for=lambda endpoint, filename: "/static/" + filename,
    )
    redireccion = REDIRECCION_IDIOMA % (lang, json.dumps(list(SUPPORTED)), DEFAULT, DEFAULT)
    html = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n  ' + redireccion, 1)

    # Los datos y el servidor simulado se cargan antes que app.js.
    scripts = ('<script src="/static/datos.js"></script>\n'
               '  <script src="/static/api-local.js"></script>\n'
               '  <script src="/static/app.js"></script>')
    assert '<script src="/static/app.js"></script>' in html
    return html.replace('<script src="/static/app.js"></script>', scripts)


def construir():
    shutil.rmtree(SALIDA, ignore_errors=True)
    shutil.copytree(os.path.join(RAIZ, "presentation", "static"), os.path.join(SALIDA, "static"))
    shutil.copy(os.path.join(RAIZ, "netlify", "api-local.js"), os.path.join(SALIDA, "static"))

    datos = {
        "libros": [{"title": t, "author": a, "year": y, "isbn": i} for t, a, y, i in SEED_BOOKS],
        "reglas": {"patterns": PATTERNS, "forms": FORM_FIELDS},
        "mensajes": {lang: catalog(lang) for lang in SUPPORTED},
        "idiomas": list(SUPPORTED),
        "plazoDias": DEFAULT_LOAN_DAYS,
        "multaDiaria": DAILY_FINE,
        "maxDeseos": MAX_WISHLIST,
        "primerAnio": FIRST_PRINTED_YEAR,
    }
    with open(os.path.join(SALIDA, "static", "datos.js"), "w", encoding="utf-8") as archivo:
        archivo.write("window.DATOS_BIBLIOTECA = " + json.dumps(datos, ensure_ascii=False) + ";\n")

    entorno = Environment(
        loader=FileSystemLoader(os.path.join(RAIZ, "presentation", "templates")),
        autoescape=select_autoescape(["html"]),
    )
    plantilla = entorno.get_template("index.html")
    for lang in SUPPORTED:
        carpeta = SALIDA if lang == DEFAULT else os.path.join(SALIDA, lang)
        os.makedirs(carpeta, exist_ok=True)
        with open(os.path.join(carpeta, "index.html"), "w", encoding="utf-8") as archivo:
            archivo.write(pagina(plantilla, lang))

    print("Versión estática generada en", SALIDA)


if __name__ == "__main__":
    construir()
