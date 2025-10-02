const express = require('express');
const path = require('path');
const config = require('./config');
const googlePhotos = require('./services/googlePhotos');
const fs = require('fs');
const { marked } = require('marked');

const app = express();
const PORT = config.port;

// Static middleware will be registered after SSR route so SSR wins for '/' and '/index.html'

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
            return lower.endsWith('.html') || lower.endsWith('.js') || lower.endsWith('.md');
        });
        const items = [];
        contentFiles.forEach(function (file) {
            try {
                const full = path.join(dir, file);
                const text = fs.readFileSync(full, 'utf8');
                const matchHtml = text.match(/<!--\s*content-name:\s*([^>]+?)\s*-->/i);
                const matchJs = text.match(/\/\/\s*content-name:\s*([^\n]+?)\s*$/im);
                const matchMd = text.match(/^\s*<!--\s*content-name:\s*([^>]+?)\s*-->\s*$/im) || text.match(/^\s*title:\s*(.+)$/im);
                const match = matchHtml || matchJs || matchMd;
                const name = (match ? match[1] : (matchMd ? matchMd[1] : file)).trim().replace(/\.(html|js|md)$/i, '');
                const href = lower.endsWith('.md') ? ('/content/md/' + file) : ('/content/' + file);
                items.push({ name: name, href: href });
            } catch (_) { /* ignore */ }
        });
        res.json(items);
    });
});

// Helper to list content files (html, js, md)
function listContentItems() {
    const dir = path.join(__dirname, 'content');
    try {
        const files = fs.readdirSync(dir);
        const contentFiles = files.filter(function (f) {
            const lower = f.toLowerCase();
            return lower.endsWith('.html') || lower.endsWith('.js') || lower.endsWith('.md');
        });
        const items = [];
        contentFiles.forEach(function (file) {
            try {
                const full = path.join(dir, file);
                const text = fs.readFileSync(full, 'utf8');
                const lower = file.toLowerCase();
                const matchHtml = text.match(/<!--\s*content-name:\s*([^>]+?)\s*-->/i);
                const matchJs = text.match(/\/\/\s*content-name:\s*([^\n]+?)\s*$/im);
                const matchMd = text.match(/^\s*<!--\s*content-name:\s*([^>]+?)\s*-->\s*$/im) || text.match(/^\s*title:\s*(.+)$/im);
                const match = matchHtml || matchJs || matchMd;
                const name = (match ? match[1] : file).trim().replace(/\.(html|js|md)$/i, '');
                const href = lower.endsWith('.md') ? ('/content/md/' + file) : ('/content/' + file);
                items.push({ name: name, href: href });
            } catch (_) { /* ignore */ }
        });
        return items;
    } catch (_) {
        return [];
    }
}

// Server-side rendered homepage (and /index.html)
app.get(['/', '/index.html'], async function (req, res) {
    const items = listContentItems();
    const header = fs.readFileSync(path.join(__dirname, 'partials', 'header.html'), 'utf8');
    const footer = fs.readFileSync(path.join(__dirname, 'partials', 'footer.html'), 'utf8');
    const listHtml = items.slice(0, 20).map(function (it) {
        return '<li><a href="' + it.href + '">' + it.name + '</a></li>'; 
    }).join('');
    const page = (
`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JJR</title>
    <link rel="stylesheet" href="/assets/css/styles.css">
</head>
<body>
    ${header}
    <main class="app-main">
        <section class="hero">
            <h2 class="page-title">Notes, projects and other good stuff</h2>
            <p class="lead">A place JJR to drop updates, links, photos and ideas.</p>
        </section>
        <section>
            <h3 class="section-title">Latest</h3>
            <ul class="list">${listHtml}</ul>
        </section>
    </main>
    ${footer}
</body>
</html>`
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(page);
});

app.get('/content/md/:file', function (req, res) {
    const file = req.params.file;
    const safe = file.replace(/[^a-z0-9._-]/gi, '');
    const full = path.join(__dirname, 'content', safe);
    if (!full.toLowerCase().endsWith('.md')) return res.status(400).send('Bad request');
    fs.readFile(full, 'utf8', function (err, text) {
        if (err) return res.status(404).send('Not found');
        const html = marked.parse(text);
        const page = (
`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Content</title>
    <link rel="stylesheet" href="/assets/css/styles.css">
    <script src="/assets/js/layout.js" defer></script>
</head>
<body>
    <header data-include></header>
    <main class="app-main">
        <article>
            ${html}
        </article>
    </main>
    <footer data-include></footer>
</body>
</html>`
        );
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(page);
    });
});

// Finally serve static files for everything else
app.use(express.static(path.join(__dirname)));

app.listen(PORT, '0.0.0.0', function () {
    console.log('API listening on http://0.0.0.0:' + PORT + ' (reachable via localhost on Windows)');
});

// Gallery route: lists images under /media recursively
app.get('/gallery', function (req, res) {
    function walk(dir) {
        const out = [];
        try {
            fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) out.push.apply(out, walk(full));
                else out.push(full);
            });
        } catch (_) { /* ignore */ }
        return out;
    }

    const root = path.join(__dirname, 'media');
    const files = walk(root).filter(function (f) { return /\.(jpg|jpeg|png|webp|gif)$/i.test(f); });
    const toHref = function (abs) { return abs.replace(__dirname.replace(/\\/g, '/'), '').replace(/\\/g, '/'); };
    const items = files.map(function (f) { return toHref(f); });

    const header = fs.readFileSync(path.join(__dirname, 'partials', 'header.html'), 'utf8');
    const footer = fs.readFileSync(path.join(__dirname, 'partials', 'footer.html'), 'utf8');
    const grid = items.map(function (src) { return '<a href="' + src + '" target="_blank" rel="noopener"><img src="' + src + '" loading="lazy" alt="media"></a>'; }).join('');
    const page = (
`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gallery</title>
    <link rel="stylesheet" href="/assets/css/styles.css">
</head>
<body>
    ${header}
    <main class="app-main">
        <h2 class="page-title">Gallery</h2>
        <div class="gallery-grid">${grid}</div>
    </main>
    ${footer}
</body>
</html>`
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(page);
});

