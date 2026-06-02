"""
scripts/seed_real_data.py — Injeção de dados reais/simulados no PostGIS.

Uso:
    docker-compose exec api python scripts/seed_real_data.py

O script:
  1. Limpa a tabela incidents (truncate cascade)
  2. Injeta eventos em coordenadas reais das vias mais perigosas de SP
  3. Gera eventos duplicados (coordenadas deslocadas < 12m) para acionar
     o motor de deduplicação ST_DWithin — consolidando recurrence_count e
     recalculando o IRV a cada batida
  4. Imprime progresso e resumo final
"""

import asyncio
import hashlib
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Garante que o diretório raiz do backend esteja no sys.path ───────────────
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import text

from app.database import AsyncSessionLocal, create_tables
from app.models import AnomalyClass, Incident
from app.routers.ingress import _upsert_incident
from app.schemas import GeoLocation, IncidentPayload


# ─────────────────────────────────────────────────────────────────────────────
# Vias críticas de São Paulo (coordenadas reais, lat/lon WGS-84)
# Fontes: Infosiga SP, CETSP, Atlas da Mobilidade Urbana
# ─────────────────────────────────────────────────────────────────────────────

HOTSPOTS: list[dict] = [
    # ── Marginal Tietê ───────────────────────────────────────────────────────
    {"via": "Marginal Tietê — Ponte das Bandeiras",       "lat": -23.5209, "lon": -46.6333, "peso": 5},
    {"via": "Marginal Tietê — Ponte da Casa Verde",       "lat": -23.5085, "lon": -46.6521, "peso": 4},
    {"via": "Marginal Tietê — Complexo Viário Jacu-Pêssego","lat": -23.4960,"lon": -46.4085, "peso": 4},
    {"via": "Marginal Tietê — Interligação Rodovia Ayrton Senna","lat": -23.5020,"lon": -46.4230, "peso": 3},

    # ── Marginal Pinheiros ───────────────────────────────────────────────────
    {"via": "Marginal Pinheiros — Pont. Eusébio Matoso",  "lat": -23.5620, "lon": -46.7020, "peso": 5},
    {"via": "Marginal Pinheiros — Ponte Ari Torres",      "lat": -23.5780, "lon": -46.6930, "peso": 4},
    {"via": "Marginal Pinheiros — Interlig. Rod. Raposo Tavares","lat": -23.5850,"lon": -46.7200, "peso": 3},

    # ── Av. 23 de Maio ───────────────────────────────────────────────────────
    {"via": "Av. 23 de Maio — Túnel Ayrton Senna (saída)","lat": -23.5870, "lon": -46.6390, "peso": 5},
    {"via": "Av. 23 de Maio — Acesso Ibirapuera",         "lat": -23.5920, "lon": -46.6570, "peso": 4},
    {"via": "Av. 23 de Maio — Cruzamento Vergueiro",      "lat": -23.5945, "lon": -46.6400, "peso": 3},

    # ── Corredor Norte-Sul (Rebouças / Centro) ───────────────────────────────
    {"via": "Túnel Rebouças — Entrada Jardins",           "lat": -23.5600, "lon": -46.6700, "peso": 5},
    {"via": "Av. Nove de Julho — Acesso Paulista",        "lat": -23.5650, "lon": -46.6540, "peso": 3},
    {"via": "Corredor Norte-Sul — Centro (Boa Vista)",    "lat": -23.5460, "lon": -46.6330, "peso": 4},

    # ── Av. Paulista ─────────────────────────────────────────────────────────
    {"via": "Av. Paulista — MASP",                        "lat": -23.5613, "lon": -46.6558, "peso": 3},
    {"via": "Av. Paulista — Consolação",                  "lat": -23.5579, "lon": -46.6628, "peso": 3},

    # ── Radial Leste / Av. Celso Garcia ─────────────────────────────────────
    {"via": "Radial Leste — Brás (saída Tietê)",          "lat": -23.5420, "lon": -46.6190, "peso": 5},
    {"via": "Radial Leste — Tatuapé",                     "lat": -23.5370, "lon": -46.5760, "peso": 4},
    {"via": "Av. Celso Garcia — Penha",                   "lat": -23.5260, "lon": -46.5410, "peso": 4},

    # ── Rodovia dos Imigrantes / Anchieta (acesso SP) ────────────────────────
    {"via": "Rod. dos Imigrantes — km 16 (SP)",           "lat": -23.6550, "lon": -46.6100, "peso": 5},
    {"via": "Rod. Anchieta — km 12 (SP)",                 "lat": -23.6650, "lon": -46.6150, "peso": 5},

    # ── Zona Leste / Av. Aricanduva ─────────────────────────────────────────
    {"via": "Av. Aricanduva — Shopping Aricanduva",       "lat": -23.5490, "lon": -46.5100, "peso": 4},
    {"via": "Av. Aricanduva — Cruzamento São Miguel",     "lat": -23.5030, "lon": -46.4490, "peso": 3},

    # ── Av. dos Bandeirantes / Jabaquara ────────────────────────────────────
    {"via": "Av. dos Bandeirantes — Interlig. 23 de Maio","lat": -23.6200, "lon": -46.6450, "peso": 4},
    {"via": "Av. dos Bandeirantes — Saída Santo André",   "lat": -23.6380, "lon": -46.6050, "peso": 3},
]

