const express = require('express');
const { queryAll } = require('../db_connector');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit — Query audit log
router.get('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        let query = 'SELECT * FROM audit_log WHERE 1=1';
        const params = [];

        if (req.query.table_name) {
            query += ' AND table_name = ?';
            params.push(req.query.table_name);
        }
        if (req.query.user_id) {
            query += ' AND user_id = ?';
            params.push(parseInt(req.query.user_id));
        }
        if (req.query.action) {
            query += ' AND action = ?';
            params.push(req.query.action);
        }
        if (req.query.from) {
            query += ' AND created_at >= ?';
            params.push(req.query.from);
        }
        if (req.query.to) {
            query += ' AND created_at <= ?';
            params.push(req.query.to);
        }

        query += ' ORDER BY created_at DESC LIMIT 500';

        const logs = queryAll(query, params);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
