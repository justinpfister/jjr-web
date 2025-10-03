const express = require('express');
const path = require('path');
const config = require('./config');
const googlePhotos = require('./services/googlePhotos');
const fs = require('fs');
const { marked } = require('marked');
const { exec } = require('child_process');
const multer = require('multer');

const app = express();
const PORT = config.port;

// Add JSON body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const mediaDir = path.join(__dirname, 'media');
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }
        cb(null, mediaDir);
    },
    filename: (req, file, cb) => {
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const ext = path.extname(file.originalname);
        const filename = `img_${timestamp}_${Date.now()}${ext}`;
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

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
                const stats = fs.statSync(full);
                const matchHtml = text.match(/<!--\s*content-name:\s*([^>]+?)\s*-->/i);
                const matchJs = text.match(/\/\/\s*content-name:\s*([^\n]+?)\s*$/im);
                const matchMd = text.match(/^\s*<!--\s*content-name:\s*([^>]+?)\s*-->\s*$/im) || text.match(/^\s*title:\s*(.+)$/im);
                const match = matchHtml || matchJs || matchMd;
                const name = (match ? match[1] : (matchMd ? matchMd[1] : file)).trim().replace(/\.(html|js|md)$/i, '');
                const href = file.toLowerCase().endsWith('.md') ? ('/content/md/' + file) : ('/content/' + file);
                // Simple date formatting
                const date = new Date(stats.mtime);
                const formatted = date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                
                items.push({ 
                    name: name, 
                    href: href, 
                    lastUpdated: stats.mtime,
                    lastUpdatedFormatted: formatted
                });
            } catch (_) { /* ignore */ }
        });
        
        // Sort by last updated (newest first)
        items.sort(function(a, b) {
            return new Date(b.lastUpdated) - new Date(a.lastUpdated);
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

// Content Management API endpoints
app.get('/api/content/list', function (req, res) {
    const contentDir = path.join(__dirname, 'content');
    try {
        const files = fs.readdirSync(contentDir);
        const contentFiles = files.filter(f => {
            const lower = f.toLowerCase();
            return lower.endsWith('.html') || lower.endsWith('.js') || lower.endsWith('.md');
        });
        
        const items = contentFiles.map(file => {
            try {
                const fullPath = path.join(contentDir, file);
                const text = fs.readFileSync(fullPath, 'utf8');
                const lower = file.toLowerCase();
                
                // Extract content name
                const matchHtml = text.match(/<!--\s*content-name:\s*([^>]+?)\s*-->/i);
                const matchJs = text.match(/\/\/\s*content-name:\s*([^\n]+?)\s*$/im);
                const matchMd = text.match(/^\s*<!--\s*content-name:\s*([^>]+?)\s*-->\s*$/im) || text.match(/^\s*title:\s*(.+)$/im);
                const match = matchHtml || matchJs || matchMd;
                const name = (match ? match[1] : file).trim().replace(/\.(html|js|md)$/i, '');
                
                return {
                    filename: file,
                    name: name,
                    type: lower.endsWith('.md') ? 'markdown' : (lower.endsWith('.js') ? 'javascript' : 'html'),
                    size: fs.statSync(fullPath).size,
                    modified: fs.statSync(fullPath).mtime
                };
            } catch (err) {
                return {
                    filename: file,
                    name: file,
                    type: 'unknown',
                    size: 0,
                    modified: new Date()
                };
            }
        });
        
        res.json({ success: true, files: items });
    } catch (err) {
        res.status(500).json({ error: 'Failed to list content files', details: err.message });
    }
});

app.get('/api/content/:filename', function (req, res) {
    const filename = req.params.filename;
    const safeFilename = filename.replace(/[^a-z0-9._-]/gi, '');
    const filePath = path.join(__dirname, 'content', safeFilename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const stats = fs.statSync(filePath);
        
        res.json({
            success: true,
            filename: safeFilename,
            content: content,
            size: stats.size,
            modified: stats.mtime
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to read file', details: err.message });
    }
});

app.post('/api/content/:filename', function (req, res) {
    const token = req.headers['x-refresh-token'] || req.query.token;
    const expectedToken = config.refreshToken;
    
    console.log('Save request received:', {
        filename: req.params.filename,
        hasToken: !!token,
        tokenMatch: token === expectedToken,
        hasContent: !!req.body.content
    });
    
    if (token !== expectedToken) {
        console.log('Token mismatch:', { received: token, expected: expectedToken });
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const filename = req.params.filename;
    const safeFilename = filename.replace(/[^a-z0-9._-]/gi, '');
    const filePath = path.join(__dirname, 'content', safeFilename);
    
    console.log('Saving file:', { original: filename, safe: safeFilename, path: filePath });
    
    try {
        // Ensure content directory exists
        const contentDir = path.join(__dirname, 'content');
        if (!fs.existsSync(contentDir)) {
            fs.mkdirSync(contentDir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, req.body.content, 'utf8');
        console.log('File saved successfully:', filePath);
        
        // Auto-commit to git (with better error handling)
        const commitMessage = `Update ${safeFilename} via content editor`;
        
        // First, try to remove any lock files
        exec('rm -f .git/index.lock', { cwd: __dirname }, function() {
            // Then try the commit
            exec(`git add content/${safeFilename} && git commit -m "${commitMessage}"`, { cwd: __dirname }, function (err, stdout, stderr) {
                if (err) {
                    console.log('Git commit failed (file still saved):', err.message);
                    // Try to set git user if that's the issue
                    if (err.message.includes('Author identity unknown')) {
                        console.log('Setting git user identity...');
                        exec('git config user.email "jjr@example.com" && git config user.name "JJR Web Editor"', { cwd: __dirname }, function() {
                            // Try commit again
                            exec(`git add content/${safeFilename} && git commit -m "${commitMessage}"`, { cwd: __dirname }, function(err2, stdout2) {
                                if (err2) {
                                    console.log('Git commit still failed after setting user:', err2.message);
                                } else {
                                    console.log('Git commit successful after setting user:', stdout2);
                                }
                            });
                        });
                    }
                } else {
                    console.log('Git commit successful:', stdout);
                }
            });
        });
        
        res.json({ success: true, message: 'File saved and committed to git' });
    } catch (err) {
        console.error('Save error:', err);
        res.status(500).json({ 
            error: 'Failed to save file', 
            details: err.message,
            filename: safeFilename,
            path: filePath
        });
    }
});

app.delete('/api/content/:filename', function (req, res) {
    const token = req.headers['x-refresh-token'] || req.query.token;
    const expectedToken = config.refreshToken;
    
    if (token !== expectedToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const filename = req.params.filename;
    const safeFilename = filename.replace(/[^a-z0-9._-]/gi, '');
    const filePath = path.join(__dirname, 'content', safeFilename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    try {
        fs.unlinkSync(filePath);
        
        // Auto-commit deletion to git
        const commitMessage = `Delete ${safeFilename} via content editor`;
        exec(`git add content/${safeFilename} && git commit -m "${commitMessage}"`, { cwd: __dirname }, function (err, stdout, stderr) {
            if (err) {
                console.log('Git commit failed (file still deleted):', err.message);
            } else {
                console.log('Git commit successful:', stdout);
            }
        });
        
        res.json({ success: true, message: 'File deleted and committed to git' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete file', details: err.message });
    }
});

// Image upload endpoint
app.post('/api/upload-image', upload.single('image'), function (req, res) {
    const token = req.headers['x-refresh-token'] || req.query.token;
    const expectedToken = config.refreshToken;
    
    if (token !== expectedToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
    }
    
    const imageUrl = `/media/${req.file.filename}`;
    const altText = req.body.alt || req.file.originalname;
    
    // Auto-commit image to git (with better error handling)
    const commitMessage = `Add image ${req.file.filename} via content editor`;
    
    // First, try to remove any lock files
    exec('rm -f .git/index.lock', { cwd: __dirname }, function() {
        // Then try the commit
        exec(`git add media/${req.file.filename} && git commit -m "${commitMessage}"`, { cwd: __dirname }, function (err, stdout, stderr) {
            if (err) {
                console.log('Git commit failed (image still uploaded):', err.message);
                // Try to set git user if that's the issue
                if (err.message.includes('Author identity unknown')) {
                    console.log('Setting git user identity...');
                    exec('git config user.email "jjr@example.com" && git config user.name "JJR Web Editor"', { cwd: __dirname }, function() {
                        // Try commit again
                        exec(`git add media/${req.file.filename} && git commit -m "${commitMessage}"`, { cwd: __dirname }, function(err2, stdout2) {
                            if (err2) {
                                console.log('Git commit still failed after setting user:', err2.message);
                            } else {
                                console.log('Git commit successful after setting user:', stdout2);
                            }
                        });
                    });
                }
            } else {
                console.log('Git commit successful:', stdout);
            }
        });
    });
    
    res.json({
        success: true,
        filename: req.file.filename,
        url: imageUrl,
        alt: altText,
        markdown: `![${altText}](${imageUrl})`,
        html: `<img src="${imageUrl}" alt="${altText}" style="max-width: 400px; cursor: pointer;" onclick="this.style.maxWidth = this.style.maxWidth === '400px' ? '100%' : '400px'">`
    });
});

// Push to GitHub endpoint
app.post('/api/push-to-github', function (req, res) {
    const token = req.headers['x-refresh-token'] || req.query.token;
    const expectedToken = config.refreshToken;
    
    if (token !== expectedToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('🚀 Pushing to GitHub...');
    
    // Send immediate response
    res.json({ 
        success: true, 
        message: 'Push to GitHub initiated',
        timestamp: new Date().toISOString(),
        note: 'Push will happen in background'
    });
    
    // Push to GitHub in background
    setTimeout(() => {
        exec('git push origin main', { cwd: __dirname }, function (err, stdout, stderr) {
            if (err) {
                console.error('❌ Git push failed:', err);
            } else {
                console.log('✅ Git push successful:', stdout);
            }
        });
    }, 1000);
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

