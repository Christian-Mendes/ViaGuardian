"""
config.py — Configurações centralizadas via Pydantic Settings.

Lê variáveis de ambiente (ou .env em desenvolvimento) e as expõe
como atributos tipados para todo o projeto.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Banco de dados
    DATABASE_URL: str = (
        "postgresql+asyncpg://viaguardian:viaguardian_secret@localhost:5432/viaguardian"
    )
    DB_ECHO: bool = False

    # Segurança
    API_SECRET_KEY: str = "change-me-in-production"

    # CORS — lista separada por vírgulas
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Regras de negócio do motor de deduplicação
    DEDUP_RADIUS_METERS: float = 12.0
    DEDUP_WINDOW_HOURS: int = 24

    # Limiar mínimo de confiança aceito pelo ingress
    MIN_CONFIDENCE_SCORE: float = 0.50

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]


settings = Settings()
