const express = require('express');
const { queryAll } = require('../db_connector');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const logs = await queryAll('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500');
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
