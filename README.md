# BIN Manager v2

**Portal de Administración de BINes**

Una aplicación web para la gestión, segmentación y auditoría de **BINs (Bank Identification Numbers)**, enfocada en operaciones de tarjetas (Prepago, Débito) principalmente para El Salvador, Honduras y Costa Rica.

## Características Principales

- **Gestión de BINs**: Visualización, creación, edición, segmentación (desglose de BINs de 8 dígitos a 10 dígitos) y desegmentación.
- **Autenticación y Autorización**: Sistema de usuarios con roles para controlar el acceso a la plataforma.
- **Administración de Solicitudes**: Flujo de aprobación para altas de BINs (Pendiente, Aprobado, Rechazado).
- **Auditoría**: Registro de acciones realizadas por los usuarios en el sistema.
- **Catálogos**: Gestión de países asociados a los BINs.
- **Importación/Exportación**: Capacidad de manejar archivos de datos.
- **Manual de Usuario**: Guía completa de uso en [Manual_Usuario_BINes.md](Manual_Usuario_BINes.md).

## Estructura del Proyecto

- `server.js`: Punto de entrada de la aplicación Node.js / Express.
- `database.js`: Configuración y consultas a la base de datos (SQLite usando `sql.js`, respaldado por archivo en el disco).
- `routes/`: Controladores de la API REST (`auth`, `bins`, `users`, `requests`, `audit`, `countries`).
- `middleware/`: Middlewares de Express (ej. autenticación con JWT, carga de archivos).
- `public/`: Frontend de la aplicación web (SPA - HTML, CSS, JavaScript).
- `data/`: Directorio donde se almacena la información persistente, incluyendo el archivo SQLite (`database.sqlite`).

## Requisitos Previos

- [Node.js](https://nodejs.org/) (v14 o superior recomendado)
- npm (Node Package Manager)

## Instalación y Configuración

1. **Ubicarse en la carpeta del proyecto**:
   ```bash
   cd C:\Users\guillermo.martinez\.gemini\antigravity\scratch\bin-manager
   ```

2. **Instalar las dependencias** (si no lo has hecho ya):
   ```bash
   npm install
   ```

3. **Ejecutar el servidor localmente**:
   ```bash
   npm start
   # Para desarrollo (si utilizas nodemon u otras herramientas, aunque actualmente start y dev hacen lo mismo):
   npm run dev
   ```

4. **Acceder a la aplicación**:
   Abre un navegador en [http://localhost:3000](http://localhost:3000).

   **Credenciales de acceso inicial:**
   - **Usuario:** `admin`
   - **Contraseña:** `admin123`

## Tecnologías Principales

- **Backend**: Node.js, Express.js
- **Base de Datos**: SQLite (en memoria y guardado en archivo vía `sql.js`)
- **Seguridad**: JSON Web Tokens (JWT) para sesiones, `bcryptjs` para contraseñas.
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (Single Page Application orientada por eventos).
- **Otros**: `multer` para procesar formularios multipart y carga de archivos, `xlsx` para leer hojas de cálculo de importación de datos.

## Tests y Scripts de Utilidad

Existen varios scripts en la raíz del proyecto para validar la BD y realizar pruebas aisladas de funciones:
- `test_db_state.js`: Revisa y muestra el estado actual de las tablas de la BD.
- `test_unsegment.js`: Prueba la función encargada de agrupar/desegmentar rangos de BINes.
- `test_upload.js`: Simula la funcionalidad de subir archivos de carga de BINes.

**Ejecución de un script de prueba:**
```bash
node test_db_state.js
```
