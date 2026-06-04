# ViaGuardian Intelligence Center

> Plataforma preditiva de segurança viária para motociclistas — Prêmio Senatran 2026.

O ViaGuardian é um ecossistema de **quatro camadas** que coleta dados de anomalias viárias em
tempo real via sensores de borda (smartphone do motociclista e câmeras CFTV públicas), processa e
deduplica espacialmente no backend e os exibe num painel de inteligência operacional para tomada de
decisão pelo operador do CCO.

---

## Arquitetura do Ecossistema

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          ViaGuardian Ecosystem                               │
│                                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌──────────────────────┐   ┌────────┐  │
│  │ Mobile App  │──▶│ FastAPI +   │◀──│  Worker CFTV         │   │ React  │  │
│  │ React Native│   │ PostGIS     │   │  (opencv · httpx)    │   │ Web    │  │
│  │ YOLOv8-Nano │   │ (Docker)    │   │  RTSP → /ingress     │   │ (Vite) │  │
│  └─────────────┘   └──────┬──────┘   └──────────────────────┘   └───┬────┘  │
│   Edge AI / GPS           │  Dedup ST_DWithin                        │       │
│                           │  + Sync Infosiga SP (APScheduler)        │       │
│                           └──────────────────────────────────────────┘       │
│                                     CCO Dashboard + Triagem                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Fórmula IRV — Índice de Risco Viário

```
IRV = (Wa × D) + (Wh × S)
```

| Variável | Valor | Descrição |
|---|---|---|
| `Wa` | `0,6` | Peso de anomalia — volume de detecções validadas na borda |
| `Wh` | `0,4` | Peso histórico — incidência de sinistros Infosiga SP |
| `D` | `recurrence_count` | Deduplicação espacial PostGIS (raio 12m / janela 24h) |
| `S` | `0–10` | Score histórico por classe (atualizado diariamente pelo sync noturno) |

---

## Sub-projetos

| Pasta | Stack | Responsabilidade |
|---|---|---|
| `/` (raiz) | React 19 + Vite 8 + Tailwind v3 | Intelligence Center — painel operacional CCO |
| `mobile/` | React Native 0.75 + Vision Camera v4 | App do motociclista — sensor de borda + AR |
| `backend/` | FastAPI 0.115 + PostGIS 15-3.3 | API de ingestão + motor de deduplicação espacial |
| `backend/worker_cftv.py` | Python + OpenCV + httpx | Worker autônomo de câmeras CFTV públicas |

---

## 1 · Intelligence Center (Web Dashboard)

Painel escuro para o Centro de Controle Operacional (CCO), com 3 telas principais.

### Telas

| Rota | Página | Conteúdo |
|---|---|---|
| `/` | Login | Autenticação (protótipo) |
| `/dashboard` | Painel de Controle CCO | KPIs, Heatmap, Donut, Tendência |
| `/triage` | Triagem Operacional | Fila de incidentes + painel de decisão com ações |
| `/cctv` | Monitoramento CFTV | Grid 6 câmeras + métricas YOLOv8 |

### Componentes principais

```
src/
├── components/
│   ├── ai/
│   │   └── AiAgentWidget.jsx         # Widget flutuante de IA (chat + sugestões)
│   ├── dashboard/
│   │   ├── KpiCard.jsx               # Cards com fórmula IRV e accent ring
│   │   ├── HeatmapPanel.jsx          # SVG heatmap preditivo (radialGradient)
│   │   ├── SeverityDonutChart.jsx    # Rosca de distribuição por severidade
│   │   └── IncidentTrendChart.jsx    # Gráfico de tendência semanal (Recharts)
│   ├── cftv/
│   │   └── CctvGrid.jsx              # Grid 6 câmeras: scanlines, REC, FPS, latência IA
│   ├── triage/
│   │   └── TriageTable.jsx           # Split 60/40: tabela + DetailPanel reativo
│   └── layout/
│       ├── AppShell.jsx              # Layout raiz + monta AiAgentWidget
│       ├── Header.jsx
│       └── Sidebar.jsx
├── pages/
│   ├── DashboardPage.jsx
│   ├── TriagePage.jsx
│   ├── CctvPage.jsx
│   └── LoginPage.jsx
├── hooks/
│   ├── useDashboardQueries.js        # TanStack Query v5 → dashboardService
│   └── useTriageQueries.js           # TanStack Query v5 → triageService
├── services/
│   ├── dashboardService.js           # GET /dashboard/metrics, /heatmap
│   └── triageService.js              # GET /triage/queue, PATCH .../status
├── mocks/
│   └── mockData.js                   # Fallback offline completo
└── lib/
    └── http.js                       # Instância axios configurada
```

