# Carbon Passport AI

Carbon Passport AI is a multimodal logistics intelligence MVP for:

- route optimization across `truck`, `rail`, `sea`, and `air`
- shipment-level carbon estimation and forecasting
- AI-assisted route explanations
- tradeoff comparison across carbon, cost, time, and risk
- shipment passport generation with a tamper-evident audit trail

The stack is:

- `FastAPI` backend
- `Next.js` frontend
- a runtime logistics graph loaded from `data/logistics_graph.json`
- optional local `Ollama` explanations
- optional public-data ingestion from `UN/LOCODE`, `World Port Index`, and `OurAirports`

For the full system writeup, see [docs/FULL_PROJECT_DOCUMENTATION.md](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/docs/FULL_PROJECT_DOCUMENTATION.md:1).

## What The App Does

The main dashboard at `http://localhost:3000` lets you:

- optimize a shipment lane between two logistics nodes
- compare route strategies such as `balanced`, `carbon_first`, `express`, `low_cost`, and `low_risk`
- inspect a multimodal journey graph with all four transport modes
- view AI-generated or deterministic route explanations
- create a shipment passport and view the audit trail

The forecast page at `/forecast` lets you:

- estimate per-leg emissions for custom legs
- compare best-case and worst-case uncertainty
- see which data sources were active vs fallback
- use local `searoute`, public `OSRM`, `Climatiq`, and `OpenWeatherMap` when configured

## Repository Layout

- `backend/app/`: API, optimization, graph loading, forecasting, explanations, passport logic
- `frontend/app/`: dashboard, forecast page, passport page
- `frontend/components/`: map and UI components
- `scripts/fetch_public_logistics_data.py`: downloads public raw datasets into `data/raw/`
- `scripts/ingest_logistics_data.py`: merges raw datasets and builds `data/logistics_graph.json`
- `data/logistics_graph.json`: runtime graph artifact used by the optimizer
- `data/raw/`: downloaded public input files
- `docs/database.sql`: PostgreSQL-ready schema sketch

## Requirements

- Python `3.11+`
- Node `18+` or `20+`
- `npm`
- optional: `ollama`

## Environment

Copy the example file:

```bash
cp .env.example .env
```

Important settings:

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
- `USE_INGESTED_GRAPH=true`
- `LOGISTICS_GRAPH_PATH=data/logistics_graph.json`
- `ENABLE_LLM_EXPLANATIONS=true`
- `LLM_PROVIDER=ollama`
- `OLLAMA_MODEL=gemma3n:e4b`
- `OSRM_BASE_URL=https://router.project-osrm.org`
- `CLIMATIQ_API_KEY=...` for verified factor lookup on the forecast page
- `OPENWEATHER_API_KEY=...` for weather context on the forecast page

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

If you prefer to run from repo root:

```bash
PYTHONPATH=backend uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open:

- dashboard: `http://localhost:3000`
- backend docs: `http://localhost:8000/docs`

## AI Explanations

The optimizer always returns an explanation.

Two modes exist:

- `ollama`: uses the local LLM configured in `.env`
- `deterministic`: fallback when the LLM is unavailable or disabled

To use local Ollama:

```bash
ollama serve
ollama pull gemma3n:e4b
```

Relevant env vars:

- `ENABLE_LLM_EXPLANATIONS=true`
- `LLM_PROVIDER=ollama`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- `OLLAMA_MODEL=gemma3n:e4b`
- `OLLAMA_TIMEOUT_SECONDS=20`

If Ollama is not reachable, route optimization still works and explanations fall back automatically.

## Main API Endpoints

- `GET /health`
- `GET /nodes`
- `GET /data-sources/status`
- `POST /optimize-route`
- `POST /shipments/create`
- `POST /shipments/{shipment_id}/append-leg`
- `GET /shipments/{shipment_id}/passport`
- `GET /shipments/{shipment_id}/passport/qr`
- `GET /analytics/scope3`
- `POST /forecast/emissions`
- `GET /forecast/factors`
- `GET /forecast/health`

## Runtime Graph

The optimizer reads from:

- `data/logistics_graph.json` when `USE_INGESTED_GRAPH=true`
- built-in seed data when the graph artifact is missing or disabled

The current runtime graph can contain:

- curated demo nodes and lanes
- ingested external ports, airports, rail terminals, and inland hubs
- auto-generated multimodal edges from ingested node coordinates
- geometry used by the journey graph

## Public Data Fetch

Download public raw data into `data/raw/`:

```bash
python scripts/fetch_public_logistics_data.py
```

This attempts to fetch:

