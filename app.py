"""Punto de entrada de la aplicación.

Aquí se ensamblan las capas: se prepara la base de datos (capa de Acceso a
Datos) y se registran los controladores (capa de Presentación). El flujo de
una petición siempre baja en el mismo orden:

    Navegador -> Presentación -> Negocio -> Acceso a Datos -> SQLite

Este proyecto es un clon de App-N-Capas: las capas de Entidades, Acceso a Datos
y Negocio son las mismas; lo que cambia es la interfaz (plantilla, estilos y
JavaScript de la capa de Presentación).
"""

import os

from flask import Flask

from data_access.database import init_db
from presentation import (
    i18n_bp,
    book_bp,
    home_bp,
    loan_bp,
    register_error_handlers,
    validation_bp,
    wishlist_bp,
)

# El 5000 lo ocupa AirPlay Receiver en macOS y el 5001 lo usa la aplicación
# original, así que el clon arranca en el 5002 y pueden ejecutarse a la vez.
PORT = int(os.environ.get("PORT", 5002))


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder="presentation/templates",
        static_folder="presentation/static",
    )
    # Para que los mensajes con tildes y ñ viajen legibles en el JSON.
    app.json.ensure_ascii = False

    # Necesaria para firmar la cookie de sesión (idioma y lista de deseos).
    # En producción debe venir del entorno, nunca escrita en el código.
    app.secret_key = os.environ.get("SECRET_KEY", "clave-de-desarrollo-cloncitto")

    # Las cookies no distinguen puertos: si la original (5001) y el clon (5002)
    # usaran el mismo nombre de cookie en 127.0.0.1, cada una invalidaría la
    # sesión de la otra al firmarla con una clave distinta.
    app.config["SESSION_COOKIE_NAME"] = "cloncitto_session"

    init_db()

    app.register_blueprint(home_bp)
    app.register_blueprint(book_bp)
    app.register_blueprint(loan_bp)
    app.register_blueprint(i18n_bp)       # idioma (i18n)
    app.register_blueprint(validation_bp) # patrones regex para el navegador
    app.register_blueprint(wishlist_bp)   # lista de deseos (sesión)
    register_error_handlers(app)

    return app


app = create_app()


if __name__ == "__main__":
    print("Biblioteca N-Capas (clon) -> http://127.0.0.1:{}".format(PORT))
    app.run(host="0.0.0.0", port=PORT, debug=True)
