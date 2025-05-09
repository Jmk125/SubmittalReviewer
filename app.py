from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import tempfile
import fitz  # PyMuPDF
import pytesseract
from PIL import Image
from openai import OpenAI  # Updated import
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder='static')
CORS(app)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    if 'submittal' not in request.files or 'spec' not in request.files:
        return jsonify({"error": "Missing required files"}), 400

    api_key = request.form.get('api_key')
    if not api_key:
        return jsonify({"error": "Missing API key"}), 400

    model = request.form.get('model', 'gpt-4')  # Get model from request, default to gpt-4

    submittal_file = request.files['submittal']
    spec_file = request.files['spec']

    # Create temporary files
    with tempfile.NamedTemporaryFile(delete=False) as submittal_temp:
        submittal_file.save(submittal_temp.name)
        submittal_text = extract_text_from_pdf(submittal_temp.name)

    with tempfile.NamedTemporaryFile(delete=False) as spec_temp:
        spec_file.save(spec_temp.name)
        spec_text = extract_text_from_pdf(spec_temp.name)

    # Clean up temporary files
    os.unlink(submittal_temp.name)
    os.unlink(spec_temp.name)

    # Analyze the documents
    result = analyze_documents(submittal_text, spec_text, api_key, model)
    return jsonify(result)

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    if not data or not data.get('message') or not data.get('api_key'):
        return jsonify({"error": "Missing required fields"}), 400

    client = OpenAI(api_key=data['api_key'])
    model = data.get('model', 'gpt-4')  # Get model from request, default to gpt-4
    
    try:
        # Create a prompt that includes the context and the follow-up question
        context = f"""
        Context from the submittal document:
        {data.get('submittal_context', '')}

        Context from the specification document:
        {data.get('spec_context', '')}

        Previous review and recommendation were provided based on the above documents.

        Follow-up question: {data['message']}
        """

        response = client.chat.completions.create(
            model=model, # Use the provided model
            messages=[
                {"role": "system", "content": "You are an experienced construction submittal reviewer helping with follow-up questions about a submittal review. Answer questions based on the context provided."},
                {"role": "user", "content": context}
            ]
        )

        return jsonify({"response": response.choices[0].message.content})

    except Exception as e:
        return jsonify({"error": f"Chat failed: {str(e)}"})

def extract_text_from_pdf(pdf_path):
    text = ""
    try:
        # Open the PDF
        doc = fitz.open(pdf_path)
        
        # First try to extract text directly
        for page in doc:
            text += page.get_text()
        
        # If no text was extracted, try OCR
        if not text.strip():
            for page_num in range(len(doc)):
                page = doc[page_num]
                pix = page.get_pixmap()
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                text += pytesseract.image_to_string(img) + "\n"
        
        return text.strip()
    except Exception as e:
        return f"Error extracting text: {str(e)}"
    finally:
        if 'doc' in locals():
            doc.close()

def analyze_documents(submittal_text, spec_text, api_key, model="gpt-4"):
    client = OpenAI(api_key=api_key)
    
    try:
        # Updated prompt with more specific instructions
        prompt = f"""
        You are reviewing a construction submittal package against specification requirements. 
        
        SPECIFICATION:
        {spec_text[:2000]}

        SUBMITTAL:
        {submittal_text[:2000]}

        Important Review Guidelines:
        1. Focus on evaluating the content that IS provided in the submittal, not what's missing
        2. Only recommend "Revise and Resubmit" if the submitted content itself fails to meet specifications
        3. If the submittal only contains product data but meets the product requirements, this should be marked as "Approved" even if the spec calls for additional items like shop drawings
        4. Clearly indicate what type of submittal content was provided (e.g., product data, shop drawings, samples, etc.)
        5. Note any missing requirements as "Additional Submittals Required" rather than reasons for rejection

        Please provide:
        1. Type of submittal content provided: (identify what was actually submitted)
        2. Compliance review of submitted content: (evaluate only the content that was provided)
        3. Missing requirements: (list as "Additional Submittals Required" - not as deficiencies)
        4. Recommendation: (Approve/Reject/Revise and Resubmit)
            - "Approve" if the submitted content meets specifications
            - "Revise and Resubmit" only if the submitted content itself fails to meet specifications
            - "Reject" if the submitted content is fundamentally incorrect or unsuitable
        """

        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system", 
                    "content": "You are an experienced construction submittal reviewer who understands that submittals often come in phases. Focus on reviewing what is submitted rather than what is still pending."
                },
                {"role": "user", "content": prompt}
            ]
        )

        analysis = response.choices[0].message.content

        # Update how we process the response to match the new format
        sections = analysis.split('\n')
        review_parts = {}
        current_section = None
        
        for line in sections:
            if line.startswith('1. Type of'):
                current_section = 'content_type'
                review_parts[current_section] = ''
            elif line.startswith('2. Compliance'):
                current_section = 'review'
                review_parts[current_section] = ''
            elif line.startswith('3. Missing'):
                current_section = 'missing'
                review_parts[current_section] = ''
            elif line.startswith('4. Recommendation'):
                current_section = 'recommendation'
                review_parts[current_section] = ''
            elif current_section and line.strip():
                review_parts[current_section] += line.strip() + '\n'

        return {
            "content_type": review_parts.get('content_type', '').strip(),
            "review": review_parts.get('review', '').strip(),
            "missing_items": review_parts.get('missing', '').strip(),
            "recommendation": review_parts.get('recommendation', '').strip(),
            "submittalText": submittal_text,
            "specText": spec_text
        }

    except Exception as e:
        return {"error": f"Analysis failed: {str(e)}"}

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)