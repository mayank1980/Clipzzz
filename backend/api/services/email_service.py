import os
from django.core.mail import send_mail
from django.conf import settings

def send_otp_email(recipient_email: str, otp_code: str, user_name: str = "Creator") -> bool:
    """
    Sends a beautifully styled HTML OTP verification email to the user's Gmail address.
    """
    subject = f"{otp_code} is your Clipzzz verification code"

    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Clipzzz Verification Code</title>
      <style>
        body {{
          background-color: #07090e;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #f1f5f9;
          margin: 0;
          padding: 24px 12px;
        }}
        .container {{
          max-width: 520px;
          margin: 0 auto;
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 20px;
          padding: 36px 28px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
        }}
        .header {{
          text-align: center;
          margin-bottom: 28px;
        }}
        .logo {{
          display: inline-block;
          font-size: 26px;
          font-weight: 900;
          letter-spacing: 2px;
          color: #ffffff;
        }}
        .logo-accent {{
          color: #bef264;
        }}
        .badge {{
          display: inline-block;
          margin-top: 6px;
          background: rgba(190, 242, 100, 0.15);
          color: #bef264;
          border: 1px solid rgba(190, 242, 100, 0.3);
          font-size: 10px;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 9999px;
          text-transform: uppercase;
        }}
        .content {{
          text-align: center;
        }}
        h2 {{
          font-size: 20px;
          font-weight: 800;
          color: #ffffff;
          margin: 0 0 10px 0;
        }}
        p {{
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.6;
          margin: 0 0 20px 0;
        }}
        .otp-box {{
          background: #07090e;
          border: 2px solid #bef264;
          border-radius: 16px;
          padding: 18px 24px;
          margin: 24px auto;
          max-width: 280px;
          text-align: center;
          box-shadow: 0 0 20px rgba(190, 242, 100, 0.25);
        }}
        .otp-code {{
          font-family: 'Courier New', Courier, monospace;
          font-size: 36px;
          font-weight: 900;
          letter-spacing: 8px;
          color: #bef264;
          display: block;
        }}
        .footer {{
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid #1e293b;
          text-align: center;
          font-size: 11px;
          color: #64748b;
          line-height: 1.5;
        }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">CLIP<span class="logo-accent">ZZZ</span></div>
          <br>
          <div class="badge">AI YouTube Shorts Studio</div>
        </div>
        <div class="content">
          <h2>Verification Code</h2>
          <p>Hi {user_name},<br>Use the 6-digit one-time password below to complete your authentication.</p>
          
          <div class="otp-box">
            <span class="otp-code">{otp_code}</span>
          </div>

          <p style="font-size: 12px; color: #cbd5e1;">
            ⏰ Valid for <strong>10 minutes</strong>. Never share this code with anyone.
          </p>
        </div>
        <div class="footer">
          If you did not request this verification code, please ignore this email.<br>
          Clipzzz Studio • Built for Creators across India & Globally
        </div>
      </div>
    </body>
    </html>
    """

    plain_message = f"""Clipzzz Verification Code

Hi {user_name},
Your 6-digit verification code is: {otp_code}

This code is valid for 10 minutes. Please do not share it with anyone.
"""

    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@clipzzz.ai')

    try:
        # Check if Gmail credentials are provided
        if settings.EMAIL_HOST_USER and settings.EMAIL_HOST_PASSWORD:
            send_mail(
                subject=subject,
                message=plain_message,
                from_email=from_email,
                recipient_list=[recipient_email],
                html_message=html_content,
                fail_silently=False,
            )
            print(f"[email_service] Successfully sent OTP to {recipient_email}")
            return True
        else:
            print(f"[email_service] Gmail SMTP credentials not set in .env. OTP for {recipient_email}: {otp_code}")
            return False
    except Exception as e:
        print(f"[email_service] Error sending email via Gmail SMTP: {e}")
        return False
