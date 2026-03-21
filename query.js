const { initDatabase, queryAll, runQuery } = require('./database.js');

async function ejecutar() {
    await initDatabase();

    try {
        // --- EJEMPLOS DE QUERIES ---

        // 1. SELECT: Para ver todos los usuarios
        const usuarios = queryAll("SELECT * FROM users");
        console.table(usuarios);

        // 2. INSERT: Para agregar datos (Descomenta la línea de abajo para probarla)
        // runQuery("INSERT INTO users (username, password, role) VALUES ('pepe', '1234', 'viewer')");
        // console.log("Usuario insertado correctamente");

        // 3. UPDATE / DELETE... (Descomenta la línea de abajo para probarla)
        // runQuery("DELETE FROM users WHERE username = 'pepe'");
        // console.log("Usuario eliminado correctamente");

    } catch (error) {
        console.error("Error ejecutando la consulta:", error);
    }
}

ejecutar();
