"""
schemas.py — Contratos Pydantic v2 do ViaGuardian Backend.

Organização:
  • Ingress  — validação estrita dos payloads vindos do App Mobile
  • Triage   — requisições do Intelligence Center para triagem
  • Dashboard — respostas das rotas GET do painel web
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models import AnomalyClass, IncidentStatus


# ─────────────────────────────────────────────────────────────────────────────
# Ingress — App Mobile → Backend
# ─────────────────────────────────────────────────────────────────────────────

class GeoLocation(BaseModel):
    """Coordenada geográfica anonimizada (sem altitude ou precisão granular)."""

    lat: Annotated[float, Field(ge=-90.0, le=90.0, description="Latitude WGS-84")]
    lon: Annotated[float, Field(ge=-180.0, le=180.0, description="Longitude WGS-84")]


class IncidentPayload(BaseModel):
    """
    Contrato de entrada para um evento detectado pelo Edge AI (YOLOv8-Nano).

    Campos obrigatórios espelham exatamente o que o payloadBuilder.js gera:
      • device_fingerprint   — hash SHA-256 one-way do dispositivo
      • anomaly_class        — classe de detecção (enum AnomalyClass)
      • confidence_score     — confiança do modelo [0.0 – 1.0]
      • geo_location         — coordenada lat/lon
      • event_timestamp_utc  — carimbo temporal ISO 8601 em UTC
    """

    device_fingerprint: Annotated[
        str,
        Field(min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$"),
    ]
    anomaly_class: AnomalyClass
    confidence_score: Annotated[float, Field(ge=0.0, le=1.0)]
    geo_location: GeoLocation
    event_timestamp_utc: datetime

    @field_validator("event_timestamp_utc")
    @classmethod
    def timestamp_must_be_aware(cls, v: datetime) -> datetime:
        """Rejeita timestamps naive (sem timezone) para evitar ambiguidade."""
        if v.tzinfo is None:
            raise ValueError("event_timestamp_utc deve incluir informação de fuso horário (UTC).")
        return v

    model_config = {"str_strip_whitespace": True}


class TelemetryBatch(BaseModel):
    """
    Lote de payloads enviado pelo App Mobile ao final de uma sessão de condução.
    Limite de 500 eventos por lote para evitar sobrecarga transacional.
    """

    session_started_at: datetime | None = None
    distance_km: Annotated[float, Field(ge=0.0)] = 0.0
    total_xp_earned: Annotated[int, Field(ge=0)] = 0
    payloads: Annotated[list[IncidentPayload], Field(min_length=1, max_length=500)]


# ─────────────────────────────────────────────────────────────────────────────
# Ingress — Respostas
# ─────────────────────────────────────────────────────────────────────────────

class IngressSingleResponse(BaseModel):
    """Resposta para um único payload recebido."""

    action: Literal["created", "deduplicated"]
    incident_id: int
    recurrence_count: int
    message: str


class IngressBatchResponse(BaseModel):
    """Resposta resumida para um lote de payloads."""

    received: int
    created: int
    deduplicated: int
    rejected_below_threshold: int


# ─────────────────────────────────────────────────────────────────────────────
# Triage — Intelligence Center → Backend
# ─────────────────────────────────────────────────────────────────────────────

class TriageDecision(BaseModel):
    """Corpo da requisição PATCH para aprovar ou rejeitar um incidente."""

    status: Literal[IncidentStatus.APPROVED, IncidentStatus.REJECTED]


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard — Respostas GET
# ─────────────────────────────────────────────────────────────────────────────

class IncidentOut(BaseModel):
    """Representação resumida de um incidente para a fila de triagem."""

    id: int
    anomaly_class: AnomalyClass
    confidence_score: float
    latitude: float
    longitude: float
    recurrence_count: int
    status: IncidentStatus
    irv_score: float | None
    event_timestamp_utc: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class SeverityBreakdown(BaseModel):
    name: str
    value: int


class IncidentTrendPoint(BaseModel):
    day: str
    incidents: int
    approved: int


class HeatmapPoint(BaseModel):
    id: int
    lat: float
    lon: float
    intensity: float
    label: str


class DashboardMetrics(BaseModel):
    """Payload completo entregue ao Intelligence Center na rota GET /dashboard/metrics."""

    irv_score: float
    incidents_today: int
    high_risk_corridors: int
    response_time_avg: float
    trend_delta: float
    severity_breakdown: list[SeverityBreakdown]
    incident_trend: list[IncidentTrendPoint]
