import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def _send_email(to_email, subject, body_text, attachment_name=None, attachment_data=None):
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = os.environ.get("SMTP_PORT")
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")
    
    if not all([smtp_host, smtp_port, smtp_user, smtp_pass]):
        # Mock email behavior if no credentials (e.g. for hackathon demo)
        print("="*60)
        print(f"[MOCK EMAIL ENGINES]")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print("-" * 60)
        print(body_text)
        if attachment_name:
            print("-" * 60)
            print(f"[ATTACHMENT]: {attachment_name} ({len(attachment_data)} bytes)")
        print("="*60)
        return True
        
    try:
        msg = MIMEMultipart()
        msg['From'] = f"Axiom HRMS <{smtp_user}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body_text, 'plain'))
        
        if attachment_name and attachment_data:
            from email.mime.application import MIMEApplication
            part = MIMEApplication(attachment_data, Name=attachment_name)
            part['Content-Disposition'] = f'attachment; filename="{attachment_name}"'
            msg.attach(part)
        
        server = smtplib.SMTP(smtp_host, int(smtp_port))
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False


def send_leave_alert(to_email, subject, message, attachment_name=None, attachment_data=None):
    return _send_email(to_email, subject, message, attachment_name, attachment_data)

def generate_ics(leave_id, start_date, end_date, employee_name, type):
    """Generate an iCalendar (.ics) file content for an approved leave."""
    try:
        from ics import Calendar, Event
    except ImportError:
        return b"Error: ics library not installed."
        
    c = Calendar()
    e = Event()
    e.name = f"{employee_name} - {type.capitalize()} Leave"
    e.begin = start_date.isoformat() if hasattr(start_date, 'isoformat') else str(start_date)
    e.make_all_day()
    e.end = end_date.isoformat() if hasattr(end_date, 'isoformat') else str(end_date)
    e.description = f"Approved {type} leave for {employee_name}."
    c.events.add(e)
    return str(c).encode('utf-8')
