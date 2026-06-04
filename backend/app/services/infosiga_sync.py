"""
services/infosiga_sync.py — Sincronização noturna com a base Infosiga SP.

Responsabilidades:
  • Consultar a API pública do Infosiga SP (GET mensal de acidentes)
  • Atualizar os pesos de HISTORICAL_SCORE_BY_CLASS em memória
  • Fallback MVP: simulação com pesos aleatórios quando a API não está
    disponível (ambiente de desenvolvimento / homologação)

Agendamento:
  Executado diariamente às 03:00 (America/Sao_Paulo) via APScheduler,
  configurado no lifespan do main.py.
"""

import logging
import random

import httpx

from app.models import AnomalyClass
from app.routers.ingress import HISTORICAL_SCORE_BY_CLASS

logger = logging.getLogger("viaguardian.infosiga_sync")

# URL da API pública do Governo SP (Infosiga)
_INFOSIGA_URL = "https://api.infosiga.sp.gov.br/v1/acidentes/mensal"

# Faixa de simulação de flutuação mensal de risco
_SCORE_MIN = 4.0
_SCORE_MAX = 9.5


async def sync_infosiga_data() -> None:
    """
    Sincroniza os scores históricos de risco viário com o Infosiga SP.

    Fluxo:
      1. Tenta um GET autenticado na API do Infosiga SP.
      2. Em caso de sucesso, parseia os dados e atualiza HISTORICAL_SCORE_BY_CLASS.
      3. Em qualquer falha de rede ou HTTP (timeout, 4xx, 5xx), aciona o
         fallback de simulação — garante que o sistema nunca fique com dados
         completamente desatualizados por falha de integração.

    Nota MVP:
      A API do Infosiga SP ainda não oferece endpoint REST público com o
      contrato esperado. O fallback de simulação é o comportamento *real*
      durante a fase de desenvolvimento. Quando o contrato oficial for
      publicado, substituir o bloco `except` pelo parse do JSON retornado.
    """
    logger.info("[Infosiga Sync] Iniciando ciclo de sincronização noturna…")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(_INFOSIGA_URL)
            response.raise_for_status()

        # ── Produção: parsear response.json() e mapear para AnomalyClass ──────
        # data = response.json()
        # for item in data["registros"]:
        #     cls = AnomalyClass(item["classe"])
        #     HISTORICAL_SCORE_BY_CLASS[cls] = float(item["score_risco"])

        logger.info(
            "[Infosiga Sync] Dados recebidos da API. "
            "Parse de produção ainda não implementado — usando fallback."
        )
        _apply_simulated_scores()

    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        logger.warning(
            "[Infosiga Sync] Falha ao contactar API Infosiga SP: %s. "
            "Aplicando scores simulados como fallback.",
            exc,
        )
        _apply_simulated_scores()

    except Exception as exc:  # noqa: BLE001
        logger.error(
            "[Infosiga Sync] Erro inesperado durante sincronização: %s",
            exc,
            exc_info=True,
        )


def _apply_simulated_scores() -> None:
    """
    Fallback MVP: atualiza HISTORICAL_SCORE_BY_CLASS com pesos aleatórios
    no intervalo [4.0, 9.5] para simular a flutuação mensal de sinistros.

    Modifica o dicionário in-place para que todas as referências já existentes
    (ex: calculate_irv em ingress.py) vejam os novos valores imediatamente.
    """
    for anomaly_class in AnomalyClass:
        new_score = round(random.uniform(_SCORE_MIN, _SCORE_MAX), 2)
        old_score = HISTORICAL_SCORE_BY_CLASS.get(anomaly_class, 5.0)
        HISTORICAL_SCORE_BY_CLASS[anomaly_class] = new_score
        logger.info(
            "[Infosiga Sync] %-15s | score: %.2f → %.2f",
            anomaly_class.value,
            old_score,
            new_score,
        )

    logger.info("[Infosiga Sync] Scores históricos atualizados com sucesso. ✓")
