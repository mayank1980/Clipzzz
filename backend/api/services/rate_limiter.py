from django.core.cache import cache

def get_client_ip(request) -> str:
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR', '127.0.0.1')
    return ip

def check_otp_rate_limit(email: str, client_ip: str) -> tuple[bool, str]:
    """
    Checks rate limits for OTP requests using Redis or Django cache:
    - Max 3 requests per 10 minutes per email
    - Max 5 requests per 10 minutes per client IP
    """
    clean_email = email.lower().strip()
    email_key = f"otp_ratelimit_email_{clean_email}"
    ip_key = f"otp_ratelimit_ip_{client_ip}"

    # Check email count
    email_requests = cache.get(email_key, 0)
    if email_requests >= 3:
        return False, "Rate limit exceeded. You can only request 3 OTPs every 10 minutes for this email."

    # Check IP count
    ip_requests = cache.get(ip_key, 0)
    if ip_requests >= 5:
        return False, "Too many requests from your network. Please wait 10 minutes."

    # Increment counts with 10-minute expiry (600 seconds)
    cache.set(email_key, email_requests + 1, timeout=600)
    cache.set(ip_key, ip_requests + 1, timeout=600)

    return True, ""
