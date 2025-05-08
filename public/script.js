// DOM Elements
const submittalInput = document.getElementById('submittal');
const specFileInput = document.getElementById('spec-file');
const uploadSpecBtn = document.getElementById('upload-spec');
const browseSpecsBtn = document.getElementById('browse-specs');
const specDropdown = document.getElementById('spec-dropdown');
const submittalPreview = document.getElementById('submittal-preview');
const specPreview = document.getElementById('spec-preview');
const analyzeBtn = document.getElementById('analyze-button');
const apiKeyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key');
const resultsDiv = document.getElementById('results');
const loadingDiv = document.getElementById('loading');
const modelDropdown = document.getElementById('model-dropdown');

// State variables
let submittalFile = null;
let specFile = null;
let apiKey = localStorage.getItem('openai_api_key') || '';
let selectedModel = localStorage.getItem('selected_model') || 'gpt-4o';

// Initialize
if (apiKey) {
    apiKeyInput.value = '••••••••••••••••••••••••••••••';
}

// Event listeners
submittalInput.addEventListener('change', handleSubmittalUpload);
specFileInput.addEventListener('change', handleSpecFileUpload);
uploadSpecBtn.addEventListener('click', () => specFileInput.click());
browseSpecsBtn.addEventListener('click', loadSpecsFromFolder);
saveKeyBtn.addEventListener('click', saveApiKey);
analyzeBtn.addEventListener('click', analyzeCompliance);
modelDropdown.addEventListener('change', handleModelChange);

// Check if running in Electron (for local file access)
const isElectron = () => {
    return navigator.userAgent.indexOf('Electron') >= 0;
};

// Function to handle model change
function handleModelChange() {
    selectedModel = modelDropdown.value;
    localStorage.setItem('selected_model', selectedModel);
}

// Function to handle submittal upload
function handleSubmittalUpload(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        submittalFile = file;
        submittalPreview.textContent = `Selected: ${file.name}`;
        checkEnableAnalyze();
    } else {
        alert('Please select a PDF file');
        submittalInput.value = '';
        submittalPreview.textContent = '';
        submittalFile = null;
    }
}

// Function to handle spec file upload
function handleSpecFileUpload(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        specFile = file;
        specPreview.textContent = `Selected: ${file.name}`;
        checkEnableAnalyze();
    } else {
        alert('Please select a PDF file');
        specFileInput.value = '';
        specPreview.textContent = '';
        specFile = null;
    }
}

// Function to load specs from a local folder
function loadSpecsFromFolder() {
    if (isElectron()) {
        // Electron implementation for folder access
        window.api.selectFolder().then(files => {
            if (files && files.length > 0) {
                populateSpecDropdown(files);
            }
        });
    } else {
        // Web implementation - show a message that this requires the desktop app
        alert('Browsing local folders requires running the desktop version of this application. Please use the "Upload Spec" option instead.');
    }
}

// Function to populate spec dropdown
function populateSpecDropdown(files) {
    specDropdown.innerHTML = '';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.text = 'Select a specification...';
    defaultOption.value = '';
    specDropdown.add(defaultOption);
    
    // Add spec files to dropdown
    files.forEach(file => {
        if (file.name.endsWith('.pdf')) {
            const option = document.createElement('option');
            option.text = file.name;
            option.value = file.path;
            specDropdown.add(option);
        }
    });
    
    specDropdown.style.display = 'block';
    specDropdown.addEventListener('change', handleSpecSelection);
}

// Function to handle spec selection from dropdown
function handleSpecSelection(e) {
    const selectedPath = e.target.value;
    if (selectedPath) {
        if (isElectron()) {
            // In Electron, we can load the file directly
            window.api.getFileFromPath(selectedPath).then(fileData => {
                specFile = new File([fileData], selectedPath.split('/').pop() || selectedPath.split('\\').pop());
                specPreview.textContent = `Selected: ${specFile.name}`;
                checkEnableAnalyze();
            });
        }
    } else {
        specFile = null;
        specPreview.textContent = '';
    }
}