### Tela de Triagem — Fluxo de Atendimento

A triagem é o núcleo operacional do CCO. O operador visualiza a fila de incidentes pendentes e
toma uma decisão para cada item selecionado:

```
Incidente PENDENTE
    ↓
[Aprovar e Despachar O.S.] ──▶ status = APPROVED ──▶ Banner: "✅ O.S. Despachada (SP156)"
[Rejeitar Falso Positivo]  ──▶ status = REJECTED ──▶ Banner: "🚫 Removido do cálculo IRV"
```

**Componentes do `DetailPanel`:**

| Seção | Descrição |
|---|---|
| Header | ID do incidente + categoria + `StatusBadge` |
| Mini-mapa tático | `MapContainer` Leaflet com círculo de deduplicação de 12m |
| Validação Multi-Sensor | Número de sensores independentes que confirmaram a anomalia |
| Análise Automática | Justificativa textual gerada pelo modelo |
| Metadados | Coordenadas, IRV Score, barra de confiança |
| **Área de ações** | Botões condicionais ao status (apenas para `Pendente`) |
| **Banner de feedback** | Aparece instantaneamente após decisão, sem reload de página |

**Reatividade local:** `handleDecision` no `TriageTableInner` atualiza `localQueue` e `selected`
via `useState` imediatamente ao clicar, garantindo que o banner apareça antes mesmo da resposta da API.

### Stack Web

| Dependência | Versão | Uso |
|---|---|---|
| React | 19.2 | UI |
| Vite | 8.0 | Build / dev server |
| Tailwind CSS | 3.4 | Estilo (darkMode: 'class') |
| React Leaflet | 4.x | Mini-mapa tático no DetailPanel |
| Recharts | 3.8 | Gráficos (donut, linha) |
| TanStack Query | 5.x | Data fetching + cache |
| React Router | 7.x | SPA routing |
| Axios | 1.x | HTTP client |

### Comandos Web

```bash
# Instalar dependências
npm install

# Servidor de desenvolvimento (http://localhost:5173)
npm run dev

# Build de produção
npm run build

# Preview do build
npm run preview
```

---

## 2 · Mobile Sensor App (React Native)

App do motociclista que atua como sensor de borda com Edge AI embarcado.

### Máquina de Estados (Zustand FSM)

```
PARKED ──(speed > 0.5 m/s)──▶ DRIVING
          ◀──(speed ≤ 0.5)──
```

- **DRIVING** → tela `ActiveDrivingScreen` (câmera AR + bounding boxes + HUD)
- **PARKED** → tela `ParkedScreen` (resumo da sessão + upload do lote)

### Estrutura Mobile

```
mobile/
├── App.jsx                          # Root: permissões + FSM router
└── src/
    ├── screens/
    │   ├── ActiveDrivingScreen.jsx  # VisionCamera + frame processor + AR overlay
    │   └── ParkedScreen.jsx         # KPIs de sessão + upload batch + gamificação XP
    ├── store/
    │   └── telemetryStore.js        # Zustand FSM: DRIVING/PARKED + payloads
    ├── hooks/
    │   └── useGpsWatcher.js         # Geolocation.watchPosition → FSM transitions
    └── utils/
        ├── payloadBuilder.js        # LGPD: SHA-256 fingerprint + anonimização
        └── multimodalAlert.js       # Haptic (long-short-short) + TTS pt-BR
```

### Fluxo de Dados Mobile

```
Frame Processor (worklet)
  └──▶ runOnJS(handleDetection)
        └──▶ telemetryStore.registerDetection()
              ├── triggerAlert()  [haptic + TTS]
              └── payloads[]  →  ParkedScreen  →  sanitizeBatch()  →  POST /ingress/batch
```

