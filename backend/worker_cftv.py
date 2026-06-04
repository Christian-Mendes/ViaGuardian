#!/usr/bin/env python3
"""
worker_cftv.py — Worker Autônomo de Câmeras CFTV — ViaGuardian Intelligence.

Responsabilidades:
  • Captura frames de um stream RTSP de câmera pública (CFTV)
  • Executa inferência de anomalias viárias (YOLOv8-Nano simulado)
  • Envia detecções ao endpoint POST /ingress/event da API ViaGuardian

Execução independente (não faz parte da API FastAPI):
  python worker_cftv.py [--rtsp-url RTSP_URL] [--cam-id CAM_ID]

Dependências:
  pip install opencv-python-headless httpx

Arquitetura de fallback (MVP):
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 1. Tenta conectar ao stream RTSP                                     │
  │ 2. Se RTSP falhar → entra no modo "simulação de sensor"             │
  │    (gera frames sintéticos a cada 2s, simula leituras reais)        │
  │ 3. Para cada frame: run_inference() retorna anomalia esporadicamente │
  │ 4. Anomalia detectada → POST /ingress/event com payload completo     │
  └─────────────────────────────────────────────────────────────────────┘

Cruzamento monitorado (exemplo):
  Avenida Paulista × Rua Augusta, São Paulo — SP
  lat: -23.5614, lon: -46.6562
"""

from __future__ import annotations

import argparse
import hashlib
import random
import sys
import time
from datetime import datetime, timezone
from typing import Any

import cv2
import httpx
import numpy as np

# ─────────────────────────────────────────────────────────────────────────────
# Configurações do Worker
# ─────────────────────────────────────────────────────────────────────────────

API_URL            = "http://localhost:8000/ingress/event"
DEFAULT_RTSP_URL   = "rtsp://camerapublica.cetsp.com.br/live/cam_paulista_001"
DEFAULT_CAM_ID     = "CFTV-CAM-001"
FRAME_INTERVAL_S   = 2.0          # intervalo entre frames no modo simulação
INFERENCE_INTERVAL = 5            # rodamos inferência a cada N frames
HTTP_TIMEOUT_S     = 10.0

# Cruzamento monitorado: Av. Paulista com R. Augusta — ponto de alta incidência
CAM_LOCATION = {"lat": -23.5614, "lon": -46.6562}

# Classes de anomalia detectáveis pela câmera fixa de via pública
# (subconjunto realista para câmera estática de cruzamento)
DETECTABLE_CLASSES = [
    "obstruction",    # veículo parado / objeto na via
    "pothole",        # buraco identificável em ângulo de câmera zenital
    "near_miss",      # quase-colisão detectada por fluxo óptico
    "risk_behavior",  # fechada / avanço de sinal
]

# Probabilidade de detecção por frame (baixa = realista para câmera de rua)
DETECTION_PROBABILITY = 0.12


# ─────────────────────────────────────────────────────────────────────────────
# Logs Coloridos (ANSI — sem dependências externas)
# ─────────────────────────────────────────────────────────────────────────────

class Color:
    RESET   = "\033[0m"
    BOLD    = "\033[1m"
    GRAY    = "\033[90m"
    CYAN    = "\033[96m"
    YELLOW  = "\033[93m"
    GREEN   = "\033[92m"
    RED     = "\033[91m"
    MAGENTA = "\033[95m"
    BLUE    = "\033[94m"


def _ts() -> str:
    """Retorna timestamp atual formatado para log."""
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def log_frame(frame_num: int, source: str) -> None:
    print(
        f"{Color.GRAY}[{_ts()}]{Color.RESET} "
        f"{Color.CYAN}[FRAME #{frame_num:05d}]{Color.RESET} "
        f"Processado — fonte: {Color.BOLD}{source}{Color.RESET}"
    )


def log_detection(anomaly_class: str, confidence: float, frame_num: int) -> None:
    print(
        f"{Color.GRAY}[{_ts()}]{Color.RESET} "
        f"{Color.YELLOW}⚠  [ANOMALIA DETECTADA]{Color.RESET} "
        f"classe={Color.BOLD}{anomaly_class.upper()}{Color.RESET} "
        f"confiança={Color.MAGENTA}{confidence:.2%}{Color.RESET} "
        f"frame=#{frame_num:05d}"
    )


def log_api_success(incident_id: int | None, action: str) -> None:
    print(
        f"{Color.GRAY}[{_ts()}]{Color.RESET} "
        f"{Color.GREEN}✓  [PAYLOAD ENVIADO À API CENTRAL]{Color.RESET} "
        f"action={Color.BOLD}{action}{Color.RESET} "
        f"incident_id={Color.BOLD}{incident_id}{Color.RESET}"
    )


def log_api_error(status_code: int | None, detail: str) -> None:
    print(
        f"{Color.GRAY}[{_ts()}]{Color.RESET} "
        f"{Color.RED}✕  [ERRO NA INTEGRAÇÃO]{Color.RESET} "
        f"status={status_code} — {detail}",
        file=sys.stderr,
    )


