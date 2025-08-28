from flask import Flask, request, jsonify
from flask_cors import CORS
import requests, os, json
from datetime import datetime
import uuid
import re

app = Flask(__name__)
CORS(app)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# Corrected endpoint
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent"
# In app.py, right after the imports
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
print(f"DEBUG: Loaded Gemini API Key: {GEMINI_API_KEY}") # Add this line for debugging
def build_prompt(data):
    topic = data.get("topic", "")
    skill_tags = data.get("skill_tags", "")
    q_type = data.get("question_type", "").lower()
    difficulty = data.get("difficulty", "medium").capitalize()
    section = data.get("question_section", "").lower()
    prog_lang = data.get("programming_language", "")

    base_prompt = f"""
You are an AI question generator. Your response must be a single valid JSON object.
Generate a question of type '{q_type}'.
Topic: {topic}
Skill Tags: {skill_tags}
Difficulty: {difficulty}
Section: {section}.
"""
    if section == "data_interpretation":
        base_prompt += """
- First, you MUST randomly select ONE visualization type from this list: ['pie', 'line', 'bar', 'table'].
- The JSON response MUST include a 'data' object. This 'data' object must contain:
  1. 'type': The visualization type you randomly selected (e.g., "pie").
  2. 'dataContext': A string with a title or brief description of the data (e.g., "Quarterly Product Sales").
  3. 'tableData': An object containing the underlying data for your chosen visualization, formatted as a table. This object must have two keys:
     - 'headers': An array of strings for the column titles.
     - 'rows': An array of arrays, where each inner array is a data row.
- The main 'question' for the user should then be based on the data you've provided.
- For example, if you randomly select 'pie', the tableData might have headers like ["Category", "Percentage"]. If you select 'bar', the headers could be ["Month", "Units Sold"].
"""
    elif section == "logical_reasoning":
        base_prompt += f"""You are an expert test prep creator skilled in designing challenging logical reasoning questions.
        Now First, select a topic in logical reasoning such as coding-decoding, seating arrangement, direction sense etc.
        Then for a placement exam targeting freshers , generate a complex logical reasoning question that requires multi-step thinking and analysis. 
        Provide a logical premise section that contains the data or setup (e.g., “Five people are sitting around a table...”).
        After that, generate a question section that asks what you want solved based on the premise (e.g., “Who will be sitting last from the left?”) with the answer and a step-by-step explanation of how to solve it."""

    elif section == "programming" and prog_lang:
        base_prompt += f"""
            - Programming Language: "{prog_lang}"
            - The problem statement, required algorithm, and test cases MUST be appropriate for the specified '{difficulty}' level.
            - For 'Easy' difficulty, the problem should be solvable with fundamental programming constructs.
            - For 'Hard' difficulty, the problem should require more advanced algorithms (e.g., dynamic programming, graph theory) and careful handling of edge cases.

            - The 'question' should be a clear and concise programming problem description.

            - The 'explanation' key MUST provide a comprehensive, clear, and elaborate breakdown of the solution. It must contain the following distinct parts:
              1. **Approach:** A high-level description of the core logic or algorithm used (e.g., "This problem is solved using a sliding window approach.").
              2. **Step-by-step Logic:** A detailed, step-by-step walkthrough of how the code executes to arrive at the solution.
              3.. **Complexity Analysis:** The time and space complexity of the solution in Big O notation (e.g., "Time Complexity: O(n), Space Complexity: O(k)").

            - The JSON response MUST include a 'solution_code' key containing the correct, complete, and well-commented code solution in {prog_lang}.
            - It can optionally include a 'starter_code' key with boilerplate code for the user.

            - The JSON response MUST also include a 'sample_test_cases' object. This object must contain:
                1. 'headers': An array of two strings: ["Sample Input", "Sample Output"].
                2. 'rows': An array of arrays, where each inner array contains a sample input and its corresponding output. The complexity of these test cases should match the '{difficulty}' level. For example, 'Hard' difficulty might include edge cases like empty arrays, overflow numbers, etc. Example format: [["'hello'", "'olleh'"], ["'world'", "'dlrow'"]].
            """
    elif section in ["technical", "aptitude", "technical_aptitude"]:
        base_prompt += "Include a technical/aptitude question.\n"

    base_prompt += f"""You are a world-class test prep expert specializing in creating technical aptitude questions for fresh graduate placement exams.
Please generate one clear and challenging question stem that involves multi-step problem-solving.
Provide a detailed step-by-step explanation showing how to solve the question.
Format your entire response as a JSON object with the following keys:
"question": The question stem as a string.
"options": A list/array of answer options (if applicable, otherwise an empty array).
"answer": The correct answer option (string).
"explanation":
"Description of the first step in solving the problem.then Description of the second step then Description of the third step (if needed).
Return only this JSON object as your output without extra text or commentary.\n"""
    return base_prompt.strip()

def extract_json_from_response(text):
    """Extracts a JSON object from a string, including from within markdown code blocks."""
    # Look for a JSON object within ```json ... ```
    match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Fallback to finding the first valid JSON object
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fallback for the original brace counting method if direct parsing fails
        start = text.find("{")
        if start != -1:
            depth = 0
            for i in range(start, len(text)):
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        candidate = text[start:i+1]
                        try:
                            return json.loads(candidate)
                        except json.JSONDecodeError:
                            continue
    return None


@app.route("/generate_question", methods=["POST"])
def generate_question():
    try:
        data = request.json
        prompt_text = build_prompt(data)

        body = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": prompt_text
                        }
                    ]
                }
            ]
        }

        headers = {"Content-Type": "application/json"}
        response = requests.post(
            GEMINI_ENDPOINT,
            headers=headers,
            params={"key": GEMINI_API_KEY},
            json=body
        )

        response.raise_for_status()  # Raises an HTTPError for bad responses (4xx or 5xx)

        response_json = response.json()
        
        if not response_json.get("candidates"):
            return jsonify({"error": f"Invalid response from Gemini API: {response_json}"}), 500

        ai_text = response_json["candidates"][0].get("content", {}).get("parts", [{}])[0].get("text", "")

        if not ai_text:
            return jsonify({"error": f"No text returned by Gemini API: {response_json}"}), 500

        result_json = extract_json_from_response(ai_text)
        if not result_json:
            return jsonify({"error": f"Failed to parse JSON from AI response: {ai_text}"}), 500

        # Add metadata for frontend
        result_json.update({
            "difficulty": data.get("difficulty", "medium"),
            "question_type": data.get("question_type", "mcq"),
            "section": data.get("question_section", "technical_aptitude"),
            "skill_tags": data.get("skill_tags", ""),
            "created_at": datetime.utcnow().isoformat() + "Z",
            "id": str(uuid.uuid4())
        })

        return jsonify(result_json)

    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Error contacting Gemini API: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True,port=7000)