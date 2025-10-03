let currentFile = null;
let currentContent = '';
let autoSaveTimeout = null;

const tokenInput = document.getElementById('tokenInput');
const fileList = document.getElementById('fileList');
const editor = document.getElementById('editor');
const welcome = document.getElementById('welcome');
const editorTitle = document.getElementById('editorTitle');
const contentEditor = document.getElementById('contentEditor');
const status = document.getElementById('status');
const uploadArea = document.getElementById('uploadArea');
const imageInput = document.getElementById('imageInput');

function showStatus(message, type) {
    type = type || 'info';
    status.innerHTML = '<div class="status ' + type + '">' + message + '</div>';
    setTimeout(() => {
        status.innerHTML = '';
    }, 5000);
}

function getToken() {
    const token = tokenInput.value.trim();
    if (!token) {
        showStatus('Please enter a refresh token', 'error');
        return null;
    }
    return token;
}

async function loadFileList() {
    try {
        const response = await fetch('/api/content/list');
        const data = await response.json();
        
        if (data.success) {
            fileList.innerHTML = '';
            data.files.forEach(function(file) {
                const li = document.createElement('li');
                li.className = 'file-item';
                li.innerHTML = '<div class="file-name">' + file.name + '</div>' +
                              '<div class="file-actions">' +
                              '<button class="btn small danger" onclick="deleteFile(\'' + file.filename + '\')">🗑️</button>' +
                              '</div>';
                li.addEventListener('click', function(e) {
                    if (e.target.tagName !== 'BUTTON') {
                        loadFile(file.filename);
                    }
                });
                fileList.appendChild(li);
            });
        } else {
            showStatus('Failed to load file list: ' + data.error, 'error');
        }
    } catch (error) {
        showStatus('Error loading files: ' + error.message, 'error');
    }
}

async function loadFile(filename) {
    const token = getToken();
    if (!token) return;
    
    try {
        const response = await fetch('/api/content/' + filename);
        const data = await response.json();
        
        if (data.success) {
            currentFile = filename;
            currentContent = data.content;
            contentEditor.value = data.content;
            editorTitle.textContent = data.filename;
            
            document.querySelectorAll('.file-item').forEach(item => {
                item.classList.remove('active');
            });
            const activeItem = Array.from(document.querySelectorAll('.file-item')).find(item => {
                return item.querySelector('.file-name').textContent === filename;
            });
            if (activeItem) {
                activeItem.classList.add('active');
            }
            
            welcome.classList.remove('active');
            editor.classList.add('active');
        } else {
            showStatus('Failed to load file: ' + data.error, 'error');
        }
    } catch (error) {
        showStatus('Error loading file: ' + error.message, 'error');
    }
}

async function saveFile() {
    if (!currentFile) {
        showStatus('No file selected to save', 'error');
        return;
    }
    
    const token = getToken();
    if (!token) return;
    
    const content = contentEditor.value;
    
    try {
        const response = await fetch('/api/content/' + currentFile, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Refresh-Token': token
            },
            body: JSON.stringify({ content: content })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentContent = content;
            showStatus('File saved and committed to git!', 'success');
            loadFileList();
        } else {
            showStatus('Save failed: ' + data.error, 'error');
        }
    } catch (error) {
        showStatus('Error saving file: ' + error.message, 'error');
    }
}

