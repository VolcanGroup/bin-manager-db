# Guía Administrativa y Operativa — BIN Manager v2

Este documento es el manual definitivo de la plataforma, detallando la lógica de negocio, permisos y estructura del sistema.

---

## 🏗️ 1. Estructura de la Interfaz

La aplicación está dividida en tres áreas constantes:
1.  **Sidebar (Menú Lateral):** Navegación dinámica que cambia según tu rol. Incluye el switch de **Modo Oscuro** y el botón de salida.
2.  **Banner de Entorno:** En la parte superior verás un banner que indica si estás en **PRODUCCIÓN** (Azul/Verde) o **DESARROLLO** (Rojo/Banner "Entorno de Pruebas").
3.  **Área de Contenido:** Donde se visualizan los módulos (Dashboard, Tablas, Formularios).

---

## 👥 2. Matriz de Roles y Permisos

| Característica | Admin | Requester | Viewer |
| :--- | :---: | :---: | :---: |
| Ver Dashboard e Inventario | ✅ | ✅ | ✅ |
| Crear BINes (Manual/Masivo) | ✅ | ❌ | ❌ |
| Segmentar BINes | ✅ | ❌ | ❌ |
| Solicitar nuevo BIN | ✅ | ✅ | ❌ |
| Aprobar / Rechazar Solicitudes | ✅ | ❌ | ❌ |
| Gestión de Usuarios y Auditoría| ✅ | ❌ | ❌ |
| Editar/Eliminar BINes | ✅ | ❌ | ❌ |

---

## 📏 3. Reglas de Negocio (Lógica del Sistema)

La aplicación aplica validaciones automáticas para mantener la integridad de los datos.

### A. Restricciones de Dígitos por Producto
Al solicitar un BIN, el sistema bloquea la longitud según el producto seleccionado:
*   **Débito / Prepago:** Obligatorio **10 dígitos**.
*   **Crédito:** Obligatorio **9 dígitos**.
*   **Admin:** Solo el administrador puede asignar directamente BINes de **8 dígitos**.

### B. Regla de Consistencia (BINes Segmentados)
Si un BIN de 8 dígitos ha sido segmentado, el sistema obliga a que **todos sus hijos** (segmentos) compartan la misma configuración:
1.  **Mismo Embozador:** No puedes asignar un segmento a "MyCard" si otro segmento del mismo padre ya está en "Idemia".
2.  **Misma Marca:** Un padre no puede tener segmentos de Visa y Mastercard mezclados.

### C. Ciclo de Vida de una Solicitud
1.  **Solicitud:** El usuario llena el formulario. El sistema busca el BIN disponible más antiguo.
2.  **Estado "Por Aprobar" (Pending):** El BIN se bloquea visualmente para evitar duplicidad.
3.  **Estado "Asignado" (Assigned):** Una vez aprobado, el cliente queda ligado formalmente al BIN.
4.  **Rechazo:** Si se rechaza, el BIN vuelve a estar **Disponible** automáticamente.

---

## 🛠️ 4. Módulos de Operación

### 📊 Dashboard
Muestra la salud del inventario. La **Matriz por País** es crítica para planeación: si un país tiene 0 disponibles en 10 dígitos, indica que es necesario **Segmentar** más BINes de 8.

### 💳 Inventario de BINes
La tabla principal permite:
*   **Filtros Cruzados:** Puedes buscar por Marca + País + Estado simultáneamente.
*   **Acción "Ver Segmentos":** Si un BIN es de 8 dígitos y está segmentado, un botón permite ver la lista de sus 10 o 100 hijos.
*   **Liberar BIN:** El administrador puede "quitar" un BIN a un cliente para que vuelva a estar disponible.

### 📥 Carga Masiva (Bulk Load)
*   **Importación por Excel:** El sistema lee las columnas y detecta si el BIN ya existe.
*   **Auto-Segmentación:** Si cargas un BIN de 10 dígitos y su "padre" de 8 no existe, el sistema lo crea y lo marca como segmentado automáticamente.

---

## 📜 5. Control de Auditoría
Cada cambio (hasta el más mínimo) genera una entrada en la **Bitácora**. 
*   Se registra el valor **antes** del cambio y el valor **después**.
*   Permite rastrear errores humanos o cambios de estado no autorizados.

---

> [!IMPORTANT]
> **Segmentación Crítica:** Una vez que un BIN de 8 se segmenta, no se debe manipular el registro "Padre" manualmente salvo para notas generales, ya que sus hijos heredan sus propiedades base.
