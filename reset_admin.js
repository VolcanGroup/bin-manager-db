const db = require('./database');
const bcrypt = require('bcryptjs');
(async () => {
    await db.initDatabase();
    const hash = bcrypt.hashSync('admin123', 10);
    db.runQuery('UPDATE users SET password_hash = ?, role = ? WHERE username = ?', [hash, 'admin', 'admin']);
    console.log('Admin password reset to admin123 and role set to admin');
})();
