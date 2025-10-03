const express = require('express');
const path = require('path');
const config = require('./config');
const googlePhotos = require('./services/googlePhotos');
const fs = require('fs');
const { marked } = require('marked');
const { exec } = require('child_process');

const app = express();
const PORT = config.port;

// Static middleware will be registered after SSR route so SSR wins for '/' and '/index.html'

app.get('/api/health', function (req, res) {
    res.json({ ok: true, ts: Date.now() });
});

// Simple test endpoint for debugging
app.get('/api/test', function (req, res) {
    res.json({ 
        message: 'Server is working!', 
        timestamp: new Date().toISOString(),
        port: PORT,
        nodeVersion: process.version
    });
});

app.get('/api/pm2-status', function (req, res) {
    // Try multiple PM2 commands to see what works
    const commands = [
        'pm2 list --json',
        'pm2 list',
        'pm2 status',
        'which pm2',
        'pm2 --version'
    ];
    
    let currentCommandIndex = 0;
    
    function tryCommand() {
        if (currentCommandIndex >= commands.length) {
            return res.status(500).json({ 
                error: 'All PM2 commands failed', 
                details: 'PM2 may not be installed or accessible',
                suggestion: 'Try running: npm install -g pm2'
            });
        }
        
        const command = commands[currentCommandIndex];
        console.log(`Trying PM2 command: ${command}`);
        
        exec(command, function (err, stdout, stderr) {
            if (err) {
                console.log(`Command failed: ${command} - ${err.message}`);
                currentCommandIndex++;
                tryCommand();
            } else {
                console.log(`Command succeeded: ${command}`);
                
                // Try to parse as JSON if it's the json command
                if (command.includes('--json')) {
                    try {
                        const pm2Data = JSON.parse(stdout);
                        res.json({ 
                            success: true, 
                            pm2Processes: pm2Data,
                            command: command,
                            timestamp: new Date().toISOString()
                        });
                    } catch (parseErr) {
                        res.json({ 
                            success: true, 
                            pm2Output: stdout,
                            command: command,
                            parseError: parseErr.message,
                            timestamp: new Date().toISOString()
                        });
                    }
                } else {
                    res.json({ 
                        success: true, 
                        pm2Output: stdout,
                        command: command,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        });
    }
    
    tryCommand();
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

// Refresh content endpoint - pulls from GitHub and reloads PM2
app.post('/refreshcontent', function (req, res) {
    const token = req.headers['x-refresh-token'] || req.query.token;
    const expectedToken = config.refreshToken;
    
    if (token !== expectedToken) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Valid refresh token required' 
        });
    }

    console.log('🔄 Starting content refresh...');
    
    // Send immediate response to avoid 502 when PM2 reloads
    res.json({ 
        success: true, 
        message: 'Content refresh started',
        timestamp: new Date().toISOString(),
        note: 'PM2 reload will happen in background'
    });
    
    // Step 1: Git pull from origin main
    exec('git pull origin main', { cwd: __dirname }, function (err, stdout, stderr) {
        if (err) {
            console.error('❌ Git pull failed:', err);
            return;
        }
        
        console.log('✅ Git pull successful:', stdout);
        
        // Step 2: PM2 reload - try different approaches
        const pm2ProcessNames = ['jjr-web', 'jjr-api', 'server'];
        let currentProcessIndex = 0;
        let currentMethodIndex = 0;
        const methods = ['reload', 'restart', 'gracefulReload'];
        
        function tryPm2Reload() {
            if (currentProcessIndex >= pm2ProcessNames.length) {
                console.error('❌ PM2 reload failed: No matching process found');
                return;
            }
            
            if (currentMethodIndex >= methods.length) {
                currentProcessIndex++;
                currentMethodIndex = 0;
                tryPm2Reload();
                return;
            }
            
            const processName = pm2ProcessNames[currentProcessIndex];
            const method = methods[currentMethodIndex];
            const command = `pm2 ${method} ${processName}`;
            
            console.log(`🔄 Trying PM2 ${method} for process: ${processName}`);
            
            exec(command, function (err, stdout, stderr) {
                if (err) {
                    console.log(`❌ PM2 ${method} failed for ${processName}:`, err.message);
                    currentMethodIndex++;
                    tryPm2Reload();
                } else {
                    console.log(`✅ PM2 ${method} successful for ${processName}:`, stdout);
                }
            });
        }
        
        // Wait a moment before PM2 reload to ensure response was sent
        setTimeout(() => {
            tryPm2Reload();
        }, 1000);
    });
});

// Test PM2 reload endpoint for debugging
app.post('/api/test-pm2-reload', function (req, res) {
    const token = req.headers['x-refresh-token'] || req.query.token;
    const expectedToken = config.refreshToken;
    
    if (token !== expectedToken) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Valid refresh token required' 
        });
    }

    console.log('🧪 Testing PM2 reload...');
    
    // Try to reload jjr-web specifically
    exec('pm2 reload jjr-web', function (err, stdout, stderr) {
        if (err) {
            console.error('❌ PM2 reload test failed:', err);
            return res.status(500).json({ 
                error: 'PM2 reload test failed', 
                details: err.message,
                stderr: stderr,
                command: 'pm2 reload jjr-web'
            });
        }
        
        console.log('✅ PM2 reload test successful:', stdout);
        
        res.json({ 
            success: true, 
            message: 'PM2 reload test successful',
            timestamp: new Date().toISOString(),
            pm2Output: stdout,
            command: 'pm2 reload jjr-web'
        });
    });
});

// Server restart endpoint
app.post('/api/restart-server', function (req, res) {
    const token = req.headers['x-refresh-token'] || req.query.token;
    const expectedToken = config.refreshToken;
    
    if (token !== expectedToken) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Valid refresh token required' 
        });
    }

    console.log('🔄 Restarting server...');
    
    // Send immediate response to avoid 502 when PM2 restarts
    res.json({ 
        success: true, 
        message: 'Server restart initiated',
        timestamp: new Date().toISOString(),
        note: 'PM2 restart will happen in background'
    });
    
    // Try to restart the PM2 process in background
    setTimeout(() => {
        exec('pm2 restart jjr-web', function (err, stdout, stderr) {
            if (err) {
                console.error('❌ PM2 restart failed:', err);
            } else {
                console.log('✅ PM2 restart successful:', stdout);
            }
        });
    }, 1000);
});

// Alternative refresh endpoint that just does git pull without PM2
app.post('/refreshcontent-simple', function (req, res) {
    const token = req.headers['x-refresh-token'] || req.query.token;
    const expectedToken = config.refreshToken;
    
    if (token !== expectedToken) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Valid refresh token required' 
        });
    }

    console.log('🔄 Starting simple content refresh (git pull only)...');
    
    // Just do git pull - no PM2 reload
    exec('git pull origin main', { cwd: __dirname }, function (err, stdout, stderr) {
        if (err) {
            console.error('❌ Git pull failed:', err);
            return res.status(500).json({ 
                error: 'Git pull failed', 
                details: err.message,
                stderr: stderr 
            });
        }
        
        console.log('✅ Git pull successful:', stdout);
        
        res.json({ 
            success: true, 
            message: 'Content refreshed successfully (git pull only)',
            timestamp: new Date().toISOString(),
            gitOutput: stdout,
            note: 'Server restart may be needed manually'
        });
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

