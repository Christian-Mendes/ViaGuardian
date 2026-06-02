"""
routers/ingress.py — Ingestão de dados do App Mobile (Edge AI → Backend).

Rotas:
  POST /ingress/event        — recebe um único payload do sensor
  POST /ingress/batch        — recebe lote de payloads ao fim da sessão de condução

Motor de Deduplicação Idempotente (PostGIS + R-Tree):
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  Para cada payload recebido:                                              │
  │                                                                           │
  │  1. Filtra por anomaly_class e janela temporal de 24h                    │
  │  2. Usa ST_DWithin(location, ponto_novo, 12.0) — busca R-Tree espacial   │
  │  3a. Se encontrar registro existente → UPDATE recurrence_count + 1       │
  │  3b. Se NÃO encontrar → INSERT novo registro                              │
  │                                                                           │
  │  Resultado: uma anomalia real reportada por N sensores distintos gera     │
  │  apenas 1 registro no banco, com recurrence_count = N.                   │
  └──────────────────────────────────────────────────────────────────────────┘

Cálculo do IRV (Índice de Risco Viário):
  IRV = (Wa × recurrence_count) + (Wh × historical_score)
  • Wa = 0.6  (peso de anomalia — dados da borda)
  • Wh = 0.4  (peso histórico — referência Infosiga SP simulada)
  • historical_score = estimativa baseada na classe da anomalia
"""

import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, literal, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import AnomalyClass, Incident, IncidentStatus
from app.schemas import (
    IngressBatchResponse,
    IngressSingleResponse,
    IncidentPayload,
    TelemetryBatch,
)

router = APIRouter(prefix="/ingress", tags=["Ingress"])

# ─────────────────────────────────────────────────────────────────────────────
# Pesos e scores base para cálculo do IRV
# ─────────────────────────────────────────────────────────────────────────────

IRV_Wa: float = 0.6   # peso da anomalia (dados de borda)
IRV_Wh: float = 0.4   # peso histórico (Infosiga SP)

# Score histórico base por classe (0–10), derivado de análise do Infosiga SP.
# Em produção, buscar da tabela `historical_risk_scores` no PostgreSQL.
HISTORICAL_SCORE_BY_CLASS: dict[AnomalyClass, float] = {
    AnomalyClass.NEAR_MISS:     9.5,
    AnomalyClass.RISK_BEHAVIOR: 8.0,
    AnomalyClass.POTHOLE:       5.5,
    AnomalyClass.FADED_LANE:    4.0,
    AnomalyClass.OBSTRUCTION:   6.0,
}


def calculate_irv(recurrence_count: int, anomaly_class: AnomalyClass) -> float:
    """
    IRV = (Wa × D) + (Wh × S)
      D = recurrence_count  (volume de detecções validadas)
      S = historical_score  (incidência de sinistros governamentais)
    """
    historical_score = HISTORICAL_SCORE_BY_CLASS.get(anomaly_class, 5.0)
    raw = (IRV_Wa * recurrence_count) + (IRV_Wh * historical_score)
    # Normaliza para escala 0–100 (D máximo esperado = 50 detecções por ponto)
    return round(min(raw / ((IRV_Wa * 50) + (IRV_Wh * 10)) * 100, 100.0), 2)


# ─────────────────────────────────────────────────────────────────────────────
# Função central: deduplicação + persistência
# ─────────────────────────────────────────────────────────────────────────────

def _build_point_wkt(lat: float, lon: float) -> str:
    """Gera string WKT para ST_GeomFromText. Ordem PostGIS: lon lat."""
    return f"POINT({lon} {lat})"


