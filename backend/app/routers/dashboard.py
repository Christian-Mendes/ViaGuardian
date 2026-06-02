"""
routers/dashboard.py — Rotas GET que alimentam o Intelligence Center (painel React).

Rotas:
  GET /dashboard/metrics         — KPIs agregados para os cards do painel
  GET /dashboard/heatmap         — pontos de calor (intensidade por localização)
  GET /triage/queue              — fila de incidentes pendentes de triagem
  PATCH /triage/incidents/{id}/status — aprova ou rejeita um incidente
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Float, case, cast, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AnomalyClass, Incident, IncidentStatus
from app.schemas import (
    DashboardMetrics,
    HeatmapPoint,
    IncidentOut,
    IncidentTrendPoint,
    SeverityBreakdown,
    TriageDecision,
)

router = APIRouter(tags=["Dashboard & Triage"])

# Labels de classe para exibição no front-end
CLASS_LABELS: dict[AnomalyClass, str] = {
    AnomalyClass.NEAR_MISS:     "Quase-Acidentes",
    AnomalyClass.RISK_BEHAVIOR: "Comportamentos de Risco",
    AnomalyClass.POTHOLE:       "Buracos / Depressões",
    AnomalyClass.FADED_LANE:    "Sinalização Apagada",
    AnomalyClass.OBSTRUCTION:   "Obstruções de Via",
}

# Pesos de severidade para o cálculo de IRV agregado no dashboard
SEVERITY_WEIGHT: dict[AnomalyClass, float] = {
    AnomalyClass.NEAR_MISS:     1.0,
    AnomalyClass.RISK_BEHAVIOR: 0.85,
    AnomalyClass.POTHOLE:       0.55,
    AnomalyClass.OBSTRUCTION:   0.60,
    AnomalyClass.FADED_LANE:    0.40,
}

DAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard — Métricas Agregadas
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/dashboard/metrics",
    response_model=DashboardMetrics,
    summary="KPIs e métricas agregadas para o painel estratégico",
)
async def get_dashboard_metrics(
    db: AsyncSession = Depends(get_db),
) -> DashboardMetrics:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)
    prev_week_ago = now - timedelta(days=14)

    # ── Incidentes hoje ───────────────────────────────────────────────────────
    incidents_today_q = await db.execute(
        select(func.count(Incident.id)).where(
            Incident.event_timestamp_utc >= today_start,
            Incident.status != IncidentStatus.REJECTED,
        )
    )
    incidents_today: int = incidents_today_q.scalar_one() or 0

    # ── IRV médio ponderado dos últimos 7 dias ────────────────────────────────
    irv_q = await db.execute(
        select(func.avg(Incident.irv_score)).where(
            Incident.event_timestamp_utc >= week_ago,
            Incident.irv_score.is_not(None),
            Incident.status != IncidentStatus.REJECTED,
        )
    )
    irv_score: float = round(irv_q.scalar_one() or 0.0, 1)

    # ── Delta de tendência (semana atual vs semana anterior) ──────────────────
    prev_week_q = await db.execute(
        select(func.count(Incident.id)).where(
            Incident.event_timestamp_utc >= prev_week_ago,
            Incident.event_timestamp_utc < week_ago,
            Incident.status != IncidentStatus.REJECTED,
        )
    )
    current_week_q = await db.execute(
        select(func.count(Incident.id)).where(
            Incident.event_timestamp_utc >= week_ago,
            Incident.status != IncidentStatus.REJECTED,
        )
    )
    prev_week_count: int = prev_week_q.scalar_one() or 1  # evita divisão por zero
    current_week_count: int = current_week_q.scalar_one() or 0
    trend_delta = round((current_week_count - prev_week_count) / prev_week_count * 100, 1)

    # ── Corredores de alto risco (locais com IRV > 70) ────────────────────────
    corridors_q = await db.execute(
        select(func.count(Incident.id)).where(
            Incident.irv_score >= 70,
            Incident.status != IncidentStatus.REJECTED,
        )
    )
    high_risk_corridors: int = corridors_q.scalar_one() or 0

    # ── SLA médio simulado (em produção: tabela de ordens de serviço) ─────────
    response_time_avg: float = 7.2  # minutos — placeholder para tabela de O.S.

    # ── Distribuição por severidade (rosca do dashboard) ─────────────────────
    severity_q = await db.execute(
        select(Incident.anomaly_class, func.count(Incident.id))
        .where(Incident.status != IncidentStatus.REJECTED)
        .group_by(Incident.anomaly_class)
    )
    severity_rows = severity_q.all()
    severity_breakdown = [
        SeverityBreakdown(name=CLASS_LABELS.get(row[0], str(row[0])), value=row[1])
        for row in severity_rows
    ]

    # ── Tendência semanal (gráfico de linha) ──────────────────────────────────
    incident_trend: list[IncidentTrendPoint] = []
    for i in range(6, -1, -1):
        day_start = (now - timedelta(days=i)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        day_end = day_start + timedelta(days=1)
        day_label = DAYS_PT[day_start.weekday()]

        day_total_q = await db.execute(
            select(func.count(Incident.id)).where(
                Incident.event_timestamp_utc >= day_start,
                Incident.event_timestamp_utc < day_end,
                Incident.status != IncidentStatus.REJECTED,
            )
        )
        day_approved_q = await db.execute(
            select(func.count(Incident.id)).where(
                Incident.event_timestamp_utc >= day_start,
                Incident.event_timestamp_utc < day_end,
                Incident.status == IncidentStatus.APPROVED,
            )
        )
        incident_trend.append(
            IncidentTrendPoint(
                day=day_label,
                incidents=day_total_q.scalar_one() or 0,
                approved=day_approved_q.scalar_one() or 0,
            )
        )

    return DashboardMetrics(
        irv_score=irv_score,
        incidents_today=incidents_today,
        high_risk_corridors=high_risk_corridors,
        response_time_avg=response_time_avg,
        trend_delta=trend_delta,
        severity_breakdown=severity_breakdown,
        incident_trend=incident_trend,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard — Heatmap
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/dashboard/heatmap",
    response_model=list[HeatmapPoint],
    summary="Pontos georreferenciados para o mapa de calor preditivo",
)
async def get_heatmap_data(
    db: AsyncSession = Depends(get_db),
) -> list[HeatmapPoint]:
    """
    Retorna incidentes ativos ordenados por IRV para renderização do heatmap.
    A intensidade é normalizada [0.0 – 1.0] para uso direto no componente SVG.
    """
    q = await db.execute(
        select(Incident)
        .where(
            Incident.status != IncidentStatus.REJECTED,
            Incident.irv_score.is_not(None),
        )
        .order_by(Incident.irv_score.desc())
        .limit(50)
    )
    incidents = q.scalars().all()

    if not incidents:
        return []

    max_irv = max(i.irv_score for i in incidents if i.irv_score) or 1.0

    return [
        HeatmapPoint(
            id=inc.id,
            lat=inc.latitude,
            lon=inc.longitude,
            intensity=round((inc.irv_score or 0) / max_irv, 3),
            label=CLASS_LABELS.get(inc.anomaly_class, inc.anomaly_class),
        )
        for inc in incidents
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Triage — Fila de Incidentes
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/triage/queue",
    response_model=list[IncidentOut],
    summary="Fila de incidentes pendentes para triagem operacional",
)
async def get_triage_queue(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> list[IncidentOut]:
    """
    Retorna incidentes com status PENDING, ordenados por IRV decrescente.
    Incidentes com maior risco calculado aparecem no topo da fila.
    """
    q = await db.execute(
        select(Incident)
        .where(Incident.status == IncidentStatus.PENDING)
        .order_by(Incident.irv_score.desc().nulls_last())
        .limit(min(limit, 200))
    )
    return q.scalars().all()


# ─────────────────────────────────────────────────────────────────────────────
# Triage — Decisão (Aprovar / Rejeitar)
# ─────────────────────────────────────────────────────────────────────────────

@router.patch(
    "/triage/incidents/{incident_id}/status",
    response_model=IncidentOut,
    summary="Aprova ou rejeita um incidente da fila de triagem",
)
async def update_incident_status(
    incident_id: int,
    decision: TriageDecision,
    db: AsyncSession = Depends(get_db),
) -> IncidentOut:
    q = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident: Incident | None = q.scalar_one_or_none()

    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incidente #{incident_id} não encontrado.",
        )

    if incident.status != IncidentStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Incidente #{incident_id} já foi processado "
                f"(status atual: {incident.status})."
            ),
        )

    await db.execute(
        update(Incident)
        .where(Incident.id == incident_id)
        .values(status=decision.status)
    )
    await db.flush()
    await db.refresh(incident)
    return incident
