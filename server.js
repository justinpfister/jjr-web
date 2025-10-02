const express = require('express');
const path = require('path');
const config = require('./config');
const googlePhotos = require('./services/googlePhotos');
const fs = require('fs');

const app = express();
const PORT = config.port;

// Optional: serve static files if you ever want API + static from Node locally
// (In production, Nginx serves static files.)
app.use(express.static(path.join(__dirname)));

app.get('/api/health', function (req, res) {
    res.json({ ok: true, ts: Date.now() });
});

app.get('/api/latest-photo', async function (req, res) {
    try {
        const photo = await googlePhotos.getLatestPhoto();
        if (!photo) return res.status(204).end();
        res.json(photo);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load latest photo' });
    }
});

app.get('/api/content', function (req, res) {
    const dir = path.join(__dirname, 'content');
    fs.readdir(dir, function (err, files) {
        if (err) return res.json([]);
        const contentFiles = files.filter(function (f) {
            const lower = f.toLowerCase();
            return lower.endsWith('.html') || lower.endsWith('.js');
        });
        const items = [];
        contentFiles.forEach(function (file) {
            try {
                const full = path.join(dir, file);
                const text = fs.readFileSync(full, 'utf8');
                const matchHtml = text.match(/<!--\s*content-name:\s*([^>]+?)\s*-->/i);
                const matchJs = text.match(/\/\/\s*content-name:\s*([^\n]+?)\s*$/im);
                const match = matchHtml || matchJs;
                const name = match ? match[1].trim() : file.replace(/\.(html|js)$/i, '');
                items.push({ name: name, href: '/content/' + file });
            } catch (_) { /* ignore */ }
        });
        res.json(items);
    });
});

app.listen(PORT, function () {
    console.log('API listening on http://127.0.0.1:' + PORT);
});

