import os, json, time, hashlib, secrets
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session
from sqlalchemy import String, Text, Float, select
from argon2 import PasswordHasher


class Base(DeclarativeBase):
    """Declarative model registry."""


class Record(Base):
    __tablename__ = "records"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    owner: Mapped[str] = mapped_column(String(160), index=True)
    kind: Mapped[str] = mapped_column(String(30), index=True)
    payload: Mapped[str] = mapped_column(Text)
    updated: Mapped[float] = mapped_column(Float)


class Account(Base):
    __tablename__ = "accounts"
    email: Mapped[str] = mapped_column(String(160), primary_key=True)
    password_hash: Mapped[str] = mapped_column(Text)


class LoginSession(Base):
    __tablename__ = "login_sessions"
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner: Mapped[str] = mapped_column(String(160))
    expires: Mapped[float] = mapped_column(Float)


DB_URL = os.environ.get("DATABASE_URL", "sqlite:///./timetablegenie.db")
engine = create_engine(
    DB_URL,
    connect_args=(
        {"check_same_thread": False, "timeout": 30}
        if DB_URL.startswith("sqlite")
        else {}
    ),
    pool_pre_ping=True,
)
hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)


def initialize():
    Base.metadata.create_all(engine)
    if DB_URL.startswith("sqlite"):
        with engine.connect() as c:
            c.execute(text("PRAGMA journal_mode=WAL"))
            c.commit()
    password = os.environ.get("ADMIN_PASSWORD")
    if password:
        email = os.environ.get("ADMIN_EMAIL", "admin@local.test")
        with Session(engine) as s:
            account = s.get(Account, email)
            if not account:
                s.add(Account(email=email, password_hash=hasher.hash(password)))
                s.commit()


def put(id, owner, kind, payload):
    with Session(engine) as s:
        row = s.get(Record, id)
        if row and row.owner != owner:
            raise PermissionError("Record owner mismatch")
        if not row:
            row = Record(id=id, owner=owner, kind=kind, payload="", updated=time.time())
            s.add(row)
        row.payload = json.dumps(payload, ensure_ascii=False)
        row.updated = time.time()
        s.commit()


def get(id, owner=None):
    with Session(engine) as s:
        row = s.get(Record, id)
        if not row or (owner is not None and row.owner != owner):
            return None
        return json.loads(row.payload)


def mutate(id, change, owner=None):
    """Serialize read-modify-write so cancellation survives concurrent heartbeats."""
    with Session(engine) as s:
        if DB_URL.startswith("sqlite"):
            s.connection().exec_driver_sql("BEGIN IMMEDIATE")
        row = s.execute(
            select(Record).where(Record.id == id).with_for_update()
        ).scalar_one_or_none()
        if not row or (owner is not None and row.owner != owner):
            return None
        data = json.loads(row.payload)
        change(data)
        row.payload = json.dumps(data, ensure_ascii=False)
        row.updated = time.time()
        s.commit()
        return data


def listed(owner, kind, limit=30):
    with Session(engine) as s:
        return [
            json.loads(row.payload)
            for row in s.query(Record)
            .filter_by(owner=owner, kind=kind)
            .order_by(Record.updated.desc())
            .limit(limit)
        ]


def login(email, password):
    with Session(engine) as s:
        a = s.get(Account, email)
        if not a:
            return None
        try:
            hasher.verify(a.password_hash, password)
        except Exception:
            return None
        token = secrets.token_urlsafe(32)
        s.add(
            LoginSession(
                digest=hashlib.sha256(token.encode()).hexdigest(),
                owner=email,
                expires=time.time() + 86400,
            )
        )
        s.commit()
        return token


def owner_for(token):
    if not token:
        return None
    with Session(engine) as s:
        row = s.get(LoginSession, hashlib.sha256(token.encode()).hexdigest())
        return row.owner if row and row.expires > time.time() else None


def logout(token):
    if not token:
        return
    with Session(engine) as s:
        row = s.get(LoginSession, hashlib.sha256(token.encode()).hexdigest())
        if row:
            s.delete(row)
            s.commit()
