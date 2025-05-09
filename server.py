from flask import Flask, request, jsonify, send_from_directory
import os
import tempfile
import fitz  # PyMuPDF
from werkzeug.utils import secure_filename
from openai import OpenAI
import json

app = Flask(__name__)

# Configure upload settings
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
    
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB limit

# Get available models
@app.route('/api/models', methods=['GET'])
def get_models():
    models = [
        {"id": "gpt-4o", "name": "GPT-4o (Default)", "provider": "openai"},
        {"id": "gpt-4", "name": "GPT-4", "provider": "openai"},
        {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo (Faster)", "provider": "openai"}
    ]
    return jsonify(models)

# Serve static files
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('public', path)

@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

# API endpoint for analyzing documents
@app.route('/api/analyze', methods=['POST'])
def analyze():
    try:
        # Get API key and model from headers
        api_key = request.headers.get('X-API-KEY')
        model_id = request.headers.get('X-MODEL-ID', 'gpt-4o')  # Default to GPT-4o
        
        if not api_key:
            return jsonify({'error': 'OpenAI API key is required'}), 400

        # Check if files were uploaded
        if 'submittal' not in request.files or 'spec' not in request.files:
            return jsonify({'error': 'Both submittal and specification files are required'}), 400
            
        submittal_file = request.files['submittal']
        spec_file = request.files['spec']
        
        # Save uploaded files temporarily
        submittal_path = os.path.join(app.config['UPLOAD_FOLDER'], 
                                     secure_filename(f"{int(os.urandom(4).hex(), 16)}-{submittal_file.filename}"))
        spec_path = os.path.join(app.config['UPLOAD_FOLDER'], 
                               secure_filename(f"{int(os.urandom(4).hex(), 16)}-{spec_file.filename}"))
        
        submittal_file.save(submittal_path)
        spec_file.save(spec_path)
        
        # Extract text from PDFs
        submittal_text = extract_text_from_pdf(submittal_path)
        spec_text = extract_text_from_pdf(spec_path)
        
        # Get analysis from OpenAI
        analysis = analyze_with_openai(
            api_key, 
            submittal_text, 
            spec_text, 
            submittal_file.filename,
            spec_file.filename,
            model_id
        )
        
        # Clean up uploaded files
        os.remove(submittal_path)
        os.remove(spec_path)
        
        return jsonify({'analysis': analysis})
        
    except Exception as e:
        print(f"Error in /api/analyze: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Function to extract text from PDF
def extract_text_from_pdf(file_path):
    try:
        text = ""
        with fitz.open(file_path) as doc:
            for page in doc:
                text += page.get_text()
        return text
    except Exception as e:
        print(f"Error extracting text from PDF: {str(e)}")
        raise Exception('Failed to extract text from PDF')

# Function to analyze documents with OpenAI API
def analyze_with_openai(api_key, submittal_text, spec_text, submittal_name, spec_name, model_id="gpt-4o"):
    try:
        client = OpenAI(api_key=api_key)
        
        # Enhanced prompt with better product-specific analysis
        messages = [
            {
                "role": "system",
                "content": """You are a construction specification reviewer assistant specialized in reviewing submittals against specifications.

IMPORTANT - READ CAREFULLY:
- The SPECIFICATION document covers requirements for multiple potential products/materials
- The SUBMITTAL document is typically for a SPECIFIC PRODUCT or set of products, NOT everything in the spec
- Your task is to:
  1. Identify what specific product(s) are being submitted
  2. Find requirements in the specification that specifically apply to those submitted products
  3. Check if the submittal meets those specific requirements

When reviewing:
- DO NOT expect the submittal to meet ALL requirements in the specification
- ONLY evaluate against requirements that apply to the product(s) being submitted
- For example, if only geotextile fabric is submitted, only check geotextile fabric requirements even if the spec also covers storm structures

Return your findings as properly formatted JSON with the following structure:
{
  "submittalSummary": "Clear identification of what specific product(s) are being submitted",
  "applicableSpecs": "List specification sections that SPECIFICALLY APPLY to the submitted product(s)",
  "complianceAssessment": [
    {
      "requirement": "Section X.X: [Exact requirement FROM THE SPECIFICATION that applies to the submitted product]",
      "submittalInfo": "What the submittal provides related to this requirement",
      "status": "COMPLIANT or NON-COMPLIANT or PARTIALLY COMPLIANT or INFORMATION MISSING"
    },
    // additional requirements...
  ],
  "criticalIssues": "List of non-compliance issues requiring attention, or 'No critical issues identified' if none",
  "recommendation": {
    "decision": "APPROVE or APPROVE WITH COMMENTS or REVISE AND RESUBMIT or REJECTED",
    "comments": "Explanation of the decision with specific items that need correction"
  }
}

REMINDERS:
- First correctly identify what product(s) are being submitted
- Only list requirements that specifically apply to those products
- Don't expect the submittal to address requirements for products not being submitted
- Ensure section references are accurate from the specification document"""
            },
            {
                "role": "user",
                "content": f"""Please review this submittal document against the specification document to determine compliance:

SPECIFICATION DOCUMENT ({spec_name}):
This document contains requirements for various products/materials:
{spec_text[:15000]}{"... [content truncated due to length]" if len(spec_text) > 15000 else ""}

SUBMITTAL DOCUMENT ({submittal_name}):
This document is submitting specific product(s) for approval:
{submittal_text[:15000]}{"... [content truncated due to length]" if len(submittal_text) > 15000 else ""}

First identify what specific product(s) are being submitted, then check if they comply with the applicable requirements for those specific products in the specification."""
            }
        ]
        
        # Call OpenAI API with the specified model and request JSON response
        completion = client.chat.completions.create(
            model=model_id,
            messages=messages,
            max_tokens=4000,
            response_format={"type": "json_object"}  # Force JSON response
        )
        
        return completion.choices[0].message.content
    
    except Exception as e:
        print(f"Error calling OpenAI API: {str(e)}")
        raise Exception(f"OpenAI API error: {str(e)}")

if __name__ == '__main__':
    app.run(port=3000, debug=True)
