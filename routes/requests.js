const express = require('express');
const { queryAll, queryOne, runQuery, logAudit } = require('../db_connector');
const { authenticateToken, requireAdmin, requireRequester } = require('../middleware/auth');

const router = express.Router();

// ========== GET /api/requests — List requests ==========
router.get('/', authenticateToken, (req, res) => {
    try {
        let query = 'SELECT * FROM requests WHERE 1=1';
        const params = [];

        // Admin sees all, requester sees only own
        if (req.user.role === 'requester') {
            query += ' AND requester_id = ?';
            params.push(req.user.id);
        }

        if (req.query.status) {
            query += ' AND status = ?';
            params.push(req.query.status);
        }

        query += ' ORDER BY created_at DESC';
        const requests = queryAll(query, params);
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== POST /api/requests — Create BIN request ==========
router.post('/', authenticateToken, requireRequester, (req, res) => {
    try {
        const { country, ica, ica_qmr, digits, brand, product, segment, client, tokenization, keys, embosser, bin_type, balance_type, notes } = req.body;

        // ===== Validate ALL required fields =====
        if (!country) return res.status(400).json({ error: 'El país es requerido' });
        if (!digits || ![8, 9, 10].includes(parseInt(digits))) return res.status(400).json({ error: 'Dígitos debe ser 8, 9, o 10' });
        if (!brand) return res.status(400).json({ error: 'La marca es requerida' });
        if (!product) return res.status(400).json({ error: 'El producto es requerido' });
        if (!segment) return res.status(400).json({ error: 'El segmento es requerido' });
        if (!client) return res.status(400).json({ error: 'El cliente es requerido' });
        if (!tokenization) return res.status(400).json({ error: 'La tokenización es requerida' });
        const validTokenizations = ['COF', 'Billetera Apple', 'Billetera Google', 'Billetera Ambas', 'No aplica'];
        if (!validTokenizations.includes(tokenization)) {
            return res.status(400).json({ error: 'Tokenización inválida. Opciones: ' + validTokenizations.join(', ') });
        }
        if (!keys) return res.status(400).json({ error: 'El tipo de llaves es requerido' });
        if (!embosser) return res.status(400).json({ error: 'El embozador es requerido' });
        if (!balance_type || !['Interno', 'Externo'].includes(balance_type)) {
            return res.status(400).json({ error: 'El tipo de saldos es requerido (Interno o Externo)' });
        }
        if (!bin_type) return res.status(400).json({ error: 'El tipo de BIN es requerido' });

        const dLen = parseInt(digits);

        // ===== Product-based digit restrictions =====
        if ((product === 'Prepago' || product === 'Débito') && dLen !== 10) {
            return res.status(400).json({ error: `El producto ${product} requiere BIN de 10 dígitos` });
        }
        if (product === 'Crédito' && dLen !== 9) {
            return res.status(400).json({ error: 'El producto Crédito requiere BIN de 9 dígitos' });
        }

        // ===== 8-digit BINs only for admin =====
        if (dLen === 8 && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Solo el administrador puede solicitar BINes de 8 dígitos' });
        }
        let proposedBin = null;
        let proposedBinId = null;
        let isFirstSegmentation = false;

        // Find next available BIN/segment
        if (dLen === 8) {
            let query = "SELECT * FROM bins WHERE bin_length = 8 AND status = 'available'";
            const params = [];
            if (country) { query += ' AND country = ?'; params.push(country); }
            if (brand) { query += ' AND brand = ?'; params.push(brand); }
            if (product) { query += ' AND product = ?'; params.push(product); }
            if (segment) { query += ' AND segment = ?'; params.push(segment); }
            query += ' ORDER BY bin_number ASC LIMIT 1';

            const bin = queryOne(query, params);
            if (!bin) return res.status(404).json({ error: 'No hay BINes de 8 dígitos disponibles con los filtros indicados' });

            proposedBin = bin.bin_number;
            proposedBinId = bin.id;
        } else {
            // Try to find an existing available segment of the requested length
            // EXCLUDE segments from parent BINs that are already bound to a DIFFERENT embosser.
            let query = `SELECT s.* FROM bins s JOIN bins p ON s.parent_bin = p.bin_number
        WHERE s.bin_length = ? AND s.status = 'available' AND s.parent_bin IS NOT NULL`;
            const params = [dLen];
            if (country) { query += ' AND p.country = ?'; params.push(country); }
            if (brand) { query += ' AND p.brand = ?'; params.push(brand); }
            if (product) { query += ' AND p.product = ?'; params.push(product); }
            if (segment) { query += ' AND p.segment = ?'; params.push(segment); }
            
            if (embosser) {
                query += ` AND NOT EXISTS (
                    SELECT 1 FROM bins s2 
                    WHERE s2.parent_bin = s.parent_bin 
                      AND s2.embosser IS NOT NULL AND s2.embosser != '' 
                      AND LOWER(s2.embosser) != LOWER(?) 
                      AND s2.status IN ('assigned', 'pending')
                )`;
                params.push(embosser);
            }

            query += ' ORDER BY s.bin_number ASC LIMIT 1';

            let seg = queryOne(query, params);

            // If no segments exist, auto-segment an available 8-digit parent BIN
            if (!seg) {
                let parentQuery = "SELECT * FROM bins WHERE bin_length = 8 AND status = 'available'";
                const parentParams = [];
                if (country) { parentQuery += ' AND country = ?'; parentParams.push(country); }
                if (brand) { parentQuery += ' AND brand = ?'; parentParams.push(brand); }
                if (product) { parentQuery += ' AND product = ?'; parentParams.push(product); }
                if (segment) { parentQuery += ' AND segment = ?'; parentParams.push(segment); }
                parentQuery += ' ORDER BY bin_number ASC LIMIT 1';

                const parentBin = queryOne(parentQuery, parentParams);
                if (!parentBin) {
                    return res.status(404).json({ error: `No hay BINes disponibles para segmentar a ${dLen} dígitos con los filtros indicados` });
                }

                // Auto-segment the parent BIN
                let segCount, segLen;
                if (dLen === 9) {
                    segCount = 10; segLen = 9;
                } else {
                    segCount = 100; segLen = 10;
                }

                for (let i = 0; i < segCount; i++) {
                    const suffix = segLen === 10 ? String(i).padStart(2, '0') : String(i);
                    const segNumber = parentBin.bin_number + suffix;
                    const exists = queryOne('SELECT id FROM bins WHERE bin_number = ?', [segNumber]);
                    if (!exists) {
                        runQuery(
                            `INSERT INTO bins (country, ica, ica_qmr, bin_number, bin_length, parent_bin, status, brand, product, segment, keys, embosser, bin_type)
                             VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?)`,
                            [parentBin.country, parentBin.ica, parentBin.ica_qmr, segNumber, segLen, parentBin.bin_number,
                            parentBin.brand, parentBin.product, parentBin.segment, parentBin.keys, parentBin.embosser, parentBin.bin_type]
                        );
                    }
                }

                // Update parent status to segmented + mark as first segmentation
                runQuery("UPDATE bins SET status = 'segmented', first_segmentation = 1, updated_at = datetime('now', 'localtime') WHERE id = ?", [parentBin.id]);
                isFirstSegmentation = true;

                logAudit(req.user.id, req.user.username, 'AUTO_SEGMENT', 'bins', parentBin.id, 'status', 'available', 'segmented',
                    `Auto-segmentado ${parentBin.bin_number} a ${segCount} segmentos de ${segLen} dígitos por solicitud`);

                // Now find the first available segment
                seg = queryOne(
                    `SELECT * FROM bins WHERE parent_bin = ? AND bin_length = ? AND status = 'available' ORDER BY bin_number ASC LIMIT 1`,
                    [parentBin.bin_number, dLen]
                );
            }

            if (!seg) return res.status(404).json({ error: `No hay segmentos de ${dLen} dígitos disponibles` });

            // ===== Business Rule: Enforce same embosser for segmented BINs =====
            // Only check against segments actually in use (assigned or pending), not available segments
            // that inherited the embosser field from the parent during auto-segmentation.
            const existingEmbosser = queryOne(
                `SELECT embosser FROM bins WHERE parent_bin = ? AND embosser IS NOT NULL AND embosser != '' AND status IN ('assigned', 'pending') LIMIT 1`,
                [seg.parent_bin]
            );
            if (existingEmbosser && existingEmbosser.embosser && existingEmbosser.embosser.toLowerCase() !== embosser.toLowerCase()) {
                return res.status(400).json({
                    error: `Este BIN ya tiene segmentos asignados con el embozador "${existingEmbosser.embosser}". No es posible cambiar el embozador.`,
                    forced_embosser: existingEmbosser.embosser
                });
            }

            proposedBin = seg.bin_number;
            proposedBinId = seg.id;
        }

        // Mark the BIN as pending — include tokenization on the BIN record
        runQuery("UPDATE bins SET status = 'pending', client = ?, tokenization = ?, embosser = ?, balance_type = ?, requested_by = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            [client, tokenization || null, embosser || null, balance_type || null, req.user.username, proposedBinId]);

        // Recalculate parent if segment
        const binRow = queryOne('SELECT parent_bin FROM bins WHERE id = ?', [proposedBinId]);
        if (binRow && binRow.parent_bin) {
            const parent = queryOne('SELECT * FROM bins WHERE bin_number = ?', [binRow.parent_bin]);
            if (parent) {
                const segs = queryAll('SELECT status FROM bins WHERE parent_bin = ?', [binRow.parent_bin]);
                const assignedCount = segs.filter(s => s.status === 'assigned' || s.status === 'pending').length;
                const total = segs.length;
                let newStatus = assignedCount === 0 ? 'available' : assignedCount >= total ? 'exhausted' : 'segmented';
                runQuery('UPDATE bins SET status = ?, updated_at = datetime("now", "localtime") WHERE bin_number = ?', [newStatus, binRow.parent_bin]);
            }
        }

        // Create request record
        const result = runQuery(
            `INSERT INTO requests (requester_id, requester_username, country, ica, ica_qmr, digits, brand, product, segment, client, tokenization, keys, embosser, bin_type, balance_type, proposed_bin, proposed_bin_id, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
            [req.user.id, req.user.username, country || null, ica || null, ica_qmr || null, dLen,
            brand || null, product || null, segment || null, client, tokenization || null, keys || null, embosser || null,
            bin_type || null, balance_type || null, proposedBin, proposedBinId, notes || null]
        );

        logAudit(req.user.id, req.user.username, 'REQUEST_CREATE', 'requests', result.lastInsertRowid, null, null, proposedBin,
            `Solicitud de BIN ${dLen} dígitos para ${client}`);

        const newRequest = queryOne('SELECT * FROM requests WHERE id = ?', [result.lastInsertRowid]);
        res.status(201).json({ ...newRequest, is_first_segmentation: isFirstSegmentation });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== PUT /api/requests/:id/approve ==========
router.put('/:id/approve', authenticateToken, requireAdmin, (req, res) => {
    try {
        const request = queryOne('SELECT * FROM requests WHERE id = ?', [parseInt(req.params.id)]);
        if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (request.status !== 'pending') return res.status(400).json({ error: 'Esta solicitud ya fue procesada' });

        // Approve: mark BIN as assigned
        runQuery(
            `UPDATE bins SET status = 'assigned', approved_by = ?, assigned_date = datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE id = ?`,
            [req.user.username, request.proposed_bin_id]
        );

        // Recalculate parent
        const bin = queryOne('SELECT parent_bin FROM bins WHERE id = ?', [request.proposed_bin_id]);
        if (bin && bin.parent_bin) {
            const segs = queryAll('SELECT status FROM bins WHERE parent_bin = ?', [bin.parent_bin]);
            const assignedCount = segs.filter(s => s.status === 'assigned' || s.status === 'pending').length;
            const total = segs.length;
            let newStatus = assignedCount === 0 ? 'available' : assignedCount >= total ? 'exhausted' : 'segmented';
            runQuery('UPDATE bins SET status = ?, updated_at = datetime("now", "localtime") WHERE bin_number = ?', [newStatus, bin.parent_bin]);
        }

        // Update request
        runQuery(
            `UPDATE requests SET status = 'approved', admin_id = ?, admin_username = ?, admin_action_date = datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE id = ?`,
            [req.user.id, req.user.username, parseInt(req.params.id)]
        );

        logAudit(req.user.id, req.user.username, 'REQUEST_APPROVE', 'requests', request.id, 'status', 'pending', 'approved',
            `BIN ${request.proposed_bin} aprobado para ${request.client}`);

        const updated = queryOne('SELECT * FROM requests WHERE id = ?', [parseInt(req.params.id)]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== PUT /api/requests/:id/reject ==========
router.put('/:id/reject', authenticateToken, requireAdmin, (req, res) => {
    try {
        const request = queryOne('SELECT * FROM requests WHERE id = ?', [parseInt(req.params.id)]);
        if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (request.status !== 'pending') return res.status(400).json({ error: 'Esta solicitud ya fue procesada' });

        // Reject: return BIN to available
        runQuery(
            `UPDATE bins SET status = 'available', client = NULL, tokenization = NULL, embosser = NULL, balance_type = NULL, requested_by = NULL, updated_at = datetime('now','localtime') WHERE id = ?`,
            [request.proposed_bin_id]
        );

        // Check if parent BIN can be unsegmented (no other segments in use)
        let can_unsegment = false;
        let parent_bin_id = null;
        const binRow = queryOne('SELECT * FROM bins WHERE id = ?', [request.proposed_bin_id]);
        if (binRow && binRow.parent_bin) {
            const parentBin = queryOne('SELECT * FROM bins WHERE bin_number = ?', [binRow.parent_bin]);
            if (parentBin) {
                // Check if all other segments are still available (none assigned/pending)
                const usedSegs = queryAll(
                    `SELECT id FROM bins WHERE parent_bin = ? AND id != ? AND (status = 'assigned' OR status = 'pending')`,
                    [binRow.parent_bin, binRow.id]
                );
                if (usedSegs.length === 0) {
                    can_unsegment = true;
                    parent_bin_id = parentBin.id;
                }
            }

            // Recalculate parent status
            const segs = queryAll('SELECT status FROM bins WHERE parent_bin = ?', [binRow.parent_bin]);
            const assignedCount = segs.filter(s => s.status === 'assigned' || s.status === 'pending').length;
            const total = segs.length;
            let newStatus = assignedCount === 0 ? 'available' : assignedCount >= total ? 'exhausted' : 'segmented';
            runQuery('UPDATE bins SET status = ?, updated_at = datetime("now", "localtime") WHERE bin_number = ?', [newStatus, binRow.parent_bin]);
        }

        // Update request
        runQuery(
            `UPDATE requests SET status = 'rejected', admin_id = ?, admin_username = ?, admin_action_date = datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE id = ?`,
            [req.user.id, req.user.username, parseInt(req.params.id)]
        );

        logAudit(req.user.id, req.user.username, 'REQUEST_REJECT', 'requests', request.id, 'status', 'pending', 'rejected',
            `BIN ${request.proposed_bin} rechazado para ${request.client}`);

        const updated = queryOne('SELECT * FROM requests WHERE id = ?', [parseInt(req.params.id)]);
        res.json({ ...updated, can_unsegment, parent_bin_id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