### Stack Mobile

| Dependência | Versão | Uso |
|---|---|---|
| React Native | 0.75.3 | Framework mobile |
| react-native-vision-camera | 4.5.2 | Camera + frame processors (worklets) |
| Zustand | 4.5.4 | Estado global (FSM) |
| TensorFlow.js | 4.21 | Edge AI (YOLOv8-Nano simulado) |
| react-native-tts | 4.1 | Alertas de voz pt-BR |
| react-native-haptic-feedback | 2.2 | Vibração multimodal |
| Axios | 1.7 | Upload de lote ao backend |
| expo-crypto | 13 | SHA-256 para device fingerprint (LGPD) |

### Comandos Mobile

```bash
cd mobile

# Android
npx react-native run-android

# iOS
npx react-native run-ios

# Metro bundler
npx react-native start
```

---

## 3 · Backend API (FastAPI + PostGIS)

API assíncrona de ingestão de telemetria de borda, deduplicação espacial e fornecimento de
métricas para o painel web. Inclui sincronização noturna automática com a base Infosiga SP.

### Estrutura Backend

```
backend/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── main.py                          # FastAPI app: lifespan, CORS, scheduler, routers, /health
├── worker_cftv.py                   # Worker autônomo de câmeras CFTV (script independente)
└── app/
    ├── config.py                    # Pydantic Settings (.env)
    ├── database.py                  # SQLAlchemy async engine + get_db + create_tables
    ├── models.py                    # ORM: Incident, AnomalyClass enum, IncidentStatus enum
    ├── schemas.py                   # Pydantic v2: IncidentPayload, TelemetryBatch, DashboardMetrics
    ├── routers/
    │   ├── ingress.py               # POST /ingress/event, POST /ingress/batch + cálculo IRV
    │   └── dashboard.py             # GET /dashboard/metrics, /heatmap, /triage/queue, PATCH status
    └── services/
        └── infosiga_sync.py         # Sincronização noturna de scores históricos (Infosiga SP)
```

### Motor de Deduplicação Espacial

Para cada payload recebido, o backend executa uma query PostGIS antes de inserir:

```sql
SELECT id FROM incidents
WHERE anomaly_class = :class
  AND event_timestamp_utc >= NOW() - INTERVAL '24 hours'
  AND ST_DWithin(
        location::geography,
        ST_GeomFromText('POINT(:lon :lat)', 4326)::geography,
        12.0  -- metros
      )
LIMIT 1
```

- **Encontrou** → `UPDATE recurrence_count += 1` (IRV recalculado)
- **Não encontrou** → `INSERT` novo incidente

O índice GIST na coluna `location` garante busca O(log n) via R-Tree.

### Sincronização Noturna — Infosiga SP

O scheduler APScheduler roda **todos os dias às 03:00 (America/Sao_Paulo)** dentro do lifespan
do FastAPI e atualiza os pesos do `HISTORICAL_SCORE_BY_CLASS` em memória:

```
lifespan startup
  └──▶ AsyncIOScheduler.start()
         └──▶ CronTrigger(hour=3, minute=0)
               └──▶ sync_infosiga_data()
                     ├── httpx.get(https://api.infosiga.sp.gov.br/v1/acidentes/mensal)
                     │     ✓ Sucesso → parse + atualiza HISTORICAL_SCORE_BY_CLASS
                     │     ✗ Falha   → fallback: pesos aleatórios [4.0 – 9.5]
                     └── log de cada classe atualizada
```

O dicionário é mutado **in-place**, então `calculate_irv()` em `ingress.py` reflete os novos
pesos imediatamente, sem necessidade de reinicialização da API.

### Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Health check (Docker + load balancer) |
| `POST` | `/ingress/event` | Recebe evento único do sensor de borda ou worker CFTV |
| `POST` | `/ingress/batch` | Recebe lote ao fim da sessão de condução (Mobile) |
| `GET` | `/dashboard/metrics` | KPIs agregados (IRV, incidents_today, trend…) |
| `GET` | `/dashboard/heatmap` | Pontos georreferenciados para heatmap |
| `GET` | `/triage/queue` | Fila de incidentes pendentes (ordem IRV desc) |
| `PATCH` | `/triage/incidents/{id}/status` | Aprovar (`approved`) ou rejeitar (`rejected`) incidente |

