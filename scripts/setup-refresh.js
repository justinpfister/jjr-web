const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Generate a secure random token
const token = crypto.randomBytes(32).toString('hex');

console.log('🔐 Setting up content refresh...\n');

// Check if .env exists
const envPath = path.join(__dirname, '..', '.env');
const envExists = fs.existsSync(envPath);

if (envExists) {
    console.log('📄 Found existing .env file');
    
    // Read current .env
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Check if REFRESH_TOKEN already exists
    if (envContent.includes('REFRESH_TOKEN=')) {
        console.log('⚠️  REFRESH_TOKEN already exists in .env');
        console.log('   Current token:', envContent.match(/REFRESH_TOKEN=(.+)/)?.[1] || 'not found');
    } else {
        // Add REFRESH_TOKEN to .env
        envContent += `\n# Content refresh token\nREFRESH_TOKEN=${token}\n`;
        fs.writeFileSync(envPath, envContent);
        console.log('✅ Added REFRESH_TOKEN to .env');
    }
} else {
    console.log('📄 Creating new .env file');
    const envContent = `# Environment variables for JJR Web
# Content refresh token
REFRESH_TOKEN=${token}
`;
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Created .env with REFRESH_TOKEN');
}

console.log('\n🔑 Your refresh token:');
console.log(token);
console.log('\n📝 Usage:');
console.log('1. Visit: http://localhost:3000/admin.html');
console.log('2. Enter the token above');
console.log('3. Click "Refresh Content" after pushing to GitHub');
console.log('\n🔒 Security:');
console.log('- Keep this token secret');
console.log('- Change it regularly');
console.log('- Use HTTPS in production');
