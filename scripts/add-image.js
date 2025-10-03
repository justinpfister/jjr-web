const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Get image path from command line
const imagePath = process.argv[2];
const altText = process.argv[3] || 'Image';

if (!imagePath) {
    console.log('Usage: node scripts/add-image.js <image-path> [alt-text]');
    console.log('Example: node scripts/add-image.js "C:\\Users\\jjr\\Pictures\\photo.jpg" "My awesome photo"');
    process.exit(1);
}

if (!fs.existsSync(imagePath)) {
    console.error('Image file not found:', imagePath);
    process.exit(1);
}

// Generate filename with timestamp
const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const ext = path.extname(imagePath);
const filename = `img_${timestamp}_${Date.now()}${ext}`;
const mediaPath = path.join(__dirname, '..', 'media', filename);

// Copy image to media folder
fs.copyFileSync(imagePath, mediaPath);

// Generate markdown/HTML snippet
const imageUrl = `/media/${filename}`;
const markdownSnippet = `![${altText}](${imageUrl})`;
const htmlSnippet = `<img src="${imageUrl}" alt="${altText}" style="max-width: 400px; cursor: pointer;" onclick="this.style.maxWidth = this.style.maxWidth === '400px' ? '100%' : '400px'">`;

console.log('\n✅ Image added successfully!');
console.log(`📁 Saved to: ${mediaPath}`);
console.log(`🔗 URL: ${imageUrl}`);
console.log('\n📝 Copy this markdown:');
console.log(markdownSnippet);
console.log('\n📝 Or copy this HTML:');
console.log(htmlSnippet);
console.log('\n💡 Tip: The HTML version includes click-to-expand functionality!');