// Function to save API key
function saveApiKey() {
    const key = apiKeyInput.value;
    if (key && key !== '••••••••••••••••••••••••••••••') {
        localStorage.setItem('openai_api_key', key);
        apiKey = key;
        apiKeyInput.value = '••••••••••••••••••••••••••••••';
        alert('API key saved successfully!');
    } else if (!key) {
        localStorage.removeItem('openai_api_key');
        apiKey = '';
        alert('API key removed');
    }
}

// Function to check if analyze button should be enabled
function checkEnableAnalyze() {
    if (submittalFile && specFile && apiKey) {
        analyzeBtn.disabled = false;
    } else {
        analyzeBtn.disabled = true;
    }
}

// Function to analyze compliance
async function analyzeCompliance() {
    if (!submittalFile || !specFile) {
        alert('Please select both a submittal and a specification file.');
        return;
    }
    
    if (!apiKey) {
        alert('Please enter your OpenAI API key.');
        return;
    }
    
    // Show loading state
    loadingDiv.style.display = 'block';
    resultsDiv.textContent = '';
    analyzeBtn.disabled = true;
    
    try {
        const formData = new FormData();
        formData.append('submittal', submittalFile);
        formData.append('spec', specFile);
        
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'X-API-KEY': apiKey,
                'X-MODEL-ID': selectedModel
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        
        // Format the JSON response into HTML
        resultsDiv.innerHTML = formatJsonResults(data.analysis);
        showPrintButton();
    } catch (error) {
        resultsDiv.textContent = `Error: ${error.message}`;
    } finally {
        loadingDiv.style.display = 'none';
        analyzeBtn.disabled = false;
    }
}

// NEW: Function to format JSON results into HTML
function formatJsonResults(jsonText) {
    try {
        // Parse the JSON response
        const data = JSON.parse(jsonText);
        
        // Create HTML structure
        let html = '<div class="compliance-report">';
        
        // Add header
        html += `<div class="report-header">
            <h2>Submittal Compliance Analysis</h2>
            <div class="report-meta">
                <span>Generated: ${new Date().toLocaleString()}</span>
                <span>Reviewer: AI-Assisted Review</span>
            </div>
        </div>`;
        
        // Add submittal summary
        html += `<div class="summary-card">
            <div class="card-header">
                <h3><span class="material-icon">📋</span> Submittal Summary</h3>
            </div>
            <div class="card-content">
                ${formatBulletPoints(data.submittalSummary)}
            </div>
        </div>`;
        
        // Add applicable specifications
        html += `<div class="specs-card">
            <div class="card-header">
                <h3><span class="material-icon">📑</span> Applicable Specifications</h3>
            </div>
            <div class="card-content">
                ${formatBulletPoints(data.applicableSpecs)}
            </div>
        </div>`;
        
        // Add compliance assessment table
        html += `<div class="compliance-card">
            <div class="card-header">
                <h3><span class="material-icon">✓</span> Compliance Assessment</h3>
            </div>
            <div class="card-content">
                ${createComplianceTable(data.complianceAssessment)}
            </div>
        </div>`;
        
        // Add critical issues
        html += `<div class="issues-card">
            <div class="card-header alert-header">
                <h3><span class="material-icon">⚠️</span> Critical Issues</h3>
            </div>
            <div class="card-content">
                ${formatBulletPoints(data.criticalIssues)}
            </div>
        </div>`;
        
        // Add recommendations with status banner
        let statusClass = 'neutral';
        let statusIcon = '📋';
        let statusText = data.recommendation.decision;
        
        // Set appropriate classes for status banner
        if (statusText.includes('APPROVE WITH COMMENTS')) {
            statusClass = 'partial';
            statusIcon = '⚠️';
        } else if (statusText.includes('REVISE AND RESUBMIT')) {
            statusClass = 'warning';
            statusIcon = '⚠️';
        } else if (statusText.includes('REJECTED')) {
            statusClass = 'danger';
            statusIcon = '❌';
        } else if (statusText.includes('APPROVE')) {
            statusClass = 'success';
            statusIcon = '✅';
        }
        
        // Create status banner
        html += `<div class="status-banner ${statusClass}">
            <span class="status-icon">${statusIcon}</span>
            <span class="status-text">${statusText}</span>
        </div>`;
        
        // Add recommendation details
        html += `<div class="recommendations-card">
            <div class="card-header">
                <h3><span class="material-icon">🔍</span> Recommendations</h3>
            </div>
            <div class="card-content">
                ${formatBulletPoints(data.recommendation.comments)}
            </div>
        </div>`;
        
        html += '</div>'; // Close compliance-report div
        
        return html;
    } catch (error) {
        // If JSON parsing fails, display the raw text
        console.error('Error parsing JSON:', error);
        return `<div class="error-message">Error formatting results: ${error.message}</div>
                <pre>${jsonText}</pre>`;
    }
}

