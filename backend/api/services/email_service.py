import os
from email.mime.image import MIMEImage
from django.core.mail import EmailMultiAlternatives
from django.conf import settings

def send_otp_email(recipient_email: str, otp_code: str, user_name: str = "Creator") -> bool:
    """
    Sends a styled HTML OTP verification email with embedded CLIPIT logo to the user's Gmail address.
    """
    subject = f"{otp_code} is your CLIPIT verification code"

    logo_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'clipit_logo.png')
    has_logo = os.path.exists(logo_path)
    logo_html = (
        '<img src="cid:clipit_logo" alt="CLIPIT" style="height: 30px; width: auto; display: inline-block; border: 0;" />'
        if has_logo
        else '<div class="logo">CLIP<span class="logo-accent">IT</span></div>'
    )

    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CLIPIT Verification Code</title>
      <style>
        body {{
          background-color: #F3F0EE;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #141413;
          margin: 0;
          padding: 24px 12px;
        }}
        .container {{
          max-width: 520px;
          margin: 0 auto;
          background: #FFFFFF;
          border: 1px solid #E5E0DB;
          border-radius: 32px;
          padding: 36px 28px;
          box-shadow: 0 18px 40px rgba(20, 20, 19, 0.08);
        }}
        .header {{
          text-align: center;
          margin-bottom: 24px;
        }}
        .logo {{
          display: inline-block;
          font-size: 28px;
          font-weight: 900;
          letter-spacing: -0.5px;
          color: #141413;
        }}
        .logo-accent {{
          color: #CF4500;
        }}
        .badge {{
          display: inline-block;
          margin-top: 10px;
          background: #F3F0EE;
          color: #262627;
          border: 1px solid #E5E0DB;
          font-size: 10px;
          font-weight: 700;
          padding: 4px 12px;
          border-radius: 9999px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }}
        .content {{
          text-align: center;
        }}
        h2 {{
          font-size: 20px;
          font-weight: 800;
          color: #141413;
          margin: 0 0 10px 0;
        }}
        p {{
          font-size: 13px;
          color: #696969;
          line-height: 1.6;
          margin: 0 0 20px 0;
        }}
        .otp-box {{
          background: #FCFBFA;
          border: 2px solid #CF4500;
          border-radius: 20px;
          padding: 18px 24px;
          margin: 24px auto;
          max-width: 280px;
          text-align: center;
        }}
        .otp-code {{
          font-family: 'Courier New', Courier, monospace;
          font-size: 36px;
          font-weight: 900;
          letter-spacing: 8px;
          color: #141413;
          display: block;
        }}
        .footer {{
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid #E5E0DB;
          text-align: center;
          font-size: 11px;
          color: #696969;
          line-height: 1.5;
        }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          {logo_html}
          <br>
          <div class="badge">Find the moment. Clip it.</div>
        </div>
        <div class="content">
          <h2>Verification Code</h2>
          <p>Hi {user_name},<br>Use the 6-digit one-time password below to sign in to CLIPIT.</p>
          
          <div class="otp-box">
            <span class="otp-code">{otp_code}</span>
          </div>

          <p style="font-size: 12px; color: #555555;">
            Valid for <strong>10 minutes</strong>. Never share this code with anyone.
          </p>
        </div>
        <div class="footer">
          If you did not request this verification code, please ignore this email.<br>
          <strong>CLIPIT</strong> — Long videos in. Perfect clips out.
        </div>
      </div>
    </body>
    </html>
    """

    plain_message = f"""CLIPIT Verification Code — Find the moment. Clip it.

Hi {user_name},
Your 6-digit verification code is: {otp_code}

This code is valid for 10 minutes. Please do not share it with anyone.
"""

    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@clipit.ai')

    try:
        if settings.EMAIL_HOST_USER and settings.EMAIL_HOST_PASSWORD:
            msg = EmailMultiAlternatives(
                subject=subject,
                body=plain_message,
                from_email=from_email,
                to=[recipient_email],
            )
            msg.attach_alternative(html_content, "text/html")
            if has_logo:
                with open(logo_path, 'rb') as img_f:
                    mime_logo = MIMEImage(img_f.read(), _subtype='png')
                    mime_logo.add_header('Content-ID', '<clipit_logo>')
                    mime_logo.add_header('Content-Disposition', 'inline', filename='clipit_logo.png')
                    msg.attach(mime_logo)
            msg.send(fail_silently=False)
            print(f"[email_service] Successfully sent CLIPIT OTP email to {recipient_email}")
            return True
        else:
            print(f"[email_service] Gmail SMTP credentials not set in .env. OTP for {recipient_email}: {otp_code}")
            return False
    except Exception as e:
        print(f"[email_service] Error sending email via Gmail SMTP: {e}")
        return False