# Distribuição de classes por peso de risco
CLASS_POOL_BY_PESO: dict[int, list[tuple[AnomalyClass, float]]] = {
    # (classe, probabilidade_relativa)
    5: [
        (AnomalyClass.NEAR_MISS,     0.35),
        (AnomalyClass.RISK_BEHAVIOR, 0.30),
        (AnomalyClass.POTHOLE,       0.20),
        (AnomalyClass.OBSTRUCTION,   0.10),
        (AnomalyClass.FADED_LANE,    0.05),
    ],
    4: [
        (AnomalyClass.NEAR_MISS,     0.20),
        (AnomalyClass.RISK_BEHAVIOR, 0.25),
        (AnomalyClass.POTHOLE,       0.30),
        (AnomalyClass.OBSTRUCTION,   0.15),
        (AnomalyClass.FADED_LANE,    0.10),
    ],
    3: [
        (AnomalyClass.NEAR_MISS,     0.10),
        (AnomalyClass.RISK_BEHAVIOR, 0.15),
        (AnomalyClass.POTHOLE,       0.35),
        (AnomalyClass.FADED_LANE,    0.25),
        (AnomalyClass.OBSTRUCTION,   0.15),
    ],
}

# Confiança mínima por classe (reflete dificuldade de detecção do modelo)
CONFIDENCE_RANGE: dict[AnomalyClass, tuple[float, float]] = {
    AnomalyClass.NEAR_MISS:     (0.72, 0.97),
    AnomalyClass.RISK_BEHAVIOR: (0.68, 0.95),
    AnomalyClass.POTHOLE:       (0.80, 0.99),
    AnomalyClass.OBSTRUCTION:   (0.65, 0.92),
    AnomalyClass.FADED_LANE:    (0.75, 0.98),
}

# Deslocamento máximo em graus para simular variação de coordenada < 12m
# 12m ≈ 0.000108° de latitude; usamos 0.00009° para ficar dentro do raio
JITTER_WITHIN_DEDUP  = 0.000090   # < 12m → aciona deduplicação
JITTER_OUTSIDE_DEDUP = 0.000130   # > 12m → cria novo registro


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def random_fingerprint() -> str:
    """Gera hash SHA-256 hexadecimal de 64 chars simulando device fingerprint."""
    return hashlib.sha256(random.randbytes(32)).hexdigest()


def random_timestamp(hours_back: int = 24) -> datetime:
    """Timestamp aleatório nas últimas N horas, com timezone UTC."""
    delta = timedelta(seconds=random.randint(0, hours_back * 3600))
    return datetime.now(timezone.utc) - delta


def weighted_choice(pool: list[tuple[AnomalyClass, float]]) -> AnomalyClass:
    classes, weights = zip(*pool)
    return random.choices(classes, weights=weights, k=1)[0]


def jitter(value: float, max_delta: float) -> float:
    return round(value + random.uniform(-max_delta, max_delta), 6)


