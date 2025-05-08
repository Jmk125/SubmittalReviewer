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
        
        # Use JSON mode to get structured output - this will completely fix the table issue
        messages = [
            {
                "role": "system",
                "content": """You are a construction specification reviewer assistant. Create a structured compliance report with these exact sections:

1. Submittal Summary: Identify all products being submitted, including manufacturer name, model numbers, and key specifications.

2. Applicable Specifications: List all specification sections that apply to this submittal.

3. Compliance Assessment: Provide a point-by-point comparison of specification requirements versus submittal information.

4. Critical Issues: List any major non-compliance issues that would require rejection.

5. Recommendations: Provide a clear recommendation and list any required corrections.

You MUST return your response as properly formatted JSON with the following structure:
{
  "submittalSummary": "text summary with bullet points using * format",
  "applicableSpecs": "text listing all applicable specifications using * bullet points",
  "complianceAssessment": [
    {
      "requirement": "Section X.X: Specific requirement text",
      "submittalInfo": "What the submittal provides",
      "status": "COMPLIANT" (or "NON-COMPLIANT", "PARTIALLY COMPLIANT", or "INFORMATION MISSING")
    },
    // more items...
  ],
  "criticalIssues": "list of critical issues using * bullet points, or 'No critical issues identified' if none",
  "recommendation": {
    "decision": "APPROVE" (or "APPROVE WITH COMMENTS", "REVISE AND RESUBMIT", or "REJECTED"),
    "comments": "text with bullet points using * format explaining the decision"
  }
}"""
            },
            {
                "role": "user",
                "content": f"""Please review the following product submittal for compliance with the project specifications:

SUBMITTAL ({submittal_name}):
{submittal_text[:15000]}{"... [content truncated due to length]" if len(submittal_text) > 15000 else ""}

SPECIFICATION ({spec_name}):
{spec_text[:15000]}{"... [content truncated due to length]" if len(spec_text) > 15000 else ""}

Remember to return your analysis in the required JSON format."""
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