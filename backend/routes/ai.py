from flask import Blueprint, request, jsonify
from utils.auth import login_required

ai_bp = Blueprint("ai", __name__, url_prefix="/api/ai")

KNOWLEDGE_BASE = {
    "leave": "Our leave policy includes 18 paid leaves, 12 sick leaves, and 6 unpaid leaves per year. To apply, go to the Leave section and select your dates.",
    "attendance": "You are required to check in daily. If you work less than 4 hours, it will be marked as a half-day.",
    "payroll": "Salaries are credited on the 28th of every month. You can view your payslips in the Payroll section.",
    "holiday": "Public holidays are announced at the beginning of the year. Sundays are fixed weekly offs.",
    "hi": "Hello! I am the Axiom AI Assistant. How can I help you with our company policies today?",
    "hello": "Hello! I am the Axiom AI Assistant. How can I help you with our company policies today?"
}

@ai_bp.post("/ask")
@login_required
def ask_ai():
    data = request.get_json() or {}
    message = data.get("message", "").lower()

    if not message:
        return jsonify({"reply": "Please ask a question."})

    for keyword, response in KNOWLEDGE_BASE.items():
        if keyword in message:
            return jsonify({"reply": response})

    return jsonify({"reply": "I'm not sure about that. Please contact HR for more specific details or try asking about leave, attendance, or payroll."})
