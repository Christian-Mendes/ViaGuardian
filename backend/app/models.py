"""
models.py — Entidades ORM (SQLAlchemy 2.0 + GeoAlchemy2).

Tabelas:
  • incidents — registro central de anomalias viárias detectadas pelo Edge AI.
               A localização é armazenada como POINT(lon lat) SRID 4326 (WGS-84),
               compatível com o PostGIS e exportável para GeoJSON.

Enum de status reflete o fluxo de triagem do Intelligence Center:
  PENDING  → payload recebido, aguarda análise do gestor
  APPROVED → O.S. aprovada, enviada para equipe de campo
  REJECTED → payload descartado pelo gestor (falso positivo)
"""

import enum
from datetime import datetime, timezone

from geoalchemy2 import Geometry
from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ─────────────────────────────────────────────────────────────────────────────
# Enumerações
# ─────────────────────────────────────────────────────────────────────────────

class AnomalyClass(str, enum.Enum):
    POTHOLE       = "pothole"
    FADED_LANE    = "faded_lane"
    NEAR_MISS     = "near_miss"
    RISK_BEHAVIOR = "risk_behavior"
    OBSTRUCTION   = "obstruction"


class IncidentStatus(str, enum.Enum):
    PENDING  = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


# ─────────────────────────────────────────────────────────────────────────────
# Entidade Principal
# ─────────────────────────────────────────────────────────────────────────────

class Incident(Base):
    """
    Representa uma anomalia viária detectada e validada pelo backend.

    Campos espaciais:
      location — POINT(longitude latitude) no SRID 4326 (WGS-84).
                 Indexado com GIST para operações ST_DWithin eficientes.

    Motor de deduplicação:
      recurrence_count — incrementado quando um payload duplicado chega
                         dentro do raio e janela temporal configurados.
                         Permite avaliar persistência da anomalia na via.
    """

    __tablename__ = "incidents"

    # ── Chave primária ────────────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ── Identificação do payload (rastreabilidade anônima) ────────────────────
    device_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # ── Classificação da anomalia ─────────────────────────────────────────────
    anomaly_class: Mapped[AnomalyClass] = mapped_column(
        Enum(AnomalyClass, name="anomaly_class_enum"),
        nullable=False,
        index=True,
    )

    # ── Score de confiança do modelo YOLOv8-Nano [0.0 – 1.0] ─────────────────
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)

    # ── Geometria espacial (PostGIS) ──────────────────────────────────────────
    # Tipo POINT com SRID 4326 (latitude/longitude WGS-84)
    location: Mapped[Geometry] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326),
        nullable=False,
    )

    # ── Coordenadas brutas (desnormalizadas para queries analíticas rápidas) ──
    latitude:  Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    # ── Timestamps ────────────────────────────────────────────────────────────
    event_timestamp_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── Motor de Deduplicação ─────────────────────────────────────────────────
    recurrence_count: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
        comment="Número de payloads duplicados fundidos neste registro (raio 12m / 24h)",
    )

    # ── Triagem ───────────────────────────────────────────────────────────────
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus, name="incident_status_enum"),
        default=IncidentStatus.PENDING,
        nullable=False,
        index=True,
    )

    # ── IRV calculado (desnormalizado para performance de dashboard) ──────────
    irv_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Índice de Risco Viário = (Wa * recurrence_count) + (Wh * historical_score)",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # Índices compostos
    # ─────────────────────────────────────────────────────────────────────────
    __table_args__ = (
        # Índice GIST para consultas espaciais ST_DWithin (motor de dedup)
        Index("ix_incidents_location_gist", "location", postgresql_using="gist"),
        # Índice composto para a query de deduplicação
        Index("ix_incidents_class_time", "anomaly_class", "event_timestamp_utc"),
    )

    def __repr__(self) -> str:
        return (
            f"<Incident id={self.id} class={self.anomaly_class} "
            f"status={self.status} recurrence={self.recurrence_count}>"
        )
