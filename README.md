# ViaGuardian Intelligence Center

> Plataforma preditiva de segurança viária para motociclistas — Prêmio Senatran 2026.

O ViaGuardian é um ecossistema de três camadas que coleta dados de anomalias viárias em tempo real via sensores de borda (smartphone do motociclista), processa e deduplica espacialmente no backend e os exibe num painel de inteligência operacional para tomada de decisão.

---

## Arquitetura do Ecossistema

```
┌─────────────────────────────────────────────────────────────────┐
│                     ViaGuardian Ecosystem                       │
│                                                                 │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────┐  │
│  │  Mobile Sensor   │───▶│   FastAPI +      │───▶│  React   │  │
│  │  React Native    │    │   PostGIS        │    │  Web App │  │
│  │  YOLOv8-Nano     │    │   (Docker)       │    │  (Vite)  │  │
│  └──────────────────┘    └──────────────────┘    └──────────┘  │
│   Edge AI / GPS           Dedup ST_DWithin        CCO Dashboard │
└─────────────────────────────────────────────────────────────────┘
```

### Fórmula IRV — Índice de Risco Viário

```
IRV = (Wa × D) + (Wh × S)
```

- `Wa = 0,6` — peso de anomalia (volume de detecções validadas na borda)
- `Wh = 0,4` — peso histórico (incidência de sinistros Infosiga SP)
- `D` = `recurrence_count` (deduplicação espacial PostGIS)
- `S` = score histórico por classe de anomalia (0–10)

---

## Sub-projetos

| Pasta | Stack | Responsabilidade |
|---|---|---|
| `/` (raiz) | React 19 + Vite 8 + Tailwind v3 | Intelligence Center — painel operacional CCO |
| `mobile/` | React Native 0.75 + Vision Camera v4 | App do motociclista — sensor de borda + AR |
| `backend/` | FastAPI 0.115 + PostGIS 15-3.3 | API de ingestão + motor de deduplicação espacial |

---

## 1 · Intelligence Center (Web Dashboard)

Painel escuro para o Centro de Controle Operacional (CCO), com 3 telas principais.

### Telas

| Rota | Página | Conteúdo |
|---|---|---|
| `/` | Login | Autenticação (protótipo) |
| `/dashboard` | Painel de Controle CCO | KPIs, Heatmap, Donut, Tendência |
| `/triage` | Triagem Operacional | Split-screen com vídeo + bounding box + decisão |
| `/cctv` | Monitoramento CFTV | Grid 6 câmeras + métricas YOLOv8 |

### Componentes principais

```
src/
├── components/
│   ├── ai/
│   │   └── AiAgentWidget.jsx       # Widget flutuante de IA (chat + sugestões)
│   ├── dashboard/
│   │   ├── KpiCard.jsx             # Cards com fórmula IRV e accent ring
│   │   ├── HeatmapPanel.jsx        # SVG heatmap preditivo (radialGradient)
│   │   ├── SeverityDonutChart.jsx  # Rosca de distribuição por severidade
│   │   └── IncidentTrendChart.jsx  # Gráfico de tendência semanal (Recharts)
│   ├── cftv/
│   │   └── CctvGrid.jsx            # Grid 6 câmeras: scanlines, REC, FPS, latência IA
│   ├── triage/
│   │   └── TriageTable.jsx         # Split 60/40: tabela + painel detalhe c/ bbox overlay
│   └── layout/
│       ├── AppShell.jsx            # Layout raiz + monta AiAgentWidget
│       ├── Header.jsx
│       └── Sidebar.jsx
├── pages/
│   ├── DashboardPage.jsx
│   ├── TriagePage.jsx
│   ├── CctvPage.jsx
│   └── LoginPage.jsx
├── hooks/
│   ├── useDashboardQueries.js      # TanStack Query v5 → dashboardService
│   └── useTriageQueries.js         # TanStack Query v5 → triageService
├── services/
│   ├── dashboardService.js         # GET /dashboard/metrics, /heatmap
│   └── triageService.js            # GET /triage/queue, PATCH .../status
├── mocks/
│   └── mockData.js                 # Fallback offline completo
└── lib/
    └── http.js                     # Instância axios configurada
```

### Stack Web

| Dependência | Versão | Uso |
|---|---|---|
| React | 19.2 | UI |
| Vite | 8.0 | Build / dev server |
| Tailwind CSS | 3.4 | Estilo (darkMode: 'class') |
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

API assíncrona de ingestão de telemetria de borda e fornecimento de métricas para o painel web.

### Estrutura Backend

```
backend/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── main.py                      # FastAPI app: CORS, lifespan, routers, /health
└── app/
    ├── config.py                # Pydantic Settings (.env)
    ├── database.py              # SQLAlchemy async engine + get_db + create_tables
    ├── models.py                # ORM: Incident, AnomalyClass enum, IncidentStatus enum
    ├── schemas.py               # Pydantic v2: IncidentPayload, TelemetryBatch, DashboardMetrics
    └── routers/
        ├── ingress.py           # POST /ingress/event, POST /ingress/batch
        └── dashboard.py         # GET /dashboard/metrics, /heatmap, /triage/queue, PATCH status
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

### Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Health check (Docker + load balancer) |
| `POST` | `/ingress/event` | Recebe evento único do sensor de borda |
| `POST` | `/ingress/batch` | Recebe lote ao fim da sessão de condução |
| `GET` | `/dashboard/metrics` | KPIs agregados (IRV, incidents_today, trend…) |
| `GET` | `/dashboard/heatmap` | Pontos georreferenciados para heatmap |
| `GET` | `/triage/queue` | Fila de incidentes pendentes (ordem IRV desc) |
| `PATCH` | `/triage/incidents/{id}/status` | Aprovar ou rejeitar incidente |

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

## Classes de Anomalia

| Classe | Score Histórico | Descrição |
|---|---|---|
| `near_miss` | 9.5 | Quase-acidentes com outros veículos |
| `risk_behavior` | 8.0 | Comportamentos de risco (ultrapassagem, velocidade) |
| `obstruction` | 6.0 | Obstruções de via |
| `pothole` | 5.5 | Buracos e depressões no asfalto |
| `faded_lane` | 4.0 | Sinalização horizontal apagada |

---

## Privacidade e LGPD

- **Sem dados pessoais**: o App Mobile nunca coleta nome, CPF ou identificadores diretos.
- **Device fingerprint**: hash SHA-256 one-way de metadados não-sensíveis do dispositivo (SO + versão + salt da app). Irreversível.
- **Coordenadas**: truncadas em 6 casas decimais (~11 cm de precisão). Bounding boxes ficam no campo `_bbox` — removidas antes do upload pelo `sanitizeBatch()`.
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
# API:  http://localhost:8000
# Docs: http://localhost:8000/docs

# 4. Mobile (em outro terminal)
cd mobile
npm install
npx react-native run-android
```
