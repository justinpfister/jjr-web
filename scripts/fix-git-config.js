const { exec } = require('child_process');
const path = require('path');

console.log('🔧 Fixing Git Configuration...\n');

// Set git user identity
const commands = [
    'git config user.email "jjr@example.com"',
    'git config user.name "JJR Web Editor"',
    'rm -f .git/index.lock',
    'git status'
];

let currentCommand = 0;

function runNextCommand() {
    if (currentCommand >= commands.length) {
        console.log('\n✅ Git configuration fixed!');
        console.log('You can now use the content editor with automatic git commits.');
        return;
    }
    
    const command = commands[currentCommand];
    console.log(`Running: ${command}`);
    
    exec(command, { cwd: __dirname }, function (err, stdout, stderr) {
        if (err) {
            console.log(`❌ Command failed: ${err.message}`);
        } else {
            console.log(`✅ Success: ${stdout || 'Command completed'}`);
        }
        
        currentCommand++;
        runNextCommand();
    });
}

runNextCommand();
