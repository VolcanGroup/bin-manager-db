const db = require('./database');
(async () => {
    await db.initDatabase();
    console.log(db.queryAll('SELECT id, username, password_hash, role FROM users', []));
})();
