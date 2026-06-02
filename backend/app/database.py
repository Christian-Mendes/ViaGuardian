"""
database.py — Configuração do SQLAlchemy 2.0 assíncrono com PostGIS.

Expõe:
  • engine          — AsyncEngine conectado ao PostgreSQL
  • AsyncSessionLocal — fábrica de sessões assíncronas
  • Base             — DeclarativeBase para todos os models
  • get_db           — dependency do FastAPI que injeta a sessão por requisição
  • create_tables    — cria as tabelas no startup (substitua por Alembic em prod)
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


# ─────────────────────────────────────────────────────────────────────────────
# Engine assíncrono
# ─────────────────────────────────────────────────────────────────────────────

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,          # loga SQL apenas em desenvolvimento
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,             # valida conexão antes de reutilizar
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,         # evita lazy-load após commit em contexto async
)


# ─────────────────────────────────────────────────────────────────────────────
# Base declarativa (herdada por todos os Models)
# ─────────────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ─────────────────────────────────────────────────────────────────────────────
# Dependency FastAPI — injeta sessão por request e garante rollback em erro
# ─────────────────────────────────────────────────────────────────────────────

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ─────────────────────────────────────────────────────────────────────────────
# Criação das tabelas (startup)
# Em produção use: alembic upgrade head
# ─────────────────────────────────────────────────────────────────────────────

async def create_tables() -> None:
    async with engine.begin() as conn:
        # Garante que a extensão PostGIS está ativa antes de criar geometrias
        await conn.execute(__import__("sqlalchemy").text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        await conn.run_sync(Base.metadata.create_all)
