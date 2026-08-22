import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def _send_email(to_email, subject, body_text):
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
        print("="*60)
        return True
        
    try:
        msg = MIMEMultipart()
        msg['From'] = f"Dayflow HRMS <{smtp_user}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body_text, 'plain'))
        
        server = smtplib.SMTP(smtp_host, int(smtp_port))
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False

def send_otp_email(to_email, otp):
    subject = "Your Dayflow Registration OTP"
    body = f"Hello,\n\nYour One Time Password (OTP) for Dayflow registration is: {otp}\n\nThis OTP will expire in 10 minutes.\n\nThank you,\nDayflow Team"
    return _send_email(to_email, subject, body)

def send_leave_alert(to_email, subject, message):
    return _send_email(to_email, subject, message)