def log_info(msg: str) -> None:
    print(
        f"{Color.GRAY}[{_ts()}]{Color.RESET} "
        f"{Color.BLUE}ℹ  {msg}{Color.RESET}"
    )


def log_warn(msg: str) -> None:
    print(
        f"{Color.GRAY}[{_ts()}]{Color.RESET} "
        f"{Color.YELLOW}⚠  {msg}{Color.RESET}",
        file=sys.stderr,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Device Fingerprint (SHA-256 deterministico por câmera)
# ─────────────────────────────────────────────────────────────────────────────

def make_fingerprint(cam_id: str) -> str:
    """
    Gera um device_fingerprint SHA-256 de 64 chars hex a partir do ID da câmera.
    Determinístico: a mesma câmera sempre produz o mesmo fingerprint,
    satisfazendo o validator `^[0-9a-f]{64}$` do IncidentPayload.
    """
    return hashlib.sha256(cam_id.encode()).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# Inferência simulada (YOLOv8-Nano stub)
# ─────────────────────────────────────────────────────────────────────────────

def run_inference(frame: np.ndarray) -> dict[str, Any] | None:
    """
    Simula a inferência do modelo YOLOv8-Nano sobre um frame de câmera CFTV.

    Em produção, aqui você chamaria:
        results = model(frame, conf=0.6, verbose=False)
        for box in results[0].boxes: ...

    MVP: retorna uma detecção aleatória com probabilidade `DETECTION_PROBABILITY`
    e confiança realista (≥ 0.70, limiar mínimo da API é 0.65 por padrão).

    Args:
        frame: Array NumPy BGR vindo do cv2.VideoCapture.read()

    Returns:
        dict com 'anomaly_class' e 'confidence_score', ou None se não detectado.
    """
    _ = frame  # placeholder — em produção: model(frame, ...)

    if random.random() > DETECTION_PROBABILITY:
        return None

    anomaly_class = random.choice(DETECTABLE_CLASSES)
    # Confiança com distribuição realista para achados de alta certeza
    confidence = round(random.uniform(0.72, 0.97), 4)

    return {"anomaly_class": anomaly_class, "confidence_score": confidence}


# ─────────────────────────────────────────────────────────────────────────────
# Envio para a API ViaGuardian
# ─────────────────────────────────────────────────────────────────────────────

def send_to_api(detection: dict[str, Any], fingerprint: str) -> None:
    """
    Serializa e envia uma detecção ao endpoint POST /ingress/event.

    O payload respeita exatamente o contrato IncidentPayload (schemas.py):
      • device_fingerprint   — SHA-256 hex 64 chars da câmera
      • anomaly_class        — valor do enum AnomalyClass
      • confidence_score     — float [0.0 – 1.0]
      • geo_location         — {lat, lon} do cruzamento monitorado
      • event_timestamp_utc  — ISO 8601 com timezone UTC

    Uso de httpx síncrono (`httpx.post`) pois o worker corre em thread principal
    simples, sem event loop asyncio. Para arquitetura com asyncio, usar AsyncClient.
    """
    payload = {
        "device_fingerprint": fingerprint,
        "anomaly_class": detection["anomaly_class"],
        "confidence_score": detection["confidence_score"],
        "geo_location": CAM_LOCATION,
        "event_timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }

    try:
        response = httpx.post(API_URL, json=payload, timeout=HTTP_TIMEOUT_S)
        response.raise_for_status()
        data = response.json()
        log_api_success(
            incident_id=data.get("incident_id"),
            action=data.get("action", "?"),
        )
    except httpx.HTTPStatusError as exc:
        log_api_error(exc.response.status_code, exc.response.text[:200])
    except httpx.RequestError as exc:
        log_api_error(None, f"Falha de rede: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# Loop de Captura RTSP
# ─────────────────────────────────────────────────────────────────────────────

def _open_rtsp(rtsp_url: str) -> cv2.VideoCapture | None:
    """
    Tenta abrir o stream RTSP com timeout implícito.
    Retorna None se a câmera não estiver acessível.
    """
    log_info(f"Conectando ao stream RTSP: {rtsp_url}")
    cap = cv2.VideoCapture(rtsp_url)

    # Testa se o stream abriu E se consegue ler ao menos 1 frame
    if not cap.isOpened():
        cap.release()
        return None

    ok, _ = cap.read()
    if not ok:
        cap.release()
        return None

    return cap


def run_rtsp_loop(rtsp_url: str, fingerprint: str) -> None:
    """Loop principal consumindo frames reais do stream RTSP."""
    cap = _open_rtsp(rtsp_url)
    if cap is None:
        log_warn(f"Stream RTSP inacessível ({rtsp_url}). Alternando para modo simulação.")
        run_simulation_loop(fingerprint)
        return

    log_info(
        f"Stream RTSP conectado. "
        f"Resolução: {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}×"
        f"{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))} px "
        f"@ {cap.get(cv2.CAP_PROP_FPS):.1f} FPS"
    )

    frame_num = 0
    try:
        while True:
            ok, frame = cap.read()

            if not ok:
                log_warn("Frame inválido — stream pode ter caído. Aguardando 5s e reconectando…")
                cap.release()
                time.sleep(5.0)
                cap = cv2.VideoCapture(rtsp_url)
                continue

            frame_num += 1

            # Inferência a cada N frames para não saturar CPU
            if frame_num % INFERENCE_INTERVAL == 0:
                log_frame(frame_num, source="RTSP")
                detection = run_inference(frame)
                if detection:
                    log_detection(detection["anomaly_class"], detection["confidence_score"], frame_num)
                    send_to_api(detection, fingerprint)

    except KeyboardInterrupt:
        log_info("Interrupção recebida. Encerrando worker RTSP.")
    finally:
        cap.release()


# ─────────────────────────────────────────────────────────────────────────────
# Loop de Simulação (fallback MVP)
# ─────────────────────────────────────────────────────────────────────────────

def run_simulation_loop(fingerprint: str) -> None:
    """
    Fallback MVP: simula a captura de frames CFTV sem câmera real.

    Gera um frame sintético (ruído gaussiano) a cada FRAME_INTERVAL_S segundos,
    passando-o pela mesma pipeline de inferência do loop RTSP. Garante que o
    worker seja funcional em ambiente de desenvolvimento sem infraestrutura de
    câmeras.
    """
    log_info(
        f"{Color.YELLOW}[MODO SIMULAÇÃO]{Color.RESET}{Color.BLUE} "
        f"Gerando frames sintéticos a cada {FRAME_INTERVAL_S}s."
    )

    frame_num = 0
    try:
        while True:
            # Frame sintético: ruído gaussiano 1080p (simula câmera de cruzamento)
            synthetic_frame = np.random.randint(0, 256, (1080, 1920, 3), dtype=np.uint8)

            frame_num += 1
            log_frame(frame_num, source="SIMULAÇÃO")

            detection = run_inference(synthetic_frame)
            if detection:
                log_detection(detection["anomaly_class"], detection["confidence_score"], frame_num)
                send_to_api(detection, fingerprint)

            time.sleep(FRAME_INTERVAL_S)

    except KeyboardInterrupt:
        log_info("Interrupção recebida. Encerrando worker de simulação.")


# ─────────────────────────────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="ViaGuardian CFTV Worker — Captura e inferência de câmeras públicas",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Exemplos:\n"
            "  # Modo RTSP real\n"
            "  python worker_cftv.py --rtsp-url rtsp://cam.exemplo.gov.br/live/001\n\n"
            "  # Modo simulação (sem câmera)\n"
            "  python worker_cftv.py --simulate\n\n"
            "  # RTSP com ID de câmera customizado\n"
            "  python worker_cftv.py --rtsp-url rtsp://... --cam-id CFTV-CAM-005\n"
        ),
    )
    parser.add_argument(
        "--rtsp-url",
        default=DEFAULT_RTSP_URL,
        help=f"URL do stream RTSP da câmera (padrão: {DEFAULT_RTSP_URL})",
    )
    parser.add_argument(
        "--cam-id",
        default=DEFAULT_CAM_ID,
        help=f"Identificador único da câmera (padrão: {DEFAULT_CAM_ID})",
    )
    parser.add_argument(
        "--simulate",
        action="store_true",
        help="Força o modo de simulação sem tentar conectar ao RTSP",
    )
    parser.add_argument(
        "--api-url",
        default=API_URL,
        help=f"URL completa do endpoint de ingresso (padrão: {API_URL})",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    # Sobrescreve constante global se passada via argumento
    global API_URL  # noqa: PLW0603
    API_URL = args.api_url

    fingerprint = make_fingerprint(args.cam_id)

    print(
        f"\n{Color.BOLD}{Color.CYAN}"
        f"╔══════════════════════════════════════════════════════════╗\n"
        f"║     ViaGuardian — CFTV Worker  v1.0                     ║\n"
        f"╚══════════════════════════════════════════════════════════╝"
        f"{Color.RESET}\n"
    )
    log_info(f"Câmera       : {Color.BOLD}{args.cam_id}{Color.RESET}")
    log_info(f"Fingerprint  : {Color.BOLD}{fingerprint[:16]}…{Color.RESET}  (SHA-256 truncado)")
    log_info(f"Localização  : lat={CAM_LOCATION['lat']}, lon={CAM_LOCATION['lon']}")
    log_info(f"API Central  : {Color.BOLD}{API_URL}{Color.RESET}")
    log_info(f"RTSP URL     : {Color.BOLD}{args.rtsp_url}{Color.RESET}")
    log_info(f"Modo         : {Color.BOLD}{'SIMULAÇÃO FORÇADA' if args.simulate else 'RTSP (fallback: simulação)'}{Color.RESET}")
    print()

    if args.simulate:
        run_simulation_loop(fingerprint)
    else:
        run_rtsp_loop(args.rtsp_url, fingerprint)


if __name__ == "__main__":
    main()
