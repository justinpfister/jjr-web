const { exec, spawn } = require('child_process');
const os = require('os');

const PORT = 3000;

function killProcessOnPort(port) {
    return new Promise((resolve) => {
        const platform = os.platform();
        
        if (platform === 'win32') {
            // Windows: Use netstat and taskkill
            exec(`netstat -aon | findstr :${port}`, (error, stdout) => {
                if (error) {
                    console.log('No processes found on port', port);
                    resolve();
                    return;
                }
                
                const lines = stdout.trim().split('\n');
                const pids = new Set();
                
                lines.forEach(line => {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 5) {
                        const pid = parts[parts.length - 1];
                        if (pid && pid !== '0') {
                            pids.add(pid);
                        }
                    }
                });
                
                if (pids.size === 0) {
                    console.log('No processes found on port', port);
                    resolve();
                    return;
                }
                
                console.log(`Killing processes on port ${port}:`, Array.from(pids).join(', '));
                
                let completed = 0;
                pids.forEach(pid => {
                    exec(`taskkill /F /PID ${pid}`, (err) => {
                        if (err) {
                            console.log(`Failed to kill process ${pid}:`, err.message);
                        } else {
                            console.log(`Killed process ${pid}`);
                        }
                        completed++;
                        if (completed === pids.size) {
                            resolve();
                        }
                    });
                });
            });
        } else {
            // Unix/Linux/WSL: Use lsof
            exec(`lsof -ti:${port}`, (error, stdout) => {
                if (error) {
                    console.log('No processes found on port', port);
                    resolve();
                    return;
                }
                
                const pids = stdout.trim().split('\n').filter(pid => pid);
                if (pids.length === 0) {
                    console.log('No processes found on port', port);
                    resolve();
                    return;
                }
                
                console.log(`Killing processes on port ${port}:`, pids.join(', '));
                
                let completed = 0;
                pids.forEach(pid => {
                    exec(`kill -9 ${pid}`, (err) => {
                        if (err) {
                            console.log(`Failed to kill process ${pid}:`, err.message);
                        } else {
                            console.log(`Killed process ${pid}`);
                        }
                        completed++;
                        if (completed === pids.size) {
                            resolve();
                        }
                    });
                });
            });
        }
    });
}

async function resetServer() {
    console.log('Resetting server...');
    
    // Kill processes on port 3000
    await killProcessOnPort(PORT);
    
    // Wait a moment for processes to fully terminate
    console.log('Waiting for processes to terminate...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start the server
    console.log('Starting server...');
    const server = spawn('npm', ['run', 'api'], {
        stdio: 'inherit',
        shell: true
    });
    
    server.on('error', (err) => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });
    
    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
        console.log('\nShutting down server...');
        server.kill('SIGINT');
        process.exit(0);
    });
}

resetServer().catch(console.error);