// Helper function to create a compliance table from JSON data
function createComplianceTable(complianceData) {
    if (!Array.isArray(complianceData) || complianceData.length === 0) {
        return '<p>No compliance data available</p>';
    }
    
    let html = '<table class="compliance-table">';
    
    // Add header
    html += `<thead><tr>
        <th>Specification Requirement</th>
        <th>Submittal Information</th>
        <th>Compliance Status</th>
    </tr></thead>`;
    
    // Add body
    html += '<tbody>';
    
    complianceData.forEach(item => {
        // Determine status class
        let statusClass = '';
        const status = item.status.toUpperCase();
        
        if (status === 'COMPLIANT') {
            statusClass = 'status-compliant';
        } else if (status === 'NON-COMPLIANT') {
            statusClass = 'status-noncompliant';
        } else if (status === 'PARTIALLY COMPLIANT') {
            statusClass = 'status-partial';
        } else if (status === 'INFORMATION MISSING') {
            statusClass = 'status-missing';
        }
        
        html += `<tr>
            <td>${item.requirement}</td>
            <td>${item.submittalInfo}</td>
            <td class="${statusClass}">${item.status}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    
    return html;
}

// Helper function to format bullet points from text
function formatBulletPoints(text) {
    if (!text) return '<p>No information available</p>';
    
    // Check if the text already contains bullet points
    if (text.includes('* ')) {
        // Convert the asterisk bullet points to HTML list
        const items = text.split('* ').filter(item => item.trim() !== '');
        if (items.length > 0) {
            return '<ul>' + items.map(item => `<li>${item.trim()}</li>`).join('') + '</ul>';
        }
    }
    
    // If no bullet points, just return as paragraph
    return `<p>${text}</p>`;
}

// Function to load available models
async function loadAvailableModels() {
    try {
        const response = await fetch('/api/models');
        
        if (response.ok) {
            const models = await response.json();
            
            // Clear and populate the dropdown
            modelDropdown.innerHTML = '';
            
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                modelDropdown.appendChild(option);
            });
            
            // Set the selected model if it exists in the dropdown
            if (selectedModel) {
                // Check if the stored model is in the list
                const modelExists = Array.from(modelDropdown.options).some(option => option.value === selectedModel);
                
                if (modelExists) {
                    modelDropdown.value = selectedModel;
                } else if (modelDropdown.options.length > 0) {
                    // Default to first option if stored model doesn't exist
                    modelDropdown.selectedIndex = 0;
                    selectedModel = modelDropdown.value;
                    localStorage.setItem('selected_model', selectedModel);
                }
            }
        }
    } catch (error) {
        console.error('Error loading models:', error);
    }
}

// Add Print Report button function
function addPrintButton() {
    const resultsSection = document.querySelector('.results-section');
    
    // Create print button
    const printButton = document.createElement('button');
    printButton.id = 'print-report';
    printButton.innerHTML = '🖨️ Print Report';
    printButton.className = 'print-button';
    printButton.style.display = 'none'; // Initially hidden
    
    // Insert before results div
    resultsSection.insertBefore(printButton, resultsSection.querySelector('#results'));
    
    // Add event listener
    printButton.addEventListener('click', function() {
        window.print();
    });
    
    return printButton;
}

// Show print button
function showPrintButton() {
    const printButton = document.getElementById('print-report') || addPrintButton();
    printButton.style.display = 'block';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadAvailableModels();
    checkEnableAnalyze();
});