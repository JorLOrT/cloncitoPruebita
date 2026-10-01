# 📚 Biblioteca — interfaz renovada

Clon de [App-N-Capas](https://github.com/JorLOrT/biblioteca) con una interfaz más llamativa. Hace lo mismo que la
aplicación original —catálogo de libros, préstamos y devoluciones con su multa, lista de deseos,
búsqueda del ISBN en Open Library y cambio de idioma español/inglés—; lo que cambia es la forma
de presentarlo.

Construida con **Python + Flask + SQLite**. El servidor es el de la aplicación original, sin la
calculadora de vencimientos ni los contadores de actividad, que esta interfaz no usa. La interfaz
(`presentation/templates`, `presentation/static` y los textos de `presentation/i18n`) está hecha
de nuevo.

---

## Cómo ejecutarla

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Abrir **http://127.0.0.1:5002** — la primera vez se crea `library.db` con 6 libros de ejemplo.

> Usa el puerto 5002 para poder ejecutarse a la vez que la aplicación original (5001).
> Se puede cambiar con `PORT=8080` y la base de datos con `LIBRARY_DB=/ruta/otra.db`.

Con Docker:

```bash
docker build -t biblioteca-clon .
docker run -p 5002:5002 biblioteca-clon
```

---

## La interfaz

| Sección | Qué se hace ahí |
|---|---|
| **Catálogo** | Tarjetas con la portada de cada libro, buscador (título, autor, año o ISBN) y filtros: todos, disponibles, prestados y en mi lista |
| **Nuevo libro** | Panel lateral con vista previa; el ISBN se busca en Open Library para rellenar título, autor, año y portada |
| **Prestar** | Formulario con los datos de quien se lleva el libro: nombre, DNI, celular y correo |
| **Préstamos** | Activos e historial, con fecha de vencimiento, días de retraso y multa |
| **Mi lista de deseos** | Hasta cinco libros guardados con la estrella ☆ del catálogo |
| **Idioma** | Menú desplegable de la barra superior: español o inglés |

Las portadas se cargan desde Open Library a partir del ISBN. Si no existe la portada de un ISBN,
la aplicación genera una con el título y el autor.

Respecto a la aplicación original se corrigieron cuatro ISBN de los libros de ejemplo, que
correspondían a otros libros (`data_access/database.py`).

---

## Estructura del proyecto

```
cloncitto/
├── app.py                      # Arranca Flask (puerto 5002)
├── requirements.txt · Dockerfile
├── entities/                   # Book y Loan
├── data_access/                # Base de datos SQLite y libros de ejemplo
├── business/                   # Reglas de la biblioteca y validaciones
└── presentation/
    ├── *_controller.py         # La API REST
    ├── i18n/                   # es.json · en.json
    ├── templates/index.html    # La página
    └── static/                 # app.js · styles.css · favicon.svg
```
