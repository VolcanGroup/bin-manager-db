# Código Fuente Completo de la API — BIN Manager v2

Este documento contiene la implementación real de **todos** los puntos de acceso (endpoints) del servidor.

---

## 🔐 Autenticación ([routes/auth.js](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/routes/auth.js))

### POST `/login`
```javascript
router.post('/login', async (req, res) => {
    let { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    username = username.trim().toLowerCase();
    const user = await queryOne('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Credenciales inválidas' });
    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
        JWT_SECRET, { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } });
});
```

### GET `/me`
```javascript
router.get('/me', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.json({ authenticated: false });
    try {
        const user = jwt.verify(token, JWT_SECRET);
        res.json({ authenticated: true, user });
    } catch (err) { res.json({ authenticated: false }); }
});
```

---

## 🏦 Gestión de BINes ([routes/bins.js](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/routes/bins.js))

### GET `/` (Listar BINes)
```javascript
router.get('/', authenticateToken, async (req, res) => {
    let query = 'SELECT * FROM bins WHERE 1=1';
    const params = [];
    if (req.query.status) { query += ' AND status = ?'; params.push(req.query.status); }
    if (req.query.brand) { query += ' AND brand = ?'; params.push(req.query.brand); }
    // ... más filtros (product, segment, country, etc.) ...
    const bins = await queryAll(query, params);
    res.json(bins);
});
```

### GET `/stats` (Estadísticas)
```javascript
router.get('/stats', authenticateToken, async (req, res) => {
    const total = (await queryOne('SELECT COUNT(*) as count FROM bins WHERE parent_bin IS NULL')).count;
    const available = (await queryOne("SELECT COUNT(*) as count FROM bins WHERE status = 'available'")).count;
    // ... otros contadores y matrices por país ...
    res.json({ total, available, assigned, segmented, pending, exhausted, countryMatrix, recentActivity });
});
```

### POST `/` (Crear BIN)
```javascript
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    const { country, ica, bin_number, brand, product, status } = req.body;
    const cleanBin = bin_number.trim().replace(/\D/g, '');
    const result = await runQuery(
        `INSERT INTO bins (country, ica, bin_number, bin_length, status, brand, product) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [country, ica, cleanBin, cleanBin.length, status || 'available', brand, product]
    );
    res.status(201).json(await queryOne('SELECT * FROM bins WHERE id = ?', [result.lastInsertRowid]));
});
```

### POST `/segment` (Segmentar)
```javascript
router.post('/segment', authenticateToken, requireAdmin, async (req, res) => {
    const { parent_bin_number, target_length } = req.body;
    const parent = await queryOne('SELECT * FROM bins WHERE bin_number = ?', [parent_bin_number]);
    let segCount = parent.bin_number.length === 8 ? (target_length === 9 ? 10 : 100) : 10;
    for (let i = 0; i < segCount; i++) {
        const suffix = (target_length === 10 && parent.bin_number.length === 8) ? String(i).padStart(2, '0') : String(i);
        const segNumber = parent.bin_number + suffix;
        await runQuery(`INSERT INTO bins (bin_number, bin_length, parent_bin, status) VALUES (?, ?, ?, 'available')`, [segNumber, target_length, parent.bin_number]);
    }
    await runQuery('UPDATE bins SET status = "segmented" WHERE id = ?', [parent.id]);
    res.status(201).json({ message: 'Segmentos creados' });
});
```

### PUT [/:id](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/public/app.js#1274-1280) (Editar)
```javascript
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { country, ica, brand, product, status } = req.body;
    await runQuery(
        `UPDATE bins SET country=?, ica=?, brand=?, product=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
        [country, ica, brand, product, status, req.params.id]
    );
    res.json(await queryOne('SELECT * FROM bins WHERE id = ?', [req.params.id]));
});
```

### DELETE [/:id](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/public/app.js#1274-1280) (Eliminar)
```javascript
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    const bin = await queryOne('SELECT * FROM bins WHERE id = ?', [req.params.id]);
    if (bin.parent_bin === null) await runQuery('DELETE FROM bins WHERE parent_bin = ?', [bin.bin_number]);
    await runQuery('DELETE FROM bins WHERE id = ?', [req.params.id]);
    res.json({ message: 'BIN eliminado' });
});
```

### POST `/bulk-file` (Carga Masiva)
```javascript
router.post('/bulk-file', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
    // Procesa Excel/CSV y llama a asyncProcessBulkBins
    res.status(201).json(await asyncProcessBulkBins(bins, req.user));
});
```

---

## 📝 Gestión de Solicitudes ([routes/requests.js](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/routes/requests.js))

### GET `/` (Listar Solicitudes)
```javascript
router.get('/', authenticateToken, async (req, res) => {
    let query = 'SELECT * FROM requests WHERE 1=1';
    if (req.user.role === 'requester') query += ' AND requester_id = ' + req.user.id;
    const requests = await queryAll(query + ' ORDER BY created_at DESC');
    res.json(requests);
});
```

### POST `/` (Nueva Solicitud)
```javascript
router.post('/', authenticateToken, requireRequester, async (req, res) => {
    const { country, digits, brand, product, client } = req.body;
    // ... lógica de búsqueda de BIN disponible ...
    await runQuery("UPDATE bins SET status = 'pending', client = ?, requested_by = ? WHERE id = ?", [client, req.user.username, proposedBinId]);
    const result = await runQuery(`INSERT INTO requests (requester_id, client, proposed_bin, status) VALUES (?, ?, ?, 'pending')`, [req.user.id, client, proposedBin]);
    res.status(201).json(await queryOne('SELECT * FROM requests WHERE id = ?', [result.lastInsertRowid]));
});
```

### PUT `/:id/approve` (Aprobar)
```javascript
router.put('/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
    const request = await queryOne('SELECT * FROM requests WHERE id = ?', [req.params.id]);
    await runQuery(`UPDATE bins SET status = 'assigned', approved_by = ?, assigned_date = datetime('now','localtime') WHERE id = ?`, [req.user.username, request.proposed_bin_id]);
    await runQuery(`UPDATE requests SET status = 'approved', admin_username = ? WHERE id = ?`, [req.user.username, req.params.id]);
    res.json({ message: 'Aprobado' });
});
```

---

## 👥 Usuarios y Configuración ([routes/users.js](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/routes/users.js), [audit.js](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/routes/audit.js), [countries.js](file:///c:/Users/guillermo.martinez/.gemini/antigravity/scratch/bin-manager/routes/countries.js))

### POST `/api/users` (Crear Usuario)
```javascript
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    const result = await runQuery('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [username, hash, role]);
    res.status(201).json({ id: result.lastInsertRowid, username, role });
});
```

### GET `/api/audit` (Auditoría)
```javascript
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    const logs = await queryAll('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500');
    res.json(logs);
});
```

### GET `/api/countries` (Países)
```javascript
router.get('/', authenticateToken, async (req, res) => {
    const countries = await queryAll('SELECT * FROM countries ORDER BY name ASC');
    res.json(countries);
});
```
