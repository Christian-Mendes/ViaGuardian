"""
main.py — Ponto de entrada da API ViaGuardian.

Responsabilidades:
  • Lifespan: cria tabelas e extensão PostGIS no startup
  • Scheduler: job noturno (03:00 America/Sao_Paulo) de sincronização Infosiga SP
  • CORS: libera origens configuradas em CORS_ORIGINS
  • Middleware: logging de requisições e medição de latência
  • Routers: ingress (borda + worker CFTV), dashboard (painel), triage (triagem)
  • /health: endpoint de health check para Docker e load balancer

Workers externos (scripts independentes, não fazem parte desta ASGI app):
  • worker_cftv.py — captura frames RTSP de câmeras públicas e envia via
                     POST /ingress/event usando o mesmo contrato do App Mobile.
"""

import logging
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.database import create_tables
from app.routers.dashboard import router as dashboard_router
from app.routers.ingress import router as ingress_router
from app.services.infosiga_sync import sync_infosiga_data

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("viaguardian.api")


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan (startup / shutdown)
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Executa no startup:
      1. Cria a extensão PostGIS (CREATE EXTENSION IF NOT EXISTS postgis)
      2. Executa Base.metadata.create_all para criar/atualizar tabelas ORM
      3. Inicia o APScheduler com job noturno de sincronização Infosiga SP

    Em produção com Alembic, substituir create_tables() por alembic upgrade head.
    """
    logger.info("Iniciando ViaGuardian Intelligence API…")
    await create_tables()
    logger.info("PostGIS + tabelas prontas. API disponível.")

    # ── Scheduler: sync noturno Infosiga SP ──────────────────────────────────
    scheduler = AsyncIOScheduler(timezone="America/Sao_Paulo")
    scheduler.add_job(
        sync_infosiga_data,
        trigger=CronTrigger(hour=3, minute=0),  # todos os dias às 03:00
        id="infosiga_sync",
        name="Sincronização Noturna Infosiga SP",
        replace_existing=True,
        misfire_grace_time=3600,  # tolera até 1h de atraso (ex: reinício do container)
    )
    scheduler.start()
    logger.info(
        "Scheduler iniciado — job 'infosiga_sync' agendado para 03:00 (America/Sao_Paulo)."
    )

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────────
    scheduler.shutdown(wait=False)
    logger.info("Scheduler encerrado. API finalizada.")


# ─────────────────────────────────────────────────────────────────────────────
# Middleware de latência
# ─────────────────────────────────────────────────────────────────────────────

class LatencyMiddleware(BaseHTTPMiddleware):
    """Adiciona o header X-Process-Time (ms) em todas as respostas."""

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        response.headers["X-Process-Time"] = f"{elapsed_ms}ms"
        logger.info(
            "%s %s → %d [%sms]",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        return response


# ─────────────────────────────────────────────────────────────────────────────
# Aplicação FastAPI
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ViaGuardian Intelligence API",
    description=(
        "Backend de ingestão de telemetria de borda e fornecimento de métricas "
        "preditivas para o Intelligence Center. "
        "Motor de deduplicação espacial via PostGIS ST_DWithin."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)

# ── Latência ─────────────────────────────────────────────────────────────────
app.add_middleware(LatencyMiddleware)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(ingress_router)    # /ingress/event, /ingress/batch
app.include_router(dashboard_router)  # /dashboard/metrics, /dashboard/heatmap,
                                      # /triage/queue, /triage/incidents/{id}/status


# ─────────────────────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["Infra"], summary="Health check para Docker e load balancer")
async def health() -> dict:
    return {"status": "ok", "service": "viaguardian-api"}
