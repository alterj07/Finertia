"""Password hashing, JWT tokens and the AuthService used by the API layer."""

import hashlib
import hmac
import logging
import os
import re
import uuid
from datetime import UTC, datetime, timedelta

import jwt

from app.auth.models import User
from app.auth.store import UserExists, UserStore
from app.config import Settings

log = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AuthError(Exception):
    pass


def hash_password(password: str) -> tuple[str, str]:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return salt.hex(), digest.hex()


def verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    digest = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1
    )
    return hmac.compare_digest(digest.hex(), hash_hex)


def create_token(user: User, settings: Settings) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": user.id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.auth_token_ttl_hours)).timestamp()),
    }
    return jwt.encode(payload, settings.auth_secret.get_secret_value(), algorithm="HS256")


def decode_token(token: str, settings: Settings) -> str:
    try:
        payload = jwt.decode(
            token, settings.auth_secret.get_secret_value(), algorithms=["HS256"]
        )
    except jwt.PyJWTError as exc:
        raise AuthError("invalid token") from exc
    sub = payload.get("sub")
    if not sub:
        raise AuthError("invalid token")
    return str(sub)


class AuthService:
    def __init__(self, store: UserStore, settings: Settings) -> None:
        self.store = store
        self.settings = settings

    def signup(self, email: str, password: str, name: str = "") -> User:
        email = email.strip().lower()
        if not _EMAIL_RE.match(email):
            raise ValueError("invalid email address")
        if len(password) < 8:
            raise ValueError("password must be at least 8 characters")
        salt, digest = hash_password(password)
        user = User(
            id=uuid.uuid4().hex[:12],
            email=email,
            username=email,
            name=name.strip(),
            password_salt=salt,
            password_hash=digest,
            created_at=datetime.now(UTC).isoformat(timespec="seconds"),
        )
        return self.store.create(user)

    def create_token(self, user: User) -> str:
        return create_token(user, self.settings)

    def decode_token(self, token: str) -> str:
        return decode_token(token, self.settings)

    def login(self, identifier: str, password: str) -> User | None:
        user = self.store.find(identifier)
        if user is None or not verify_password(
            password, user.password_salt, user.password_hash
        ):
            return None
        return user

    def seed_admin(self) -> User:
        existing = self.store.find(self.settings.demo_admin_username)
        if existing is not None:
            return existing
        salt, digest = hash_password(self.settings.demo_admin_password.get_secret_value())
        user = User(
            id="admin",
            email="admin@finertia.local",
            username=self.settings.demo_admin_username,
            name="Admin",
            role="admin",
            password_salt=salt,
            password_hash=digest,
            created_at=datetime.now(UTC).isoformat(timespec="seconds"),
        )
        try:
            return self.store.create(user)
        except UserExists:
            return self.store.find(self.settings.demo_admin_username) or user