def build_payload(
    lat: float,
    lon: float,
    anomaly_class: AnomalyClass,
    jitter_size: float = 0.0,
) -> IncidentPayload:
    lat_j = jitter(lat, jitter_size) if jitter_size else lat
    lon_j = jitter(lon, jitter_size) if jitter_size else lon
    lo, hi = CONFIDENCE_RANGE[anomaly_class]
    return IncidentPayload(
        device_fingerprint=random_fingerprint(),
        anomaly_class=anomaly_class,
        confidence_score=round(random.uniform(lo, hi), 4),
        geo_location=GeoLocation(lat=lat_j, lon=lon_j),
        event_timestamp_utc=random_timestamp(),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

async def main() -> None:
    print("\n" + "═" * 60)
    print("  ViaGuardian — Seed de Dados Reais (São Paulo)")
    print("═" * 60)

    # ── Garante que tabelas existam ───────────────────────────────────────────
    print("\n[1/4] Verificando schema do banco…")
    await create_tables()

    async with AsyncSessionLocal() as db:

        # ── Limpa dados anteriores ────────────────────────────────────────────
        print("[2/4] Limpando tabela incidents…")
        await db.execute(text("TRUNCATE TABLE incidents RESTART IDENTITY CASCADE"))
        await db.commit()
        print("      ✓ Tabela limpa.\n")

        total_created = 0
        total_dedup   = 0

        print("[3/4] Injetando incidentes por via crítica…\n")

        for spot in HOTSPOTS:
            via        = spot["via"]
            lat        = spot["lat"]
            lon        = spot["lon"]
            peso       = spot["peso"]
            pool       = CLASS_POOL_BY_PESO[peso]

            # Número de eventos únicos por hotspot (proporcional ao peso)
            n_unique   = peso * 4          # 12–20 eventos únicos
            # Duplicatas dentro do raio de deduplicação por classe principal
            n_dedup    = peso * 6          # 18–30 duplicatas por hotspot

            via_created = 0
            via_dedup   = 0

            # ── Eventos únicos (ainda dentro do hotspot, mas > 12m entre si) ──
            for _ in range(n_unique):
                anomaly = weighted_choice(pool)
                payload = build_payload(lat, lon, anomaly, JITTER_OUTSIDE_DEDUP)
                async with db.begin_nested():
                    _, was_created = await _upsert_incident(payload, db)
                if was_created:
                    via_created += 1
                else:
                    via_dedup += 1

            # ── Eventos duplicados (< 12m do ponto central) ───────────────────
            # Escolhe a classe dominante do hotspot para maximizar recurrence
            dominant_class = weighted_choice(pool)
            for _ in range(n_dedup):
                payload = build_payload(lat, lon, dominant_class, JITTER_WITHIN_DEDUP)
                async with db.begin_nested():
                    _, was_created = await _upsert_incident(payload, db)
                if was_created:
                    via_created += 1
                else:
                    via_dedup += 1

            await db.commit()

            total_created += via_created
            total_dedup   += via_dedup

            status_icon = "🔴" if peso == 5 else ("🟠" if peso == 4 else "🟡")
            print(
                f"  {status_icon} [{peso}/5] {via[:48]:<48}"
                f" | +{via_created:>2} novos  | ×{via_dedup:>2} dedup"
            )

        # ── Resumo final ──────────────────────────────────────────────────────
        result = await db.execute(
            text(
                """
                SELECT
                    COUNT(*)                        AS total,
                    SUM(recurrence_count)           AS total_deteccoes,
                    ROUND(AVG(irv_score)::numeric, 2) AS irv_medio,
                    MAX(irv_score)                  AS irv_max,
                    COUNT(*) FILTER (WHERE irv_score >= 70) AS alto_risco
                FROM incidents
                """
            )
        )
        row = result.mappings().one()

        print("\n" + "═" * 60)
        print("[4/4] Resumo da ingestão")
        print("═" * 60)
        print(f"  Registros únicos inseridos : {total_created:>5}")
        print(f"  Eventos deduplicados       : {total_dedup:>5}")
        print(f"  Total de detecções (soma)  : {row['total_deteccoes']:>5}")
        print(f"  Incidentes no banco        : {row['total']:>5}")
        print(f"  IRV médio                  : {row['irv_medio']:>5}")
        print(f"  IRV máximo                 : {row['irv_max']:>5.2f}")
        print(f"  Incidentes alto risco(≥70) : {row['alto_risco']:>5}")
        print("═" * 60)
        print("\n  ✅ Banco populado. Heatmap pronto para renderização.\n")


if __name__ == "__main__":
    asyncio.run(main())
