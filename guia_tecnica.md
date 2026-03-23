# Guía de Arquitectura Técnica: Detalle de Tecnologías y Usos

Esta guía explica **qué** tecnologías se utilizan en el **BIN Manager v2** y, lo más importante, **para qué** sirve cada una dentro del sistema.

## 1. Frontend (Lo que el usuario ve)
Construido como una **SPA (Single Page Application)** para una experiencia fluida y rápida.

| Tecnología | ¿Para qué se usa en este proyecto? |
| :--- | :--- |
| **HTML5** | Define la estructura de todas las páginas (Dashboard, Lista de BINes, Formularios de Solicitud) en un solo archivo central ([index.html](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/public/index.html)). |
| **CSS3 (Variables)** | Controla el diseño visual, colores y espaciados. Se usa para implementar el **Modo Oscuro/Claro** y asegurar que la interfaz sea responsiva (se adapte a móviles). |
| **Vanilla JavaScript** | Maneja toda la lógica de la interfaz: navegación entre secciones, validación de formularios en tiempo real, envío de datos al servidor (fetch) y actualización de tablas sin recargar la página. |

## 2. Backend (El motor del sistema)
El servidor que procesa las reglas de negocio y gestiona los datos.

| Tecnología | ¿Para qué se usa en este proyecto? |
| :--- | :--- |
| **Node.js** | Entorno que permite ejecutar JavaScript en el servidor para procesar múltiples solicitudes simultáneas de forma eficiente. |
| **Express.js** | Gestiona las "Rutas" de la API. Por ejemplo: `/api/bins` para obtener el inventario o `/api/auth` para el inicio de sesión. |
| **JWT (JsonWebToken)** | Genera un "Token" seguro cuando un usuario inicia sesión. Es la **llave digital** que permite al usuario navegar por el sistema sin tener que reingresar su contraseña constantemente. |
| **Bcryptjs** | **Encripta las contraseñas** antes de guardarlas. Esto asegura que nadie (ni siquiera los administradores) pueda ver las contraseñas reales en la base de datos. |
| **Multer** | Permite al sistema **recibir archivos** subidos por el usuario, específicamente para la función de "Carga Masiva" desde archivos. |
| **XLSX (SheetJS)** | Se usa para **leer y procesar archivos de Excel**. Toma el archivo de BINes que el usuario sube y convierte las filas de Excel en datos que el sistema puede guardar. |
| **CORS** | Es una capa de seguridad que define quién tiene permiso para hablar con el servidor, evitando que sitios web no autorizados accedan a la API. |

## 3. Base de Datos (Almacenamiento Seguro)
Donde vive toda la información histórica y actual.

| Tecnología | ¿Para qué se usa en este proyecto? |
| :--- | :--- |
| **PostgreSQL** | Motor de base de datos relacional de nivel empresarial. Garantiza que la información de los BINes sea coherente y no se pierda. |
| **Supabase** | Servicio en la nube que hospeda la base de datos PostgreSQL. Nos da la infraestructura, seguridad de red y copias de seguridad sin necesidad de configurar un servidor propio de base de datos. |
| **pg (Node-Postgres)** | Es el "puente" o conector que permite que el código de Node.js le envíe instrucciones (queries) a la base de datos en Supabase. |

## 4. Infraestructura y Despliegue (La Nube)

| Herramienta | ¿Para qué se usa en este proyecto? |
| :--- | :--- |
| **GitHub** | **Control de Versiones**: Guarda cada cambio hecho en el código. Si algo falla, permite "regresar en el tiempo" a una versión anterior segura. |
| **Render** | **Servidor Web**: Es donde la aplicación está "viva" en internet. Render toma automáticamente el código de GitHub y lo pone en funcionamiento para que sea accesible vía URL. |

---
## Resumen Ejecutivo para el Área Técnica
El proyecto está construido sobre un **entorno nativo de Node.js** eliminando dependencias de frameworks front-end (como React) para favorecer la **velocidad de carga y facilidad de mantenimiento**. La seguridad se basa en estándares modernos (**JWT y Hashing industrial**), y la persistencia de datos está delegada en **PostgreSQL (vía Supabase)**, garantizando integridad referencial y transaccionalidad total para el inventario de BINes.
