# Detalle de Métodos de la API — BIN Manager v2

Este manual describe cada "Request" (petición) de forma individual, detallando su funcionamiento interno.

---

## 🔐 Módulo: Autenticación

### POST `/api/auth/login`
*   **Descripción**: Verifica credenciales y entrega un token de acceso.
*   **Se activa al**: Hacer clic en "Iniciar Sesión" en el login.
*   **Efecto en BD**: Consulta la tabla `users` para validar el hash de la contraseña.
*   **Resultado**: Devuelve un `token` JWT que la app guardará para futuras peticiones.

### GET `/api/auth/me`
*   **Descripción**: Valida si el usuario sigue logueado.
*   **Se activa al**: Recargar la página o abrir la app.
*   **Efecto en BD**: Ninguno. Solo valida el token.

---

## 🏦 Módulo: BINes

### GET `/api/bins`
*   **Descripción**: Obtiene la lista de BINes filtrada.
*   **Se activa al**: Ver la tabla de inventario o aplicar filtros.
*   **Efecto en BD**: Lectura masiva de la tabla `bins`.

### POST `/api/bins`
*   **Descripción**: Crea un BIN de 6 u 8 dígitos de forma manual.
*   **Se activa al**: Admin pulsa "Nuevo BIN" y llena el formulario.
*   **Efecto en BD**: Inserta una nueva fila en la tabla `bins` y crea un registro en `audit_log`.

### POST `/api/bins/segment`
*   **Descripción**: Toma un BIN de 8 dígitos disponible y crea 10 (para 9 dígitos) o 100 (para 10 dígitos) segmentos hijos.
*   **Se activa al**: Admin pulsa el botón "Segmentar" ➕ en la tabla.
*   **Efecto en BD**: Crea múltiples filas nuevas en `bins` y marca al padre como `segmented`.

### PUT `/api/bins/:id`
*   **Descripción**: Modifica cualquier dato de un BIN existente.
*   **Se activa al**: Editar un BIN en la tabla.
*   **Efecto en BD**: Actualiza campos en la tabla `bins` y registra qué campo cambió en `audit_log`.

### DELETE `/api/bins/:id`
*   **Descripción**: Elimina un BIN (y sus hijos si los tiene).
*   **Se activa al**: Admin pulsa el icono de papelera 🗑️.
*   **Efecto en BD**: Borra físicamente las filas de la base de datos.

### POST `/api/bins/bulk-file`
*   **Descripción**: Procesa un archivo Excel/CSV e inserta todos los BINes.
*   **Se activa al**: Usar la pantalla de "Carga Masiva".
*   **Efecto en BD**: Inserción masiva de registros. Registra la operación en la auditoría.

---

## 📝 Módulo: Solicitudes (Requests)

### POST `/api/requests`
*   **Descripción**: Un usuario pide que se le asigne un BIN.
*   **Se activa al**: Llenar el formulario de "Solicitar BIN".
*   **Efecto en BD**: Crea una fila en `requests` y cambia el estado del BIN en la tabla `bins` a `pending` para bloquearlo.

### PUT `/api/requests/:id/approve`
*   **Descripción**: El administrador aprueba el uso de un BIN.
*   **Se activa al**: Admin pulsa el check verde ✅ en solicitudes.
*   **Efecto en BD**: Cambia el estado del BIN a `assigned` y actualiza la fecha de asignación.

### PUT `/api/requests/:id/reject`
*   **Descripción**: El administrador deniega la solicitud.
*   **Se activa al**: Admin pulsa la X roja ❌ en solicitudes.
*   **Efecto en BD**: Devuelve el BIN al estado `available` (lo desbloquea) y marca la solicitud como rechazada.

---

## 👥 Módulo: Configuración

### POST `/api/users`
*   **Descripción**: Registra un nuevo acceso al sistema.
*   **Se activa al**: Crear usuario en configuración.
*   **Efecto en BD**: Inserta en tabla `users` con contraseña encriptada (Bcrypt).

### GET `/api/audit`
*   **Descripción**: Obtiene los últimos 500 movimientos del sistema.
*   **Se activa al**: Entrar a la pestaña de "Auditoría".
*   **Efecto en BD**: Lectura de la tabla `audit_log`.
