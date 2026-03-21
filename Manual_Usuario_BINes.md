# Panorama BINes: Manual de Usuario v2.0

Este documento proporciona una visión general de la aplicación y sirve como guía para los usuarios finales y administradores del **BIN Manager v2**.

---

## 🚀 Introducción
El BIN Manager es la herramienta central para la gestión del inventario de BINes (Bank Identification Numbers). Permite el control total desde la visualización de estadísticas hasta la segmentación técnica de rangos.

---

## 📊 1. Dashboard (Panel Principal)
Es la pantalla de inicio donde se obtiene una visión rápida del estado del sistema.
- **Inventario Total:** Muestra cuántos BINes existen de 8, 9 y 10 dígitos.
- **Disponibles:** Indica los espacios libres para nuevas asignaciones.
- **Tablas de Resumen:** Visualiza clientes con más BINes y estadísticas por país.
- **Actividad Reciente:** Registro de los últimos cambios o solicitudes realizadas.

---

## 💳 2. Gestión de BINes
Esta es la sección más importante para la consulta visual de datos.

### 🔍 Un Sistema de Filtros Inteligente
Ahora puedes encontrar cualquier información rápidamente usando:
- **Búsqueda Global:** Por número de BIN, nombre de Cliente, ICA o Procesador.
- **Filtros por Estado:** (Asignado, Disponible, Pendiente).
- **Filtros Técnicos:** Marca (Mastercard/Visa), Producto, Segmento, Tokenización y Tipo de Saldo.
- **Nota:** El filtro de **Segmento** ahora es inteligente y muestra todas las opciones globales si no se ha seleccionado un producto.

### 🛠️ Interfaz Dinámica (Novedad)
- **Menú Colapsable (❮):** Si necesitas más espacio para ver la tabla, pulsa el botón en la parte superior del menú. La tabla se expandirá automáticamente.
- **Modo Oscuro (🌙):** Cambia al tema nocturno pulsando el icono al final del menú. El sistema recordará tu preferencia.

---

## 📝 3. Solicitudes y Flujos de Trabajo
Si necesitas un nuevo BIN o modificar uno existente:
1.  **Solicitar BIN:** Completa el formulario de solicitud indicando País, Marca, Producto y Segmento.
2.  **Mis Solicitudes:** Aquí podrás ver si tu petición está "Enviada", "Aprobada" o "Rechazada".
3.  **Autorizaciones (Solo Administradores):** El equipo de administración revisa y aprueba las peticiones en esta sección.

---

## 📥 4. Carga Masiva (Solo Administradores)
Permite subir archivos Excel/CSV para actualizar el inventario de forma masiva.
- Asegúrate de seguir el formato definido en el archivo `Layout.txt` en la raíz del proyecto.

---

## 👥 5. Usuarios y Auditoría
- **Usuarios:** Gestión de cuentas y roles (Admin / Consulta).
- **Bitácora (Audit):** Registro histórico de quién hizo qué y cuándo. Imprescindible para seguimiento de seguridad.

---

## 💡 Consejos Rápidos
- **Búsqueda:** Si no encuentras un BIN, asegúrate de que los filtros estén limpios pulsando el botón "Limpiar Filtros".
- **Visualización:** Si una columna de la derecha no se ve completa, usa el scroll horizontal de la tabla o colapsa el menú lateral.
- **Acceso:** Tu nombre de usuario ahora funciona sin importar si usas mayúsculas o minúsculas.

---
*BIN Manager v2 - Potenciando la eficiencia en la gestión de tarjetas.*
