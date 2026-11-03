import base64
import hashlib
from cryptography.fernet import Fernet
from django.conf import settings

def _get_fernet_instance():
    # Deterministically derive 32-byte urlsafe base64 key from Django SECRET_KEY
    digest = hashlib.sha256(settings.SECRET_KEY.encode('utf-8')).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)

def encrypt_api_key(raw_key: str) -> str:
    """Encrypts an API key before persisting in the database."""
    if not raw_key:
        return ""
    f = _get_fernet_instance()
    return f.encrypt(raw_key.strip().encode('utf-8')).decode('utf-8')

def decrypt_api_key(encrypted_key: str) -> str:
    """Decrypts an encrypted API key from the database."""
    if not encrypted_key:
        return ""
    f = _get_fernet_instance()
    try:
        return f.decrypt(encrypted_key.encode('utf-8')).decode('utf-8')
    except Exception as e:
        print(f"[security] Decryption failed: {e}")
        return ""

def mask_api_key(raw_or_decrypted_key: str) -> str:
    """Masks an API key showing only first 6 and last 4 characters."""
    if not raw_or_decrypted_key:
        return ""
    s = raw_or_decrypted_key.strip()
    if len(s) <= 10:
        return "••••••••"
    return f"{s[:6]}••••••••{s[-4:]}"
