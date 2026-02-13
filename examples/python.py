"""
Python Annotation Examples for collab-claude-code

This file demonstrates all annotation patterns supported by the
@collab system for trust level management.

Python uses indentation-based scope detection, so annotations
automatically apply to the entire indented block following them.
"""

import bcrypt
import jwt
import hmac
import hashlib
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from datetime import datetime, timedelta


# ============================================
# SINGLE-LINE ANNOTATIONS
# ============================================

# @collab trust="READ_ONLY" owner="security-team"
def validate_jwt(token: str, secret: str) -> dict:
    """Validate a JWT token and return its payload.

    This entire function is READ_ONLY.
    Claude cannot modify this code directly.
    """
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise AuthenticationError("Token has expired")
    except jwt.InvalidTokenError:
        raise AuthenticationError("Invalid token")


# @collab trust="SUGGEST_ONLY" owner="payments-team"
async def process_payment(amount: float, card_token: str) -> PaymentResult:
    """Process a payment through Stripe.

    Claude must create a proposal to modify this function.
    """
    import stripe

    charge = await stripe.Charge.create(
        amount=int(amount * 100),
        currency="usd",
        source=card_token,
    )
    return PaymentResult(success=True, charge_id=charge.id)


# @collab trust="AUTONOMOUS"
def format_currency(amount: float, currency: str = "USD") -> str:
    """Format an amount as currency.

    Claude can freely modify this function.
    """
    symbols = {"USD": "$", "EUR": "€", "GBP": "£"}
    symbol = symbols.get(currency, currency)
    return f"{symbol}{amount:,.2f}"


# ============================================
# MULTI-LINE ANNOTATIONS (attributes merge)
# ============================================

# @collab trust="SUGGEST_ONLY"
# @collab intent="Implement user authentication flow"
# @collab owner="auth-team"
async def authenticate_user(email: str, password: str) -> AuthResult:
    """Authenticate a user with email and password.

    All @collab attributes are merged and applied to this function.
    """
    user = await db.users.find_by_email(email)
    if not user:
        raise AuthenticationError("User not found")

    if not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
        raise AuthenticationError("Invalid password")

    token = jwt.encode(
        {
            "user_id": user.id,
            "exp": datetime.utcnow() + timedelta(hours=24),
        },
        SECRET_KEY,
        algorithm="HS256",
    )

    return AuthResult(user=user, token=token)


# @collab trust="SUGGEST_ONLY"
# @collab intent="Rate limiting for API endpoints"
# @collab constraints=["Must not block legitimate traffic", "Must log violations"]
class RateLimiter:
    """Token bucket rate limiter.

    Constraints document requirements that must be preserved.
    """

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: Dict[str, List[float]] = {}

    def check(self, client_id: str) -> bool:
        """Check if a client is within rate limits."""
        import time

        now = time.time()
        window_start = now - self.window_seconds

        client_requests = self._requests.get(client_id, [])
        recent_requests = [t for t in client_requests if t > window_start]

        if len(recent_requests) >= self.max_requests:
            print(f"Rate limit exceeded: {client_id}")
            return False

        recent_requests.append(now)
        self._requests[client_id] = recent_requests
        return True


# ============================================
# BLOCK ANNOTATIONS (explicit regions)
# ============================================

# @collab:begin trust="READ_ONLY" owner="crypto-team"
class EncryptionService:
    """AES-256-GCM encryption service.

    This entire class is READ_ONLY.
    """

    ALGORITHM = "aes-256-gcm"

    def __init__(self, key: bytes):
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        self._key = key

    def encrypt(self, plaintext: str) -> EncryptedData:
        """Encrypt plaintext using AES-256-GCM."""
        import os
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

        iv = os.urandom(16)
        cipher = Cipher(algorithms.AES(self._key), modes.GCM(iv))
        encryptor = cipher.encryptor()

        ciphertext = encryptor.update(plaintext.encode()) + encryptor.finalize()

        return EncryptedData(
            iv=iv.hex(),
            data=ciphertext.hex(),
            auth_tag=encryptor.tag.hex(),
        )

    def decrypt(self, encrypted: EncryptedData) -> str:
        """Decrypt data using AES-256-GCM."""
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

        cipher = Cipher(
            algorithms.AES(self._key),
            modes.GCM(bytes.fromhex(encrypted.iv), bytes.fromhex(encrypted.auth_tag)),
        )
        decryptor = cipher.decryptor()

        plaintext = decryptor.update(bytes.fromhex(encrypted.data)) + decryptor.finalize()
        return plaintext.decode()


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode(), hashed.encode())
# @collab:end


# @collab:begin trust="SUGGEST_ONLY" intent="Database transaction handling"
async def with_transaction(fn):
    """Execute a function within a database transaction."""
    tx = await db.begin_transaction()

    try:
        result = await fn(tx)
        await tx.commit()
        return result
    except Exception:
        await tx.rollback()
        raise


async def transfer_funds(
    from_account_id: str,
    to_account_id: str,
    amount: float,
) -> TransferResult:
    """Transfer funds between accounts atomically."""

    async def do_transfer(tx):
        from_account = await tx.accounts.find_by_id(from_account_id)
        to_account = await tx.accounts.find_by_id(to_account_id)

        if from_account.balance < amount:
            raise InsufficientFundsError("Insufficient funds")

        await tx.accounts.update(from_account_id, balance=from_account.balance - amount)
        await tx.accounts.update(to_account_id, balance=to_account.balance + amount)

        return TransferResult(success=True, transaction_id=tx.id)

    return await with_transaction(do_transfer)
# @collab:end


# ============================================
# CLASS WITH MIXED TRUST LEVELS
# ============================================

# @collab:begin trust="SUPERVISED"
class UserService:
    """User management service with mixed trust levels."""

    def __init__(self, db, audit_log):
        self.db = db
        self.audit_log = audit_log

    # Inner annotation takes precedence for this method
    # @collab trust="SUGGEST_ONLY" owner="privacy-team"
    async def delete_user(self, user_id: str) -> None:
        """Delete a user and all their data (GDPR compliance).

        This method is SUGGEST_ONLY (requires proposal).
        """
        await self._delete_user_data(user_id)
        await self._delete_user_posts(user_id)
        await self._delete_user_account(user_id)
        await self.audit_log.record("user_deleted", {"user_id": user_id})

    # Falls back to block trust level (SUPERVISED)
    async def update_profile(
        self,
        user_id: str,
        updates: dict,
    ) -> User:
        """Update a user's profile."""
        return await self.db.users.update(user_id, **updates)

    async def _delete_user_data(self, user_id: str) -> None:
        await self.db.user_data.delete_where(user_id=user_id)

    async def _delete_user_posts(self, user_id: str) -> None:
        await self.db.posts.delete_where(author_id=user_id)

    async def _delete_user_account(self, user_id: str) -> None:
        await self.db.users.delete(user_id)
# @collab:end


# ============================================
# DATA CLASSES (no annotations needed typically)
# ============================================

@dataclass
class PaymentResult:
    success: bool
    charge_id: str


@dataclass
class AuthResult:
    user: "User"
    token: str


@dataclass
class EncryptedData:
    iv: str
    data: str
    auth_tag: str


@dataclass
class TransferResult:
    success: bool
    transaction_id: str


@dataclass
class User:
    id: str
    email: str
    password_hash: str
    name: Optional[str] = None


class AuthenticationError(Exception):
    pass


class InsufficientFundsError(Exception):
    pass
