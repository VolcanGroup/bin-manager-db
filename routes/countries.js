const express = require('express');
const { queryAll, queryOne, runQuery, logAudit } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/countries — List all countries
router.get('/', authenticateToken, (req, res) => {
    try {
        const countries = queryAll('SELECT * FROM countries ORDER BY name ASC');
        res.json(countries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/countries — Add a new country (admin only)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre del país es requerido' });

        const existing = queryOne('SELECT id FROM countries WHERE name = ?', [name.trim()]);
        if (existing) return res.status(409).json({ error: 'Este país ya existe' });

        const result = runQuery('INSERT INTO countries (name) VALUES (?)', [name.trim()]);
        logAudit(req.user.id, req.user.username, 'CREATE', 'countries', result.lastInsertRowid, null, null, name.trim(), 'País agregado');
        res.status(201).json({ id: result.lastInsertRowid, name: name.trim() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/countries/:id — Remove a country (admin only)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const country = queryOne('SELECT * FROM countries WHERE id = ?', [parseInt(req.params.id)]);
        if (!country) return res.status(404).json({ error: 'País no encontrado' });

        runQuery('DELETE FROM countries WHERE id = ?', [parseInt(req.params.id)]);
        logAudit(req.user.id, req.user.username, 'DELETE', 'countries', country.id, null, country.name, null, 'País eliminado');
        res.json({ message: 'País eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