async def _upsert_incident(
    payload: IncidentPayload,
    db: AsyncSession,
) -> tuple[Incident, bool]:
    """
    Tenta deduplicar o payload. Retorna (incident, was_created).

    Deduplicação via PostGIS ST_DWithin:
      • Raio: settings.DEDUP_RADIUS_METERS (padrão 12m)
      • Janela temporal: settings.DEDUP_WINDOW_HOURS (padrão 24h)
      • Mesma anomaly_class

    ST_DWithin usa o índice GIST da coluna `location`, garantindo
    complexidade de busca O(log n) via R-Tree.
    """
    point_wkt = _build_point_wkt(payload.geo_location.lat, payload.geo_location.lon)
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=settings.DEDUP_WINDOW_HOURS)

    # ── Query de deduplicação ─────────────────────────────────────────────────
    # ST_DWithin(geography, geography, meters) — compara em metros sobre esferoide
    dedup_query = (
        select(Incident)
        .where(
            Incident.anomaly_class == payload.anomaly_class,
            Incident.event_timestamp_utc >= cutoff_time,
            Incident.status != IncidentStatus.REJECTED,
            func.ST_DWithin(
                func.ST_GeogFromWKB(Incident.location),
                func.ST_GeogFromText(literal(point_wkt)),
                settings.DEDUP_RADIUS_METERS,
            ),
        )
        .order_by(Incident.event_timestamp_utc.desc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )

    result = await db.execute(dedup_query)
    existing: Incident | None = result.scalar_one_or_none()

    # ── Caso 1: registro duplicado encontrado → UPDATE ────────────────────────
    if existing is not None:
        new_recurrence = existing.recurrence_count + 1
        await db.execute(
            update(Incident)
            .where(Incident.id == existing.id)
            .values(
                recurrence_count=new_recurrence,
                irv_score=calculate_irv(new_recurrence, existing.anomaly_class),
            )
        )
        await db.flush()
        await db.refresh(existing)
        return existing, False

    # ── Caso 2: novo registro → INSERT ───────────────────────────────────────
    new_incident = Incident(
        device_fingerprint=payload.device_fingerprint,
        anomaly_class=payload.anomaly_class,
        confidence_score=payload.confidence_score,
        location=func.ST_GeomFromText(point_wkt, 4326),
        latitude=payload.geo_location.lat,
        longitude=payload.geo_location.lon,
        event_timestamp_utc=payload.event_timestamp_utc,
        recurrence_count=1,
        status=IncidentStatus.PENDING,
        irv_score=calculate_irv(1, payload.anomaly_class),
    )
    db.add(new_incident)
    await db.flush()   # obtém o ID gerado sem fechar a transação
    return new_incident, True


# ─────────────────────────────────────────────────────────────────────────────
# Rotas
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/event",
    response_model=IngressSingleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Recebe um único evento de telemetria do App Mobile",
)
async def ingest_single_event(
    payload: IncidentPayload,
    db: AsyncSession = Depends(get_db),
) -> IngressSingleResponse:
    """
    Endpoint consumido pelo App Mobile após cada detecção individual.

    Rejeita payloads com confidence_score abaixo do limiar configurado
    (`MIN_CONFIDENCE_SCORE`) antes de qualquer operação no banco,
    economizando I/O para falsos positivos de baixa qualidade.
    """
    if payload.confidence_score < settings.MIN_CONFIDENCE_SCORE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"confidence_score {payload.confidence_score:.2f} abaixo do limiar "
                f"mínimo {settings.MIN_CONFIDENCE_SCORE:.2f}."
            ),
        )

    incident, was_created = await _upsert_incident(payload, db)

    action: str = "created" if was_created else "deduplicated"
    message = (
        "Novo incidente registrado."
        if was_created
        else f"Payload fundido ao incidente #{incident.id} "
             f"(reincidência #{incident.recurrence_count})."
    )

    return IngressSingleResponse(
        action=action,
        incident_id=incident.id,
        recurrence_count=incident.recurrence_count,
        message=message,
    )


@router.post(
    "/batch",
    response_model=IngressBatchResponse,
    status_code=status.HTTP_200_OK,
    summary="Recebe lote de eventos ao fim de uma sessão de condução",
)
async def ingest_batch(
    batch: TelemetryBatch,
    db: AsyncSession = Depends(get_db),
) -> IngressBatchResponse:
    """
    Endpoint chamado pelo App Mobile após o motociclista parar o veículo.
    Processa cada payload do lote individualmente dentro da mesma transação,
    aplicando a deduplicação para cada evento.
    """
    created_count = 0
    dedup_count = 0
    rejected_count = 0

    for payload in batch.payloads:
        if payload.confidence_score < settings.MIN_CONFIDENCE_SCORE:
            rejected_count += 1
            continue

        _, was_created = await _upsert_incident(payload, db)
        if was_created:
            created_count += 1
        else:
            dedup_count += 1

    return IngressBatchResponse(
        received=len(batch.payloads),
        created=created_count,
        deduplicated=dedup_count,
        rejected_below_threshold=rejected_count,
    )
