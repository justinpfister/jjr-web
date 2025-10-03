const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const mediaDir = path.join(__dirname, '..', 'media');
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

// Upload endpoint
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
    }

    const imageUrl = `/media/${req.file.filename}`;
    const altText = req.body.alt || req.file.originalname;

    res.json({
        success: true,
        filename: req.file.filename,
        url: imageUrl,
        alt: altText,
        markdown: `![${altText}](${imageUrl})`,
        html: `<img src="${imageUrl}" alt="${altText}" style="max-width: 400px; cursor: pointer;" onclick="this.style.maxWidth = this.style.maxWidth === '400px' ? '100%' : '400px'">`
    });
});

// List images endpoint
app.get('/images', (req, res) => {
    const mediaDir = path.join(__dirname, '..', 'media');
    try {
        const files = fs.readdirSync(mediaDir)
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => ({
                filename: file,
                url: `/media/${file}`,
                path: path.join(mediaDir, file)
            }));
        res.json(files);
    } catch (error) {
        res.status(500).json({ error: 'Failed to list images' });
    }
});

app.listen(PORT, () => {
    console.log(`Image API running on http://localhost:${PORT}`);
    console.log('Upload endpoint: POST /upload');
    console.log('List endpoint: GET /images');
});
