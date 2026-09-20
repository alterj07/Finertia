"""UserStore: account persistence — JSON file locally, ES index in elastic mode."""

import json
from pathlib import Path
from typing import Protocol

from app.auth.models import User
from app.data.es_store import ElasticStore

USERS_INDEX = "users"

_USER_MAPPING = {
    "properties": {
        "id": {"type": "keyword"},
        "email": {"type": "keyword"},
        "username": {"type": "keyword"},
        "name": {"type": "keyword"},
        "role": {"type": "keyword"},
        "password_salt": {"type": "keyword"},
        "password_hash": {"type": "keyword"},
        "created_at": {"type": "keyword"},
    }
}


class UserExists(Exception):
    pass


class UserStore(Protocol):
    def get(self, id: str) -> User | None: ...
    def find(self, identifier: str) -> User | None: ...
    def create(self, user: User) -> User: ...
    def update(self, user: User) -> User: ...
    def count(self) -> int: ...


class LocalUserStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.users: list[User] = []
        if path.exists():
            self.users = [User(**u) for u in json.loads(path.read_text())]

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps([u.model_dump(mode="json") for u in self.users], indent=2)
        )

    def get(self, id: str) -> User | None:
        return next((u for u in self.users if u.id == id), None)

    def find(self, identifier: str) -> User | None:
        ident = identifier.lower()
        return next(
            (u for u in self.users if u.email.lower() == ident or u.username.lower() == ident),
            None,
        )

    def create(self, user: User) -> User:
        if self.find(user.email) or self.find(user.username):
            raise UserExists("email or username already registered")
        self.users.append(user)
        self._save()
        return user

    def update(self, user: User) -> User:
        self.users = [user if u.id == user.id else u for u in self.users]
        self._save()
        return user

    def count(self) -> int:
        return len(self.users)


class ElasticUserStore:
    def __init__(self, store: ElasticStore) -> None:
        self.store = store
        store.create_index(USERS_INDEX, _USER_MAPPING)

    def _name(self) -> str:
        return self.store.name(USERS_INDEX)

    def get(self, id: str) -> User | None:
        try:
            res = self.store.es.get(index=self._name(), id=id)
        except Exception:
            return None
        return User(**res["_source"])

    def find(self, identifier: str) -> User | None:
        ident = identifier.lower()
        hits = self.store.search(
            USERS_INDEX,
            query={
                "bool": {
                    "should": [
                        {"term": {"email": ident}},
                        {"term": {"username": ident}},
                    ],
                    "minimum_should_match": 1,
                }
            },
            size=1,
        )
        return User(**{k: v for k, v in hits[0].items() if k != "_score"}) if hits else None

    def create(self, user: User) -> User:
        if self.find(user.email) or self.find(user.username):
            raise UserExists("email or username already registered")
        self.store.es.index(
            index=self._name(),
            id=user.id,
            document=user.model_dump(mode="json"),
            refresh="wait_for",
        )
        return user

    def update(self, user: User) -> User:
        self.store.es.index(
            index=self._name(),
            id=user.id,
            document=user.model_dump(mode="json"),
            refresh="wait_for",
        )
        return user

    def count(self) -> int:
        return self.store.count(USERS_INDEX)
