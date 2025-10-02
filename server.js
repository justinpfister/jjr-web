const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Optional: serve static files if you ever want API + static from Node locally
// (In production, Nginx serves static files.)
app.use(express.static(path.join(__dirname)));

app.get('/api/health', function (req, res) {
    res.json({ ok: true, ts: Date.now() });
});

app.listen(PORT, function () {
    console.log('API listening on http://127.0.0.1:' + PORT);
});

