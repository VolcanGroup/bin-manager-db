const express = require('express');
const XLSX = require('xlsx');
const multer = require('multer');
const { queryAll, queryOne, runQuery, logAudit } = require('../db_connector');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ========== HELPER: Recalculate parent BIN status ==========
function recalcParentStatus(parentBin) {
    const parent = queryOne('SELECT id, status FROM bins WHERE bin_number = ?', [parentBin]);
    if (!parent) return;

    const segments = queryAll('SELECT status FROM bins WHERE parent_bin = ?', [parentBin]);
    if (segments.length === 0) return;

    const assigned = segments.filter(s => s.status === 'assigned' || s.status === 'pending').length;
    const total = segments.length;


    let newStatus;
    if (assigned === 0) {
        // If 0 segments are used, "un-segment" the parent so it can be used as 8 or 9 digits later.
        runQuery('DELETE FROM bins WHERE parent_bin = ?', [parentBin]);
        newStatus = 'available';
    } else if (assigned >= total) {
        newStatus = 'exhausted';
    } else {
        newStatus = 'segmented';
    }

    if (parent.status !== newStatus || assigned === 0) {
        runQuery('UPDATE bins SET status = ?, updated_at = datetime("now", "localtime") WHERE bin_number = ?',
            [newStatus, parentBin]);
    }
}

