# Manual Técnico de la API - BIN Manager v2

Este documento describe todas las peticiones (Requests) que utiliza la aplicación para comunicarse entre el navegador (Frontend) y el servidor (Backend).

## 💡 Conceptos Básicos
*   **Formato:** Todas las respuestas son en formato **JSON**.
*   **Protocolo:** Se utiliza HTTP/HTTPS con métodos estándar (GET, POST, PUT, DELETE).
*   **Autenticación:** La mayoría de las rutas requieren un token JWT enviado en el encabezado `Authorization: Bearer [TOKEN]`.

---

## 🔐 Autenticación (`/api/auth`)

| Método | Endpoint | Descripción | Cuándo se consume | Afecta a... |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/login` | Inicia sesión con usuario y clave. | Al entrar a la app. | Genera un token de sesión. |
| **GET** | `/me` | Verifica si el token es válido. | Al recargar la página. | Nada (solo consulta). |

---

## 🏦 Gestión de BINes (`/api/bins`)

| Método | Endpoint | Descripción | Cuándo se consume | Afecta a... |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/` | Lista todos los BINes con filtros. | Al ver la tabla principal. | Nada. |
| **GET** | `/stats` | Obtiene contadores y métricas. | Al cargar el Dashboard. | Nada. |
| **POST** | `/` | Crea un BIN nuevo manualmente. | Al agregar un BIN (Admin). | Tabla `bins`. |
| **POST** | `/segment` | Divide un BIN de 8 en segmentos. | Al segmentar un BIN (Admin). | Crea múltiples filas en `bins`. |
| **PUT** | [/:id](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/public/app.js#1274-1280) | Actualiza datos de un BIN. | Al editar un registro. | Datos del BIN en la BD. |
| **PUT** | `/:id/assign` | Marca un BIN como asignado. | Al aprobar o asignar. | [status](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/public/app.js#58-71), `client`, [date](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/public/app.js#330-343). |
| **DELETE** | [/:id](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/public/app.js#1274-1280) | Elimina un BIN específico. | Al borrar un registro. | Borra fila en `bins`. |
| **POST** | `/bulk-file` | Importación masiva desde Excel. | Al usar "Carga Masiva". | Crea cientos de BINes. |

---

## 📝 Solicitudes (`/api/requests`)

| Método | Endpoint | Descripción | Cuándo se consume | Afecta a... |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/` | Lista las solicitudes pendientes. | En la pestaña "Solicitudes". | Nada. |
| **POST** | `/` | Crea una nueva solicitud. | Cuando un usuario pide un BIN. | Tabla `requests` y bloquea BIN. |
| **PUT** | `/:id/approve` | Aprueba la solicitud. | Al dar clic en "Aprobar". | Estado de BIN ➔ `assigned`. |
| **PUT** | `/:id/reject` | Rechaza la solicitud. | Al dar clic en "Rechazar". | Estado de BIN ➔ `available`. |

---

## 👥 Usuarios (`/api/users`)

| Método | Endpoint | Descripción | Cuándo se consume | Afecta a... |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/` | Lista todos los usuarios. | En "Configuración > Usuarios". | Nada. |
| **POST** | `/` | Crea un usuario nuevo. | Al registrar personal. | Tabla `users`. |
| **PUT** | [/:id](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/public/app.js#1274-1280) | Cambia rol o contraseña. | Al editar un usuario. | Datos del usuario. |
| **DELETE** | [/:id](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/public/app.js#1274-1280) | Elimina un acceso. | Al dar de baja a alguien. | Borra fila en `users`. |

---

## 🔍 Otros Catálogos

*   **GET `/api/countries`**: Lista de países (Guatemala, El Salvador, etc.) para los desplegables.
*   **GET `/api/embossers`**: Lista de embozadores (MyCard, Idemia, etc.).
*   **GET `/api/audit`**: Registro de quién hizo qué (Auditoría). Solo visible para Admin.

---

## ⚙️ ¿Qué significan los términos?

*   **JSON:** Es el lenguaje en el que "hablan" el frontend y el backend. Es un formato de texto que organiza los datos en pares de `llave: valor`.
*   **Cuerpo (Body):** La información que envías (ej. los datos del nuevo BIN).
*   **Parámetros:** Los filtros que aplicas en la URL (ej. `?brand=VISA`).
*   **Mantenimiento:** Si cambias algo en el backend (ej. en [routes/bins.js](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/routes/bins.js)), estás cambiando cómo funcionan estos métodos.