- `UN/LOCODE`
- `World Port Index`
- `OurAirports`

Notes:

- the fetcher is resilient to flaky upstreams
- if one source fails but an existing local file is already present, it reuses the existing file
- output is reported as JSON under `downloaded` and optional `warnings`

You can skip sources:

```bash
python scripts/fetch_public_logistics_data.py --skip-world-port-index
```

## Data Ingestion

Build or refresh the runtime graph:

```bash
PYTHONPATH=backend python scripts/ingest_logistics_data.py
```

Use downloaded public files explicitly:

```bash
PYTHONPATH=backend python scripts/ingest_logistics_data.py \
  --unlocode data/raw/unlocode.zip \
  --world-port-index data/raw/world_port_index.geojson \
  --ourairports data/raw/ourairports_airports.csv \
  --include-external-nodes \
  --enable-apis
```

Useful flags:

- `--include-external-nodes`: adds external nodes beyond the built-in demo set
- `--enable-apis`: enables live enrichment where supported
- `--max-external-nodes N`: caps node expansion
- `--max-neighbors-per-mode N`: caps auto-generated graph density
- `--quiet`: suppresses progress logs

Relevant env vars:

- `INGEST_ENABLE_APIS=false`
- `INGEST_GENERATE_NETWORK=true`
- `INGEST_MAX_NEIGHBORS_PER_MODE=4`
- `UNLOCODE_PATH=...`
- `WORLD_PORT_INDEX_PATH=...`
- `OURAIRPORTS_PATH=...`
- `EMISSION_FACTORS_PATH=data/emission_factors.sample.json`

### What Ingest Does

The ingest script:

1. loads built-in demo nodes
2. merges external ports, airports, rail hubs, and inland terminals
3. enriches curated edges
4. auto-generates additional `truck`, `rail`, `air`, and `sea` edges
5. writes `data/logistics_graph.json`

When run without `--quiet`, it prints progress such as:

- dataset load counts
- curated edge enrichment progress
- generated edge progress by mode
- final node and edge totals

## Forecast Data Sources

The forecast page can use:

- `searoute` for sea-leg distance
- `OSRM` for road-leg distance
- `Climatiq` for verified emission factors
- `OpenWeatherMap` for weather context

Behavior:

- if a source is not applicable to the current leg types, the UI shows `Not used`
- if a source is applicable but unavailable, the UI shows `Fallback`
- if a source is working, the UI shows `Active`

## Current Modeling Assumptions

This repo is still an MVP. Important limits:

- air and rail lane generation is coordinate-based and heuristic, not carrier-schedule-backed
- costs, times, and risks are partly synthetic
- the optimizer is real, but not operating on a complete global freight network
- persistence is in-memory for app state
- the passport ledger is implemented in-memory, with a PostgreSQL-ready direction in `docs/database.sql`

## Testing

Backend tests:

```bash
ENABLE_LLM_EXPLANATIONS=false PYTHONPATH=backend pytest backend/tests -q
```

Frontend production build check:

```bash
cd frontend
npm run build
```

## Typical Workflow

For a fresh checkout:

```bash
cp .env.example .env
python scripts/fetch_public_logistics_data.py
PYTHONPATH=backend python scripts/ingest_logistics_data.py \
  --unlocode data/raw/unlocode.zip \
  --world-port-index data/raw/world_port_index.geojson \
  --ourairports data/raw/ourairports_airports.csv \
  --include-external-nodes \
  --enable-apis
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
```

## Troubleshooting

### `fetch_public_logistics_data.py` looks stuck

`World Port Index` is the slowest and least reliable upstream. The script now retries and can reuse existing files, but the download may still take time. Check `data/raw/` to see what has already landed.

### `ingest_logistics_data.py` looks stuck

Run without `--quiet`. It now prints stage-level progress, including dataset merges and generated edge counts per mode.

### Forecast sources stay on fallback

Check:

- backend was restarted after editing `.env`
- `CLIMATIQ_API_KEY` is set
- `OPENWEATHER_API_KEY` is set
- your forecast includes a `road` leg for `OSRM`
- your forecast includes a `sea` leg for `searoute`
- your forecast includes a `departure_date` for weather context

### The journey graph is missing lines or modes

Make sure the optimizer is using the ingested graph and that the frontend has been rebuilt after schema changes. The map now renders all four transport modes from backend geometry data.

## Status

This repo is no longer using a tiny hardcoded truck/sea-only map path. It now supports:

- four-mode journey graph rendering
- public-data-backed graph expansion
- AI explanation blocks with source attribution
- forecast source visibility and fallback reporting
