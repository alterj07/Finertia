"""FastAPI dependency: resolve the current user from a Bearer token."""

from fastapi import HTTPException, Request

from app.auth.models import User
from app.auth.service import AuthError
from app.config import settings


def _unauthenticated() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def current_user(request: Request) -> User:
    auth = request.app.state.auth
    if not settings.auth_required:
        user = auth.store.find(settings.demo_admin_username)
        if user is None:
            user = auth.seed_admin()
        if user is None:
            raise HTTPException(status_code=503, detail="no admin user")
        return user
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthenticated()
    try:
        user_id = auth.decode_token(token)
    except AuthError:
        raise _unauthenticated() from None
    user = auth.store.get(user_id)
    if user is None:
        raise _unauthenticated()
    return user