### Variáveis de Ambiente

Crie `backend/.env` com:

```env
DATABASE_URL=postgresql+asyncpg://viaguardian:viaguardian@db:5432/viaguardian
API_SECRET_KEY=troque-em-producao
CORS_ORIGINS=http://localhost:5173,http://localhost:4173
DB_ECHO=false
DEDUP_RADIUS_METERS=12.0
DEDUP_WINDOW_HOURS=24
MIN_CONFIDENCE_SCORE=0.50
```

### Stack Backend

| Dependência | Versão | Uso |
|---|---|---|
| FastAPI | 0.115.6 | Framework HTTP assíncrono |
| Uvicorn | 0.32.1 | ASGI server |
| SQLAlchemy | 2.0.36 | ORM async |
| GeoAlchemy2 | 0.15.2 | Tipos PostGIS (GEOMETRY, ST_DWithin…) |
| asyncpg | 0.30.0 | Driver assíncrono PostgreSQL |
| Alembic | 1.14.0 | Migrações de banco |
| Pydantic | 2.10.3 | Validação de schemas |
| httpx | 0.28.1 | Cliente HTTP assíncrono (sync Infosiga + worker CFTV) |
| APScheduler | 3.10.4 | Agendamento do job noturno de sincronização |
| opencv-python-headless | 4.10.0.84 | Captura de frames RTSP no worker CFTV |
| PostGIS | 15-3.3 | Extensão espacial (SRID 4326 / WGS-84) |

### Comandos Backend

```bash
cd backend

# Subir banco PostGIS + API com hot-reload
docker-compose up --build

# Apenas o banco (para desenvolvimento local da API)
docker-compose up db

# Rodar API localmente (requer .env configurado)
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Documentação interativa (Swagger)
# http://localhost:8000/docs

# Criar nova migração Alembic
docker-compose exec api alembic revision --autogenerate -m "descricao"

# Aplicar migrações
docker-compose exec api alembic upgrade head
```

---

## 4 · Worker CFTV (Script Autônomo)

Worker Python independente que processa streams de vídeo RTSP de câmeras públicas (CFTV) e
alimenta a API ViaGuardian usando o mesmo endpoint do App Mobile.

### Arquitetura do Worker

```
cv2.VideoCapture(RTSP_URL)
        │
        ▼ (a cada INFERENCE_INTERVAL frames)
  run_inference(frame)          ← YOLOv8-Nano stub (produção: model(frame))
        │
        ▼ (se anomalia detectada)
  httpx.post(/ingress/event)    ← mesmo contrato IncidentPayload do Mobile
        │
        ▼
  log colorido ANSI + resposta da API (incident_id, action)
```

**Fallback MVP:** se o stream RTSP estiver inacessível, o worker entra em modo de simulação
automático, gerando frames sintéticos (ruído gaussiano) a cada `2s`.

### Device Fingerprint das Câmeras

O campo `device_fingerprint` (SHA-256, 64 chars) é gerado deterministicamente a partir do ID da
câmera, satisfazendo o validator `^[0-9a-f]{64}$` do `IncidentPayload`:

```python
fingerprint = hashlib.sha256("CFTV-CAM-001".encode()).hexdigest()
```

### Localização Monitorada (Padrão)

| Campo | Valor | Ponto de referência |
|---|---|---|
| `lat` | `-23.5614` | Avenida Paulista × Rua Augusta |
| `lon` | `-46.6562` | São Paulo — SP |

### Logs Coloridos

| Cor | Evento |
|---|---|
| 🔵 Ciano | `[FRAME #NNNNN]` — frame processado |
| 🟡 Amarelo | `⚠ [ANOMALIA DETECTADA]` — classe + confiança |
| 🟢 Verde | `✓ [PAYLOAD ENVIADO À API CENTRAL]` — action + incident_id |
| 🔴 Vermelho | `✕ [ERRO NA INTEGRAÇÃO]` — status HTTP + detalhe |

### Classes Detectáveis pela Câmera CFTV