async function deleteFile(filename) {
    if (!confirm('Are you sure you want to delete "' + filename + '"? This cannot be undone.')) {
        return;
    }
    
    const token = getToken();
    if (!token) return;
    
    try {
        const response = await fetch('/api/content/' + filename, {
            method: 'DELETE',
            headers: {
                'X-Refresh-Token': token
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus('File deleted successfully', 'success');
            if (currentFile === filename) {
                closeEditor();
            }
            loadFileList();
        } else {
            showStatus('Delete failed: ' + data.error, 'error');
        }
    } catch (error) {
        showStatus('Error deleting file: ' + error.message, 'error');
    }
}

function createNewFile() {
    const filename = prompt('Enter filename (e.g., my-page.md, my-page.html):');
    if (!filename) return;
    
    if (!filename.match(/^[a-zA-Z0-9._-]+$/)) {
        showStatus('Invalid filename. Use only letters, numbers, dots, hyphens, and underscores.', 'error');
        return;
    }
    
    let finalFilename = filename;
    if (!filename.includes('.')) {
        finalFilename = filename + '.md';
    }
    
    const existingFiles = Array.from(fileList.children).map(li => {
        const nameDiv = li.querySelector('.file-name');
        return nameDiv ? nameDiv.textContent : '';
    });
    
    if (existingFiles.includes(finalFilename)) {
        showStatus('File already exists. Please choose a different name.', 'error');
        return;
    }
    
    currentFile = finalFilename;
    currentContent = '';
    
    const ext = finalFilename.split('.').pop().toLowerCase();
    let defaultContent = '';
    
    if (ext === 'md') {
        const baseName = finalFilename.replace(/\.[^/.]+$/, "");
        const displayName = baseName.replace(/[-_]/g, ' ');
        defaultContent = '<!-- content-name: ' + baseName + ' -->\n\n' +
            '# ' + displayName + '\n\n' +
            'Start writing your content here...\n\n' +
            '## Features\n' +
            '- Write in Markdown\n' +
            '- Add images by dragging and dropping\n' +
            '- Auto-saves to git\n\n' +
            'Happy writing! 🎉';
    } else if (ext === 'html') {
        const baseName = finalFilename.replace(/\.[^/.]+$/, "");
        const displayName = baseName.replace(/[-_]/g, ' ');
        defaultContent = '<!DOCTYPE html>\n' +
            '<!-- content-name: ' + baseName + ' -->\n' +
            '<html lang="en">\n' +
            '<head>\n' +
            '    <meta charset="UTF-8">\n' +
            '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
            '    <title>' + displayName + '</title>\n' +
            '    <link rel="stylesheet" href="../assets/css/styles.css">\n' +
            '    <script src="../assets/js/layout.js" defer></script>\n' +
            '</head>\n' +
            '<body>\n' +
            '    <header data-include></header>\n' +
            '    <main class="app-main">\n' +
            '        <article>\n' +
            '            <h1>' + displayName + '</h1>\n' +
            '            <p>Start writing your content here...</p>\n' +
            '        </article>\n' +
            '    </main>\n' +
            '    <footer data-include></footer>\n' +
            '</body>\n' +
            '</html>';
    } else if (ext === 'js') {
        const baseName = finalFilename.replace(/\.[^/.]+$/, "");
        defaultContent = '// content-name: ' + baseName + '\n\n' +
            '// Your JavaScript content here\n' +
            'console.log(\'Hello from ' + finalFilename + '!\');';
    } else {
        const baseName = finalFilename.replace(/\.[^/.]+$/, "");
        defaultContent = '<!-- content-name: ' + baseName + ' -->\n\n' +
            'Start writing your content here...';
    }
    
    contentEditor.value = defaultContent;
    editorTitle.textContent = finalFilename;
    
    welcome.classList.remove('active');
    editor.classList.add('active');
    
    document.querySelectorAll('.file-item').forEach(item => {
        item.classList.remove('active');
    });
    
    showStatus('New file "' + finalFilename + '" created. Click Save to create the file.', 'info');
}

function closeEditor() {
    currentFile = null;
    currentContent = '';
    contentEditor.value = '';
    editor.classList.remove('active');
    welcome.classList.add('active');
    
    document.querySelectorAll('.file-item').forEach(item => {
        item.classList.remove('active');
    });
}

async function uploadImage(file) {
    const token = getToken();
    if (!token) return;
    
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        showStatus('Uploading image...', 'info');
        
        const response = await fetch('/api/upload-image', {
            method: 'POST',
            headers: {
                'X-Refresh-Token': token
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            const imageMarkdown = '![' + data.filename + '](../media/' + data.filename + ')';
            const imageHtml = '<img src="../media/' + data.filename + '" alt="' + data.filename + '" style="max-width: 100%; height: auto;" />';
            
            const currentPos = contentEditor.selectionStart;
            const currentContent = contentEditor.value;
            const beforeCursor = currentContent.substring(0, currentPos);
            const afterCursor = currentContent.substring(currentPos);
            
            const ext = currentFile ? currentFile.split('.').pop().toLowerCase() : 'md';
            const imageCode = ext === 'html' ? imageHtml : imageMarkdown;
            
            contentEditor.value = beforeCursor + imageCode + afterCursor;
            
            showStatus('Image uploaded and inserted!', 'success');
        } else {
            showStatus('Upload failed: ' + data.error, 'error');
        }
    } catch (error) {
        showStatus('Error uploading image: ' + error.message, 'error');
    }
}

async function pushToGitHub() {
    const token = getToken();
    if (!token) return;
    
    try {
        showStatus('Pushing to GitHub...', 'info');
        
        const response = await fetch('/api/push-to-github', {
            method: 'POST',
            headers: {
                'X-Refresh-Token': token
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus('Successfully pushed to GitHub!', 'success');
        } else {
            showStatus('Push failed: ' + data.error, 'error');
        }
    } catch (error) {
        showStatus('Error pushing to GitHub: ' + error.message, 'error');
    }
}

// Event listeners
document.getElementById('newFileBtn').addEventListener('click', createNewFile);
document.getElementById('refreshListBtn').addEventListener('click', loadFileList);
document.getElementById('saveBtn').addEventListener('click', saveFile);
document.getElementById('closeBtn').addEventListener('click', closeEditor);
document.getElementById('pushBtn').addEventListener('click', pushToGitHub);

// Upload area events
uploadArea.addEventListener('click', () => imageInput.click());
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    if (files.length > 0) {
        uploadImage(files[0]);
    }
});

imageInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        uploadImage(e.target.files[0]);
    }
});

// Auto-save functionality
contentEditor.addEventListener('input', function() {
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }
    
    autoSaveTimeout = setTimeout(() => {
        if (currentFile && contentEditor.value !== currentContent) {
            saveFile();
        }
    }, 2000);
});

// Load file list on page load
loadFileList();
