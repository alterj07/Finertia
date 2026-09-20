from typing import Literal

from pydantic import BaseModel


class User(BaseModel):
    id: str
    email: str
    username: str
    name: str = ""
    role: Literal["admin", "member"] = "member"
    password_salt: str
    password_hash: str
    created_at: str


class UserOut(BaseModel):
    id: str
    email: str
    username: str
    name: str
    role: str
