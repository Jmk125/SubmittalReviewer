let submittalContext = "";
let specContext = "";

document.addEventListener('DOMContentLoaded', () => {
    // Existing DOMContentLoaded code...
    
    // Load saved model preference
    const savedModel = localStorage.getItem('openai_model');
    if (savedModel) {
        document.getElementById('modelSelect').value = savedModel;
    }
});

function saveModelPreference() {
    const modelSelect = document.getElementById('modelSelect');
    localStorage.setItem('openai_model', modelSelect.value);
    alert('Model preference saved!');
}

document.addEventListener('DOMContentLoaded', () => {
    // Check for saved API key
    const savedApiKey = localStorage.getItem('openai_api_key');
    if (savedApiKey) {
        document.getElementById('apiKey').value = savedApiKey;
    }

    // Setup drag and drop zones
    setupDragAndDrop('submittalZone', 'submittalFile', 'submittalInfo');
    setupDragAndDrop('specZone', 'specFile', 'specInfo');

    // Check if both files are uploaded to enable analyze button
    checkFiles();
});

function saveApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (apiKey) {
        localStorage.setItem('openai_api_key', apiKey);
        alert('API Key saved successfully!');
    } else {
        alert('Please enter an API Key');
    }
}

function setupDragAndDrop(zoneId, fileInputId, infoId) {
    const dropZone = document.getElementById(zoneId);
    const fileInput = document.getElementById(fileInputId);
    const fileInfo = document.getElementById(infoId);

    // Click to upload
    dropZone.querySelector('.browse-btn').addEventListener('click', () => {
        fileInput.click();
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        handleFile(e.target.files[0], fileInfo);
    });

    // Drag and drop events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file.type === 'application/pdf') {
            fileInput.files = e.dataTransfer.files;
            handleFile(file, fileInfo);
        } else {
            alert('Please upload a PDF file');
        }
    });
}

function handleFile(file, fileInfo) {
    if (file) {
        fileInfo.textContent = `Selected: ${file.name}`;
        checkFiles();
    }
}

function checkFiles() {
    const submittalFile = document.getElementById('submittalFile').files[0];
    const specFile = document.getElementById('specFile').files[0];
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    analyzeBtn.disabled = !(submittalFile && specFile);
}

document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) {
        alert('Please enter an OpenAI API key');
        return;
    }

    const submittalFile = document.getElementById('submittalFile').files[0];
    const specFile = document.getElementById('specFile').files[0];
    const selectedModel = document.getElementById('modelSelect').value;

    const loading = document.getElementById('loading');
    const reviewContent = document.getElementById('reviewContent');
    
    loading.style.display = 'block';
    reviewContent.textContent = '';

    const formData = new FormData();
    formData.append('submittal', submittalFile);
    formData.append('spec', specFile);
    formData.append('api_key', apiKey);
    formData.append('model', selectedModel);  // Add model to form data

    try {
        const formData = new FormData();
        formData.append('submittal', submittalFile);
        formData.append('spec', specFile);
        formData.append('api_key', apiKey);

        const response = await fetch('http://localhost:5000/analyze', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        loading.style.display = 'none';

        if (result.error) {
            reviewContent.textContent = `Error: ${result.error}`;
        } else {
            reviewContent.innerHTML = `
                <h3>Submittal Content Type:</h3>
                <p>${result.content_type}</p>
        
                <h3>Compliance Review:</h3>
                <p>${result.review}</p>
        
                <h3>Additional Submittals Required:</h3>
                <p>${result.missing_items}</p>
        
                <h3>Recommendation:</h3>
                <p>${result.recommendation}</p>
            `;
            // Store the context and show chat container
            submittalContext = result.submittalText;
            specContext = result.specText;
            document.getElementById('chatContainer').style.display = 'block';
        }
    } catch (error) {
        loading.style.display = 'none';
        reviewContent.textContent = `Error: ${error.message}`;
    }
});

// Add chat functionality
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChat = document.getElementById('sendChat');

function addMessage(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isUser ? 'user-message' : 'assistant-message'}`;
    
    const timestamp = new Date().toLocaleTimeString();
    
    messageDiv.innerHTML = `
        ${content}
        <div class="message-time">${timestamp}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) {
        alert('Please enter an OpenAI API key');
        return;
    }

    const selectedModel = document.getElementById('modelSelect').value;

    addMessage(message, true);
    chatInput.value = '';
    
    try {
        const response = await fetch('http://localhost:5000/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                submittal_context: submittalContext,
                spec_context: specContext,
                api_key: apiKey,
                model: selectedModel  // Add model to request
            })
        });

        const result = await response.json();
        if (result.error) {
            addMessage(`Error: ${result.error}`);
        } else {
            addMessage(result.response);
        }
    } catch (error) {
        addMessage(`Error: ${error.message}`);
    }
}

sendChat.addEventListener('click', sendChatMessage);

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});