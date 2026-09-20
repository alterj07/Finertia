from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.auth.deps import current_user
from app.auth.models import User, UserOut
from app.auth.store import UserExists

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str = ""


class LoginRequest(BaseModel):
    identifier: str
    password: str


class TokenResponse(BaseModel):
    token: str
    user: UserOut


def _out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        name=user.name,
        role=user.role,
    )


@router.post("/signup", status_code=201)
def signup(req: SignupRequest, request: Request) -> TokenResponse:
    auth = request.app.state.auth
    try:
        user = auth.signup(req.email, req.password, req.name)
    except UserExists as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return TokenResponse(token=auth.create_token(user), user=_out(user))


@router.post("/login")
def login(req: LoginRequest, request: Request) -> TokenResponse:
    auth = request.app.state.auth
    user = auth.login(req.identifier, req.password)
    if user is None:
        raise HTTPException(status_code=401, detail="invalid credentials")
    return TokenResponse(token=auth.create_token(user), user=_out(user))


@router.get("/me")
def me(user: User = Depends(current_user)) -> UserOut:
    return _out(user)