// ========== GET /api/bins ==========
router.get('/', authenticateToken, (req, res) => {
    try {
        let query = 'SELECT * FROM bins WHERE 1=1';
        const params = [];

        if (req.query.status) { query += ' AND status = ?'; params.push(req.query.status); }
        if (req.query.brand) { query += ' AND brand = ?'; params.push(req.query.brand); }
        if (req.query.product) { query += ' AND product = ?'; params.push(req.query.product); }
        if (req.query.segment) { query += ' AND segment = ?'; params.push(req.query.segment); }
        if (req.query.bin_type) { query += ' AND bin_type = ?'; params.push(req.query.bin_type); }
        if (req.query.bin_length) { query += ' AND bin_length = ?'; params.push(parseInt(req.query.bin_length)); }
        if (req.query.country) { query += ' AND country = ?'; params.push(req.query.country); }
        if (req.query.ica) { query += ' AND ica = ?'; params.push(req.query.ica); }
        if (req.query.embosser) { query += ' AND embosser = ?'; params.push(req.query.embosser); }
        if (req.query.balance_type) { query += ' AND balance_type = ?'; params.push(req.query.balance_type); }
        if (req.query.tokenization) { query += ' AND tokenization = ?'; params.push(req.query.tokenization); }
        if (req.query.parent_only === 'true') { query += ' AND parent_bin IS NULL'; }
        if (req.query.search) {
            query += ' AND (bin_number LIKE ? OR client LIKE ? OR ica LIKE ? OR tokenization LIKE ? OR country LIKE ?)';
            const s = `%${req.query.search}%`;
            params.push(s, s, s, s, s);
        }

        const sortBy = req.query.sort || 'bin_number';
        const sortOrder = req.query.order === 'desc' ? 'DESC' : 'ASC';
        const allowedSorts = ['bin_number', 'country', 'ica', 'brand', 'product', 'segment', 'status', 'client', 'bin_type', 'bin_length', 'created_at', 'tokenization', 'embosser', 'balance_type'];
        if (allowedSorts.includes(sortBy)) {
            query += ` ORDER BY ${sortBy} ${sortOrder}`;
        } else {
            query += ' ORDER BY bin_number ASC';
        }

        const bins = queryAll(query, params);

        // Enrich parent BINs with segment counts
        const enriched = bins.map(bin => {
            if (bin.parent_bin === null && (bin.bin_length === 9 || bin.bin_length === 10)) {
                const segs = queryAll('SELECT status FROM bins WHERE parent_bin = ?', [bin.bin_number]);
                const totalSegs = segs.length;
                const assignedSegs = segs.filter(s => s.status === 'assigned' || s.status === 'pending').length;
                return { ...bin, total_segments: totalSegs, assigned_segments: assignedSegs, available_segments: totalSegs - assignedSegs };
            }
            return bin;
        });

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== GET /api/bins/embosser-check/:parentBin ==========
// Returns the embosser already assigned in sibling segments (if any)
router.get('/embosser-check/:parentBin', authenticateToken, (req, res) => {
    try {
        const parentBin = req.params.parentBin;
        // Only check segments that are actually in use (assigned or pending),
        // not available segments that inherited the embosser from the parent BIN
        const assigned = queryOne(
            `SELECT embosser FROM bins WHERE parent_bin = ? AND embosser IS NOT NULL AND embosser != '' AND status IN ('assigned', 'pending') LIMIT 1`,
            [parentBin]
        );
        if (assigned) {
            return res.json({ has_embosser: true, embosser: assigned.embosser });
        }
        res.json({ has_embosser: false, embosser: null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== GET /api/bins/stats ==========
router.get('/stats', authenticateToken, (req, res) => {
    try {
        const total = queryOne('SELECT COUNT(*) as count FROM bins WHERE parent_bin IS NULL').count;
        const available = queryOne("SELECT COUNT(*) as count FROM bins WHERE status = 'available'").count;
        const assigned = queryOne("SELECT COUNT(*) as count FROM bins WHERE status = 'assigned'").count;
        const segmented = queryOne("SELECT COUNT(*) as count FROM bins WHERE status = 'segmented'").count;
        const pending = queryOne("SELECT COUNT(*) as count FROM bins WHERE status = 'pending'").count;
        const exhausted = queryOne("SELECT COUNT(*) as count FROM bins WHERE status = 'exhausted'").count;

        // By length (all bins)
        const byLength = queryAll("SELECT bin_length, COUNT(*) as count FROM bins GROUP BY bin_length ORDER BY bin_length");

        // Available by length
        const availableByLength = queryAll("SELECT bin_length, COUNT(*) as count FROM bins WHERE status = 'available' GROUP BY bin_length ORDER BY bin_length");

        // Top clients with assigned BINs
        const byClient = queryAll("SELECT client, COUNT(*) as count FROM bins WHERE status = 'assigned' AND client IS NOT NULL AND client != '' GROUP BY client ORDER BY count DESC");

        // Matrix by Country: 8d, 9d, 10d, Assigned, Available
        const countryMatrix = queryAll(`
            SELECT 
                IFNULL(country, 'Sin País') as country,
                SUM(CASE WHEN bin_length = 8 THEN 1 ELSE 0 END) as len8,
                SUM(CASE WHEN bin_length = 9 THEN 1 ELSE 0 END) as len9,
                SUM(CASE WHEN bin_length = 10 THEN 1 ELSE 0 END) as len10,
                SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned,
                SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available
            FROM bins
            GROUP BY country
            ORDER BY assigned DESC, available DESC
        `);

        // Recent Activity
        const recentActivity = queryAll(`
            SELECT bin_number, client, product, segment, bin_type, bin_length, updated_at, status
            FROM bins
            WHERE status IN ('assigned', 'pending')
            ORDER BY updated_at DESC
            LIMIT 10
        `);

        // By brand
        const byBrand = queryAll("SELECT brand, COUNT(*) as count FROM bins WHERE brand IS NOT NULL AND parent_bin IS NULL GROUP BY brand");

        // By product
        const byProduct = queryAll("SELECT product, COUNT(*) as count FROM bins WHERE product IS NOT NULL AND parent_bin IS NULL GROUP BY product");

        // By BIN type (sponsor vs principal)
        const byBinType = queryAll("SELECT bin_type, COUNT(*) as count FROM bins WHERE bin_type IS NOT NULL AND parent_bin IS NULL GROUP BY bin_type");

        res.json({
            total, available, assigned, segmented, pending, exhausted,
            byLength, availableByLength, byClient, countryMatrix, recentActivity,
            byBrand, byProduct, byBinType
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== GET /api/bins/segments/:parentBin ==========
router.get('/segments/:parentBin', authenticateToken, (req, res) => {
    try {
        const segments = queryAll('SELECT * FROM bins WHERE parent_bin = ? ORDER BY bin_number ASC', [req.params.parentBin]);
        res.json(segments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== GET /api/bins/export/excel ==========
router.get('/export/excel', authenticateToken, (req, res) => {
    try {
        const bins = queryAll('SELECT * FROM bins ORDER BY bin_number ASC');
        const data = bins.map(b => ({
            'País': b.country || '',
            'ICA': b.ica || '',
            'ICA QMR': b.ica_qmr || '',
            'BIN': b.bin_number,
            'Dígitos': b.bin_length,
            'BIN Padre': b.parent_bin || '',
            'Marca': b.brand || '',
            'Producto': b.product || '',
            'Estado': b.status === 'available' ? 'Disponible' : b.status === 'assigned' ? 'Asignado' : b.status === 'segmented' ? 'Segmentado' : b.status === 'pending' ? 'Por aprobar' : b.status === 'exhausted' ? 'Agotado' : b.status === 'on_hold' ? 'En Espera' : b.status,
            'Cliente': b.client || '',
            'Tokenización': b.tokenization || '',
            'Llaves': b.keys || '',
            'Embozador': b.embosser || '',
            'Tipo BIN': b.bin_type || '',
            'Fecha Asignación': b.assigned_date || '',
            'Solicitado por': b.requested_by || '',
            'Aprobado por': b.approved_by || '',
            'Notas': b.notes || ''
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'BINes');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename=bines_export.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== GET /api/bins/:id ==========
router.get('/:id', authenticateToken, (req, res) => {
    try {
        const bin = queryOne('SELECT * FROM bins WHERE id = ?', [parseInt(req.params.id)]);
        if (!bin) return res.status(404).json({ error: 'BIN no encontrado' });
        res.json(bin);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== POST /api/bins — Create BIN with auto-segmentation ==========
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { country, ica, ica_qmr, bin_number, brand, product, client, tokenization, keys, embosser, bin_type, balance_type, notes, status } = req.body;

        if (!bin_number || !bin_number.trim()) {
            return res.status(400).json({ error: 'El número de BIN es requerido' });
        }

        const cleanBin = bin_number.trim().replace(/\D/g, '');
        const binLen = cleanBin.length;

        if (binLen < 6 || binLen > 10) {
            return res.status(400).json({ error: 'El BIN debe tener entre 6 y 10 dígitos' });
        }

        // Check duplicate
        const existing = queryOne('SELECT id FROM bins WHERE bin_number = ?', [cleanBin]);
        if (existing) return res.status(409).json({ error: 'Este BIN ya existe' });

        // Determine initial status
        let binStatus = status || 'available';

        // 8-digit: no segmentation, direct assignment
        if (binLen === 8) {
            if (binStatus === 'assigned') {
                const result = runQuery(
                    `INSERT INTO bins (country, ica, ica_qmr, bin_number, bin_length, parent_bin, status, brand, product, client, tokenization, keys, embosser, bin_type, balance_type, notes, assigned_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [country || null, ica || null, ica_qmr || null, cleanBin, binLen, null, 'assigned', brand || null, product || null, client || null, tokenization || null, keys || null, embosser || null, bin_type || null, balance_type || null, notes || null, new Date().toISOString().split('T')[0]]
                );
                logAudit(req.user.id, req.user.username, 'CREATE', 'bins', result.lastInsertRowid, null, null, cleanBin, 'BIN 8 dígitos creado como asignado');
                const newBin = queryOne('SELECT * FROM bins WHERE id = ?', [result.lastInsertRowid]);
                return res.status(201).json(newBin);
            }

            const result = runQuery(
                `INSERT INTO bins (country, ica, ica_qmr, bin_number, bin_length, parent_bin, status, brand, product, client, tokenization, keys, embosser, bin_type, balance_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [country || null, ica || null, ica_qmr || null, cleanBin, binLen, null, 'available', brand || null, product || null, client || null, tokenization || null, keys || null, embosser || null, bin_type || null, balance_type || null, notes || null]
            );
            logAudit(req.user.id, req.user.username, 'CREATE', 'bins', result.lastInsertRowid, null, null, cleanBin, 'BIN 8 dígitos creado');
            const newBin = queryOne('SELECT * FROM bins WHERE id = ?', [result.lastInsertRowid]);
            return res.status(201).json(newBin);
        }

        // 9-digit or 10-digit: create parent + segments
        if (binLen === 9 || binLen === 10) {
            return res.status(400).json({ error: `Para crear un BIN de ${binLen} dígitos, use la función de segmentación. Primero cree un BIN padre de 8 dígitos.` });
        }

        // 6-7 digit: simple creation (fallback)
        const result = runQuery(
            `INSERT INTO bins (country, ica, ica_qmr, bin_number, bin_length, parent_bin, status, brand, product, client, tokenization, keys, embosser, bin_type, balance_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [country || null, ica || null, ica_qmr || null, cleanBin, binLen, null, binStatus, brand || null, product || null, client || null, tokenization || null, keys || null, embosser || null, bin_type || null, balance_type || null, notes || null]
        );
        logAudit(req.user.id, req.user.username, 'CREATE', 'bins', result.lastInsertRowid, null, null, cleanBin, `BIN ${binLen} dígitos creado`);
        const newBin = queryOne('SELECT * FROM bins WHERE id = ?', [result.lastInsertRowid]);
        res.status(201).json(newBin);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== POST /api/bins/segment — Create segments for a parent BIN ==========
router.post('/segment', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { parent_bin_number, target_length } = req.body;

        if (!parent_bin_number) {
            return res.status(400).json({ error: 'Se requiere el BIN padre' });
        }

        const parent = queryOne('SELECT * FROM bins WHERE bin_number = ?', [parent_bin_number]);
        if (!parent) {
            return res.status(404).json({ error: 'El BIN padre no existe. Debe crearlo primero.' });
        }

        if (parent.status !== 'available') {
            return res.status(400).json({ error: 'El BIN padre debe estar en estado Disponible para segmentar' });
        }

        const parentLen = parent.bin_number.length;
        let segCount, segLen;

        if (parentLen === 8) {
            if (target_length === 9) {
                segCount = 10;
                segLen = 9;
            } else {
                // Default: 10-digit segments (100 segments)
                segCount = 100;
                segLen = 10;
            }
        } else if (parentLen === 9) {
            segCount = 10;
            segLen = 10;
        } else {
            return res.status(400).json({ error: 'Solo se pueden segmentar BINes de 8 o 9 dígitos' });
        }

        // Check if segments already exist
        const existingSegs = queryAll('SELECT id FROM bins WHERE parent_bin = ?', [parent.bin_number]);
        if (existingSegs.length > 0) {
            return res.status(400).json({ error: 'Este BIN ya tiene segmentos creados' });
        }

        // Generate segments
        let created = 0;
        for (let i = 0; i < segCount; i++) {
            const suffix = segLen === 10 ? String(i).padStart(2, '0') : String(i);
            const segNumber = parent.bin_number + suffix;

            // Check if segment already exists
            const exists = queryOne('SELECT id FROM bins WHERE bin_number = ?', [segNumber]);
            if (!exists) {
                runQuery(
                    `INSERT INTO bins (country, ica, ica_qmr, bin_number, bin_length, parent_bin, status, brand, product, keys, embosser, bin_type)
           VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?)`,
                    [parent.country, parent.ica, parent.ica_qmr, segNumber, segLen, parent.bin_number, parent.brand, parent.product, parent.keys, parent.embosser, parent.bin_type]
                );
                created++;
            }
        }

        // Update parent status  
        runQuery('UPDATE bins SET status = ?, updated_at = datetime("now", "localtime") WHERE id = ?', ['segmented', parent.id]);

        logAudit(req.user.id, req.user.username, 'SEGMENT', 'bins', parent.id, 'status', 'available', 'segmented', `${created} segmentos de ${segLen} dígitos creados`);

        res.status(201).json({ message: `${created} segmentos creados para BIN ${parent.bin_number}`, created, segLength: segLen });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== PUT /api/bins/:id — Edit BIN ==========
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const bin = queryOne('SELECT * FROM bins WHERE id = ?', [parseInt(req.params.id)]);
        if (!bin) return res.status(404).json({ error: 'BIN no encontrado' });

        const { country, ica, ica_qmr, bin_number, brand, product, segment, client, tokenization, keys, embosser, bin_type, balance_type, notes, status } = req.body;

        // Check for number change + duplicate
        const cleanBin = bin_number ? bin_number.trim().replace(/\D/g, '') : bin.bin_number;
        if (cleanBin !== bin.bin_number) {
            const existing = queryOne('SELECT id FROM bins WHERE bin_number = ? AND id != ?', [cleanBin, bin.id]);
            if (existing) return res.status(409).json({ error: 'Este BIN ya existe' });
        }

        // Log field changes
        const fields = { country, ica, ica_qmr, brand, product, segment, client, tokenization, keys, embosser, bin_type, balance_type, notes, status };
        for (const [key, val] of Object.entries(fields)) {
            if (val !== undefined && val !== bin[key]) {
                logAudit(req.user.id, req.user.username, 'UPDATE', 'bins', bin.id, key, bin[key], val, null);
            }
        }

        const binLen = cleanBin.length;
        runQuery(
            `UPDATE bins SET country=?, ica=?, ica_qmr=?, bin_number=?, bin_length=?,
       brand=?, product=?, segment=?, client=?, tokenization=?, keys=?, embosser=?, bin_type=?, balance_type=?,
       notes=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
            [country || bin.country, ica || bin.ica, ica_qmr || bin.ica_qmr, cleanBin, binLen,
            brand || bin.brand, product || bin.product, segment ?? bin.segment, client ?? bin.client, tokenization ?? bin.tokenization,
            keys ?? bin.keys, embosser ?? bin.embosser, bin_type || bin.bin_type, balance_type ?? bin.balance_type,
            notes ?? bin.notes, status || bin.status, parseInt(req.params.id)]
        );

        const updated = queryOne('SELECT * FROM bins WHERE id = ?', [parseInt(req.params.id)]);

        // Recalculate parent if it was a segment
        if (updated && updated.parent_bin) {
            recalcParentStatus(updated.parent_bin);
        }

        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== PUT /api/bins/:id/assign ==========
router.put('/:id/assign', authenticateToken, requireAdmin, (req, res) => {
    try {
        const bin = queryOne('SELECT * FROM bins WHERE id = ?', [parseInt(req.params.id)]);
        if (!bin) return res.status(404).json({ error: 'BIN no encontrado' });

        if (bin.status === 'assigned') return res.status(400).json({ error: 'Este BIN ya está asignado' });
        if (bin.status === 'exhausted') return res.status(400).json({ error: 'Este BIN está agotado' });

        const { client, tokenization } = req.body || {};

        runQuery(
            `UPDATE bins SET status='assigned', client=?, tokenization=?, assigned_date=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?`,
            [client || bin.client, tokenization || bin.tokenization, parseInt(req.params.id)]
        );

        logAudit(req.user.id, req.user.username, 'ASSIGN', 'bins', bin.id, 'status', bin.status, 'assigned', `BIN ${bin.bin_number} asignado`);

        // Recalculate parent
        if (bin.parent_bin) {
            recalcParentStatus(bin.parent_bin);
        }

        const updated = queryOne('SELECT * FROM bins WHERE id = ?', [parseInt(req.params.id)]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== PUT /api/bins/:id/release ==========
router.put('/:id/release', authenticateToken, requireAdmin, (req, res) => {
    try {
        const bin = queryOne('SELECT * FROM bins WHERE id = ?', [parseInt(req.params.id)]);
        if (!bin) return res.status(404).json({ error: 'BIN no encontrado' });

        runQuery(
            `UPDATE bins SET status='available', client=NULL, tokenization=NULL, assigned_date=NULL, requested_by=NULL, approved_by=NULL, updated_at=datetime('now','localtime') WHERE id=?`,
            [parseInt(req.params.id)]
        );

        logAudit(req.user.id, req.user.username, 'RELEASE', 'bins', bin.id, 'status', bin.status, 'available', `BIN ${bin.bin_number} liberado`);

        // Recalculate parent
        if (bin.parent_bin) {
            recalcParentStatus(bin.parent_bin);
        }

        const updated = queryOne('SELECT * FROM bins WHERE id = ?', [parseInt(req.params.id)]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== DELETE /api/bins/all ==========
router.delete('/all', authenticateToken, requireAdmin, (req, res) => {
    try {
        const count = queryOne('SELECT COUNT(*) as c FROM bins').c;
        if (count > 0) {
            runQuery('DELETE FROM bins');
            logAudit(req.user.id, req.user.username, 'DELETE_ALL', 'bins', null, null, null, null, `Eliminados ${count} BINes masivamente`);
        }
        res.json({ message: `Se eliminaron ${count} BINes correctamente` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== DELETE /api/bins/:id ==========
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const bin = queryOne('SELECT * FROM bins WHERE id = ?', [parseInt(req.params.id)]);
        if (!bin) return res.status(404).json({ error: 'BIN no encontrado' });

        // If parent BIN, delete all segments too
        if (bin.parent_bin === null) {
            const childCount = queryOne('SELECT COUNT(*) as c FROM bins WHERE parent_bin = ?', [bin.bin_number]).c;
            if (childCount > 0) {
                runQuery('DELETE FROM bins WHERE parent_bin = ?', [bin.bin_number]);
                logAudit(req.user.id, req.user.username, 'DELETE', 'bins', bin.id, null, null, null, `Eliminados ${childCount} segmentos del BIN ${bin.bin_number}`);
            }
        }

        runQuery('DELETE FROM bins WHERE id = ?', [parseInt(req.params.id)]);
        logAudit(req.user.id, req.user.username, 'DELETE', 'bins', bin.id, null, bin.bin_number, null, `BIN ${bin.bin_number} eliminado`);

        // Recalculate parent if it was a segment
        if (bin.parent_bin) {
            recalcParentStatus(bin.parent_bin);
        }

        res.json({ message: 'BIN eliminado correctamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== POST /api/bins/bulk — Bulk import (JSON) ==========
// Status and parent_bin are auto-calculated:
//   - status: 'assigned' if client is present, 'available' otherwise
//   - parent_bin: first 8 digits of the BIN if it has 9 or 10 digits
router.post('/bulk', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { bins } = req.body;
        if (!Array.isArray(bins) || bins.length === 0) {
            return res.status(400).json({ error: 'Se requiere un array de BINes' });
        }
        const result = processBulkBins(bins, req.user);
        res.status(201).json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== POST /api/bins/bulk-file — Bulk import from file (.txt, .csv, .xlsx, .xls) ==========
router.post('/bulk-file', authenticateToken, requireAdmin, upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

        const ext = req.file.originalname.split('.').pop().toLowerCase();
        let bins = [];

        if (ext === 'xlsx' || ext === 'xls') {
            // Parse Excel
            const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
            // Normalize headers (lowercase, underscores)
            bins = data.map(row => {
                const obj = {};
                Object.keys(row).forEach(k => {
                    obj[k.trim().toLowerCase().replace(/\s+/g, '_')] = String(row[k]).trim();
                });
                return obj;
            });
        } else if (ext === 'txt' || ext === 'csv') {
            // Parse as CSV text
            const text = req.file.buffer.toString('utf-8');
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) return res.status(400).json({ error: 'El archivo no tiene datos suficientes' });

            const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
            bins = lines.slice(1).map(line => {
                const vals = line.split(',').map(v => v.trim());
                const obj = {};
                headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
                return obj;
            }).filter(b => b.bin_number);
        } else {
            return res.status(400).json({ error: 'Formato no soportado. Use .txt, .csv, .xlsx o .xls' });
        }

        if (bins.length === 0) return res.status(400).json({ error: 'No se encontraron datos válidos en el archivo' });

        const result = processBulkBins(bins, req.user);
        res.status(201).json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== Helper: process bulk BIN import ==========
function processBulkBins(bins, user) {
    let inserted = 0, skipped = 0, errors = [];
    const affectedParents = new Set();
    const parentsToSegment = new Set(); // Track parents that need their missing segments created

    for (const b of bins) {
        try {
            if (!b.bin_number) { skipped++; continue; }

            const cleanBin = String(b.bin_number).trim().replace(/\D/g, '');
            if (cleanBin.length < 6 || cleanBin.length > 10) { skipped++; errors.push(`${b.bin_number}: longitud inválida`); continue; }

            const existing = queryOne('SELECT id FROM bins WHERE bin_number = ?', [cleanBin]);
            if (existing) { skipped++; continue; }

            const binLen = cleanBin.length;

            // Auto-calculate status: has client → assigned, else → available
            // "Sin cliente" is treated as no client
            const clientVal = b.client ? String(b.client).trim() : '';
            const isNoClient = !clientVal || clientVal.toLowerCase() === 'sin cliente';
            const binStatus = isNoClient ? 'available' : 'assigned';
            const assignedDate = isNoClient ? null : new Date().toISOString().split('T')[0];

            // Auto-calculate parent_bin: first 8 digits for 9/10-digit BINs
            let parentBin = null;
            if (binLen === 9 || binLen === 10) {
                parentBin = cleanBin.substring(0, 8);
                // Ensure parent BIN exists; create it if not
                const parentExists = queryOne('SELECT id FROM bins WHERE bin_number = ?', [parentBin]);
                if (!parentExists) {
                    runQuery(
                        `INSERT INTO bins (country, ica, ica_qmr, bin_number, bin_length, parent_bin, status, brand, product, segment, keys, embosser, bin_type, balance_type) VALUES (?, ?, ?, ?, 8, NULL, 'segmented', ?, ?, ?, ?, ?, ?, ?)`,
                        [b.country || null, b.ica || null, b.ica_qmr || null, parentBin, b.brand || null, b.product || null, b.segment || null, b.keys || null, b.embosser || null, b.bin_type || null, b.balance_type || null]
                    );
                }
                affectedParents.add(parentBin);
                // We mark the parent to auto-fill its segments
                parentsToSegment.add(JSON.stringify({
                    parentNumber: parentBin,
                    targetLength: binLen,
                    country: b.country, ica: b.ica, ica_qmr: b.ica_qmr, brand: b.brand,
                    product: b.product, segment: b.segment, keys: b.keys, embosser: b.embosser, bin_type: b.bin_type,
                    balance_type: b.balance_type
                }));
            }

            // Embosser rule: if client is blank, embosser MUST be blank (null) to avoid binding it incorrectly
            const finalEmbosser = isNoClient ? null : (b.embosser || null);

            runQuery(
                `INSERT INTO bins (country, ica, ica_qmr, bin_number, bin_length, parent_bin, status, brand, product, segment, client, tokenization, keys, embosser, bin_type, balance_type, notes, assigned_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [b.country || null, b.ica || null, b.ica_qmr || null, cleanBin, binLen, parentBin, binStatus,
                b.brand || null, b.product || null, b.segment || null, isNoClient ? null : clientVal, b.tokenization || null, b.keys || null, finalEmbosser,
                b.bin_type || null, b.balance_type || null, b.notes || null, assignedDate]
            );
            inserted++;
        } catch (e) {
            skipped++;
            errors.push(`${b.bin_number}: ${e.message}`);
        }
    }

    // Auto-generate missing segments for parents that had 9/10 digit BINs imported
    parentsToSegment.forEach(pStr => {
        const p = JSON.parse(pStr);
        const segCount = p.targetLength === 9 ? 10 : 100;
        const segLen = p.targetLength;
        for (let i = 0; i < segCount; i++) {
            const suffix = segLen === 10 ? String(i).padStart(2, '0') : String(i);
            const segNumber = p.parentNumber + suffix;
            const exists = queryOne('SELECT id FROM bins WHERE bin_number = ?', [segNumber]);
            if (!exists) {
                // missing segments are generated as available, so embosser must be NULL
                runQuery(
                    `INSERT INTO bins (country, ica, ica_qmr, bin_number, bin_length, parent_bin, status, brand, product, segment, keys, embosser, bin_type, balance_type) VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, NULL, ?, ?)`,
                    [p.country || null, p.ica || null, p.ica_qmr || null, segNumber, segLen, p.parentNumber,
                    p.brand || null, p.product || null, p.segment || null, p.keys || null, p.bin_type || null, p.balance_type || null]
                );
            }
        }
    });

    // Recalculate parent statuses for all affected parents
    affectedParents.forEach(p => recalcParentStatus(p));

    logAudit(user.id, user.username, 'BULK_IMPORT', 'bins', null, null, null, null, `${inserted} BINes importados, ${skipped} omitidos`);

    return { message: `${inserted} BINes importados, ${skipped} omitidos`, inserted, skipped, errors: errors.slice(0, 10) };
}

// ========== GET /api/bins/next-available — Find next available BIN/segment ==========
router.get('/next-available', authenticateToken, (req, res) => {
    try {
        const { digits, country, brand, product, segment, bin_type } = req.query;

        if (!digits) return res.status(400).json({ error: 'Se requiere el parámetro digits' });

        const dLen = parseInt(digits);

        if (dLen === 8) {
            // Find available 8-digit BIN
            let query = "SELECT * FROM bins WHERE bin_length = 8 AND status = 'available' AND parent_bin IS NULL";
            const params = [];
            if (country) { query += ' AND country = ?'; params.push(country); }
            if (brand) { query += ' AND brand = ?'; params.push(brand); }
            if (product) { query += ' AND product = ?'; params.push(product); }
            if (segment) { query += ' AND segment = ?'; params.push(segment); }
            if (bin_type) { query += ' AND bin_type = ?'; params.push(bin_type); }
            query += ' ORDER BY bin_number ASC LIMIT 1';

            const bin = queryOne(query, params);
            if (!bin) return res.status(404).json({ error: 'No hay BINes de 8 dígitos disponibles con los filtros indicados' });
            return res.json(bin);
        }

        if (dLen === 9 || dLen === 10) {
            // Find available segment
            let query = `SELECT s.* FROM bins s JOIN bins p ON s.parent_bin = p.bin_number
        WHERE s.bin_length = ? AND s.status = 'available' AND s.parent_bin IS NOT NULL`;
            const params = [dLen];
            if (country) { query += ' AND p.country = ?'; params.push(country); }
            if (brand) { query += ' AND p.brand = ?'; params.push(brand); }
            if (product) { query += ' AND p.product = ?'; params.push(product); }
            if (segment) { query += ' AND p.segment = ?'; params.push(segment); }
            if (bin_type) { query += ' AND p.bin_type = ?'; params.push(bin_type); }
            query += ' ORDER BY s.bin_number ASC LIMIT 1';

            const seg = queryOne(query, params);
            if (!seg) return res.status(404).json({ error: `No hay segmentos de ${dLen} dígitos disponibles con los filtros indicados` });
            return res.json(seg);
        }

        res.status(400).json({ error: 'Dígitos debe ser 8, 9, o 10' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== PUT /api/bins/:id/hold — Admin: manually set BIN to on_hold ==========
router.put('/:id/hold', authenticateToken, requireAdmin, (req, res) => {
    try {
        const bin = queryOne('SELECT * FROM bins WHERE id = ?', [parseInt(req.params.id)]);
        if (!bin) return res.status(404).json({ error: 'BIN no encontrado' });

        if (bin.status === 'on_hold') return res.status(400).json({ error: 'El BIN ya está En Espera' });
        if (bin.status === 'segmented' || bin.status === 'exhausted') {
            return res.status(400).json({ error: 'No se puede poner en espera un BIN segmentado o agotado' });
        }

        const prevStatus = bin.status;
        runQuery(
            `UPDATE bins SET status='on_hold', updated_at=datetime('now','localtime') WHERE id=?`,
            [parseInt(req.params.id)]
        );

        logAudit(req.user.id, req.user.username, 'HOLD', 'bins', bin.id, 'status', prevStatus, 'on_hold', `BIN ${bin.bin_number} puesto En Espera`);

        const updated = queryOne('SELECT * FROM bins WHERE id = ?', [parseInt(req.params.id)]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== PUT /api/bins/:id/unsegment — Admin: return BIN to 8-digit state ==========
router.put('/:id/unsegment', authenticateToken, requireAdmin, (req, res) => {
    try {
        const bin = queryOne('SELECT * FROM bins WHERE id = ?', [parseInt(req.params.id)]);
        if (!bin) return res.status(404).json({ error: 'BIN no encontrado' });

        // Accept both 'segmented' and 'available' status — when rejection sets all segments to available,
        // the parent may already be in 'available' but still have orphan child segments
        const hasSegments = queryOne('SELECT COUNT(*) as c FROM bins WHERE parent_bin = ?', [bin.bin_number]).c;
        if (bin.status !== 'segmented' && bin.status !== 'available') {
            return res.status(400).json({ error: 'El BIN no se puede des-segmentar en su estado actual' });
        }
        if (!hasSegments) {
            return res.status(400).json({ error: 'Este BIN no tiene segmentos' });
        }
        const usedSegs = queryAll(
            `SELECT id FROM bins WHERE parent_bin = ? AND (status = 'assigned' OR status = 'pending')`,
            [bin.bin_number]
        );
        if (usedSegs.length > 0) {
            return res.status(400).json({ error: `No se puede des-segmentar: hay ${usedSegs.length} segmento(s) en uso` });
        }

        // Delete all segments
        const segCount = queryOne('SELECT COUNT(*) as c FROM bins WHERE parent_bin = ?', [bin.bin_number]).c;
        runQuery('DELETE FROM bins WHERE parent_bin = ?', [bin.bin_number]);

        // Restore parent to available
        runQuery(
            `UPDATE bins SET status = 'available', first_segmentation = 0, updated_at = datetime('now','localtime') WHERE id = ?`,
            [bin.id]
        );

        logAudit(req.user.id, req.user.username, 'UNSEGMENT', 'bins', bin.id, 'status', 'segmented', 'available',
            `BIN ${bin.bin_number} des-segmentado. ${segCount} segmentos eliminados`);

        const updated = queryOne('SELECT * FROM bins WHERE id = ?', [bin.id]);
        res.json({ message: `BIN ${bin.bin_number} regresado a BIN 8. ${segCount} segmentos eliminados.`, bin: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
