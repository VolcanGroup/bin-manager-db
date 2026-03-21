# Guía de Despliegue: BIN Manager v2 Online

Esta guía te ayudará a poner tu aplicación en línea de forma **gratuita** y con una **base de datos persistente** para que tus usuarios y BINes nunca se pierdan.

---

## 🏗️ Opción Recomendada: Render + Supabase
Esta opción es la más profesional. Render alojará tu aplicación (el servidor) y Supabase alojará tu base de datos (PostgreSQL).

### Paso 1: Crear la Base de Datos (Supabase)
1.  Ve a [Supabase.com](https://supabase.com/) y crea una cuenta gratuita.
2.  Crea un **Nuevo Proyecto**. Ponle un nombre (ej. `bin-manager-db`) y una contraseña segura.
3.  Una vez creado, ve a **Project Settings** (el icono de engranaje) -> **Database**.
4.  Busca la sección **Connection String**, selecciona la pestaña **URI** y copia la dirección. Se verá algo así:
    `postgresql://postgres:[TU_CONTRASEÑA]@db.xxxx.supabase.co:5432/postgres`
    *(Asegúrate de reemplazar `[TU_CONTRASEÑA]` con la contraseña que elegiste).*

### Paso 2: Subir tu Código a GitHub
1.  Crea un repositorio en [GitHub](https://github.com/).
2.  Sube todos los archivos de tu carpeta `bin-manager`.
    *(No olvides incluir el archivo `database_pg.js` que acabo de crear).*

### Paso 3: Crear el Servidor (Render)
1.  Ve a [Render.com](https://render.com/) y crea una cuenta (puedes usar tu cuenta de GitHub).
2.  Haz clic en **New +** -> **Web Service**.
3.  Conecta tu repositorio de GitHub.
4.  Configura lo siguiente:
    -   **Name:** `bin-manager`
    -   **Runtime:** `Node`
    -   **Build Command:** `npm install`
    -   **Start Command:** `npm start`
    -   **Instance Type:** `Free`
5.  Haz clic en **Advanced** -> **Add Environment Variable**:
    -   Key: `DATABASE_URL`
    -   Value: *(Pega la URI que copiaste de Supabase en el Paso 1)*

### Paso 4: ¡Listo!
Render empezará a construir tu aplicación. En unos minutos te dará una URL (ej. `https://bin-manager.onrender.com`). ¡Pásala a tu equipo y ya pueden entrar!

---

## 🛠️ Cómo Consultar la Base de Datos Externamente
Como ahora usas PostgreSQL en Supabase, puedes consultar los datos desde cualquier lugar:
1.  **Desde la web de Supabase:** Entra en tu proyecto y pulsa en **Table Editor** en el menú izquierdo. Podrás ver y editar todas las tablas (bins, users, etc.) como si fuera un Excel.
2.  **Desde un motor externo (DBeaver/TablePlus):** Descarga una herramienta como DBeaver. Crea una nueva conexión PostgreSQL usando los datos (Host, User, Password, Port) que aparecen en la configuración de base de datos de Supabase.

---

## ⚠️ Nota Importante sobre el Código
He preparado el archivo `database_pg.js` especialmente para esto. La aplicación está lista para detectar si hay una `DATABASE_URL` configurada y usar PostgreSQL automáticamente.

---
*Si tienes alguna duda durante el proceso, ¡estoy aquí para ayudarte!*
