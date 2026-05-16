# Carbon Passport AI

AI-powered multimodal logistics intelligence MVP for shipment-level carbon tracking, route optimization, explainable recommendations, and tamper-evident shipment passports.

## What This Builds

- FastAPI backend with a synthetic multimodal logistics graph.
- Shipment-level CO2e engine using mode-specific freight factors.
- Carbon/cost/time/risk route optimizer with Pareto-style alternatives.
- Explainable recommendation layer with deterministic fallback and optional LLM hook.
- QR/passport API with tamper-evident hash-chain verification.
- Next.js + Tailwind frontend shell for dashboard, route comparison, and passport views.

## Quick Start

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Local Ollama explanations:

```bash
ollama serve
ollama pull llama3.1:8b
cp .env.example .env
```

The backend uses `LLM_PROVIDER=ollama` by default for route explanations. If Ollama is unavailable, it falls back to deterministic explanations instead of failing the route optimizer.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The frontend expects the API at `http://localhost:8000` unless `NEXT_PUBLIC_API_BASE_URL` is set.

## Demo Flow

1. Create a shipment from `Chennai` to `Tokyo` with a weight such as `1200 kg`.
2. Compare carbon-first, balanced, express, low-cost, and low-risk route options.
3. Select the recommended route and inspect the explanation.
4. Open the QR/passport view for shipment history and verification status.

## API Highlights

- `GET /health`
- `GET /nodes`
- `GET /data-sources/status`
- `POST /optimize-route`
- `POST /shipments/create`
- `POST /shipments/{shipment_id}/append-leg`
- `GET /shipments/{shipment_id}/passport`
- `GET /shipments/{shipment_id}/passport/qr`
- `GET /analytics/scope3`

## MVP Assumptions

- Logistics nodes and lanes load from `data/logistics_graph.json` when generated, otherwise from the built-in demo graph.
- `scripts/ingest_logistics_data.py` can merge local UN/LOCODE and World Port Index exports, local searoute maritime distances, optional OSRM/OpenWeatherMap calls, and local emission factor files.
- Emission factors remain representative defaults unless replaced with certified GLEC/Climatiq/ICAO-backed values.
- Persistence is in-memory for speed. PostgreSQL schema is included in `docs/database.sql`.
- The ledger is a PostgreSQL-ready hash-chain design implemented in-memory for this MVP.

## Data Ingestion

Build or refresh the runtime logistics graph:

```bash
PYTHONPATH=backend python scripts/ingest_logistics_data.py
```

Optional dataset/API inputs:

```bash
PYTHONPATH=backend python scripts/ingest_logistics_data.py \
  --unlocode /path/to/unlocode.csv \
  --world-port-index /path/to/world_port_index.csv \
  --emission-factors data/emission_factors.sample.json \
  --enable-apis
```

API enrichment is opt-in. `--enable-apis` uses `OSRM_BASE_URL` for truck routing and `OPENWEATHER_API_KEY` for weather risk when configured. Maritime distances use the free local `searoute` Python package from backend requirements, with haversine fallback when unavailable.