| Classe | Descrição |
|---|---|
| `obstruction` | Veículo parado / objeto na via |
| `pothole` | Buraco identificável em ângulo zenital |
| `near_miss` | Quase-colisão detectada por fluxo óptico |
| `risk_behavior` | Fechada / avanço de sinal |

### Comandos do Worker

```bash
cd backend

# Instalar dependências do worker
pip install opencv-python-headless==4.10.0.84 httpx==0.28.1

# Modo simulação (sem câmera real — recomendado para desenvolvimento)
python worker_cftv.py --simulate

# Modo RTSP (com fallback automático para simulação se RTSP falhar)
python worker_cftv.py --rtsp-url rtsp://cam.cetsp.gov.br/live/cam_paulista_001

# Câmera customizada, apontando para outra instância da API
python worker_cftv.py --simulate --cam-id CFTV-CAM-005 --api-url http://localhost:8000/ingress/event

# Ver todas as opções
python worker_cftv.py --help
```

---

## Classes de Anomalia

| Classe | Score Histórico Base | Descrição |
|---|---|---|
| `near_miss` | 9.5 | Quase-acidentes com outros veículos |
| `risk_behavior` | 8.0 | Comportamentos de risco (ultrapassagem, velocidade) |
| `obstruction` | 6.0 | Obstruções de via |
| `pothole` | 5.5 | Buracos e depressões no asfalto |
| `faded_lane` | 4.0 | Sinalização horizontal apagada |

> **Nota:** Os scores históricos são atualizados automaticamente às **03:00** pelo job de
> sincronização com o Infosiga SP (`infosiga_sync.py`). Os valores acima são os scores base
> iniciais definidos em `ingress.py`.

---

## Privacidade e LGPD

- **Sem dados pessoais**: o App Mobile nunca coleta nome, CPF ou identificadores diretos.
- **Device fingerprint**: hash SHA-256 one-way de metadados não-sensíveis do dispositivo
  (SO + versão + salt da app). Irreversível. Aplicado também às câmeras CFTV (`cam_id → SHA-256`).
- **Coordenadas**: truncadas em 6 casas decimais (~11 cm de precisão). Bounding boxes ficam no
  campo `_bbox` — removidas antes do upload pelo `sanitizeBatch()`.
- **Câmeras CFTV**: imagens **nunca** são armazenadas. O worker processa o frame em memória e
  descarta imediatamente após a inferência. Apenas metadados do evento são enviados à API.
- **Transmissão**: HTTPS obrigatório em produção. Lote cifrado em trânsito.

---

## Inicialização Completa

```bash
# 1. Clonar o repositório
git clone <url> viaguardian-intelligence-center
cd viaguardian-intelligence-center

# 2. Web Dashboard
npm install
npm run dev          # http://localhost:5173

# 3. Backend (em outro terminal)
cd backend
cp .env.example .env  # ajustar variáveis
docker-compose up --build
# API:      http://localhost:8000
# Swagger:  http://localhost:8000/docs
# ReDoc:    http://localhost:8000/redoc

# 4. Worker CFTV (em outro terminal — requer API rodando)
cd backend
python worker_cftv.py --simulate

# 5. Mobile (em outro terminal)
cd mobile
npm install
npx react-native run-android
```

---

## Roadmap

| Status | Funcionalidade |
|---|---|
| ✅ | Motor de deduplicação espacial PostGIS (ST_DWithin 12m / 24h) |
| ✅ | Cálculo e normalização do IRV (0–100) |
| ✅ | Triagem operacional com decisão Aprovar / Rejeitar e feedback reativo |
| ✅ | Sincronização noturna com Infosiga SP (APScheduler + fallback simulado) |
| ✅ | Worker autônomo de câmeras CFTV (RTSP + fallback simulação) |
| 🔜 | Autenticação JWT para operadores do CCO |
| 🔜 | Parse real da API REST Infosiga SP (quando disponível) |
| 🔜 | Integração SP156 para despacho de O.S. de zeladoria |
| 🔜 | Modelo YOLOv8-Nano embarcado no worker CFTV (substituir stub) |
| 🔜 | Alertas push para operadores (WebSocket / SSE) |
