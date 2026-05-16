# Features — Carbon Passport AI

This document summarizes the current features implemented in the repository: backend APIs, optimization and emissions logic, LLM usage, frontend UI capabilities, data ingestion, integrations, and developer/runtime configuration.

## Project overview

- **Purpose**: Multimodal logistics carbon intelligence that helps compare freight routes by carbon, cost, time, and risk and generates a verifiable digital "carbon passport" for shipments.
- **Tech stack**: FastAPI backend, Next.js + React frontend, NetworkX for graph traversal, optional LLM providers for natural-language explanations.

## Models & algorithms

- **LLM explanations**: Optional LLM-based one-sentence explanations for route recommendations. Configured via environment variables. Defaults:
  - Provider: `ollama` (fallback). Default model: `llama3.1:8b` (env: `OLLAMA_MODEL` / `LLM_MODEL`).
  - `OPENAI` compatible option supported (env: `OPENAI_API_KEY`, `OPENAI_MODEL` default `gpt-4.1-mini`).
  - Toggle: `ENABLE_LLM_EXPLANATIONS` (default `true`).
- **Route optimization**: Deterministic, graph-based route enumeration and scoring (no ML training).
  - Uses the `LogisticsGraph` (NetworkX multi-directed graph) to enumerate paths between origin and destination.
  - For each path, calculates distance, time, cost, emissions, and risk and builds candidate `RouteOption`s.
  - Uses profile-weighted scoring (profiles: `carbon_first`, `balanced`, `express`, `low_cost`, `low_risk`) and a configurable `weights` override.
  - Selects a recommended route plus Pareto-style tradeoff options.
- **Emissions calculation**: Simple physics-style formula using per-lane emission factors (kg CO2e per tonne-km):
  - emissions_kg = distance_km * (weight_kg / 1000) * emission_factor_kg_per_tonne_km

- **Emissions forecast (new)**: Per-leg probabilistic emission forecasting and aggregated totals.
  - Inputs: a `ForecastRequest` containing a list of `ForecastLeg` entries. Each leg accepts `from_node`, `to_node`, `mode` (sea/road/air/rail), `weight_kg`, and optional fields: `load_pct` (default 75), `fuel_type`, `is_reefer`, and `departure_date` (ISO date string used to fetch short-term weather forecast when available).
  - Per-leg behavior:
    - Resolve node metadata from the logistics graph to obtain coordinates and human-friendly names.
    - Resolve distance using the best available source:
      - `sea`: use SeaRoutes API when `SEAROUTES_API_KEY` is configured, otherwise fall back to haversine × 1.25 (approximate sea routing).
      - `road`: use OSRM (`OSRM_BASE_URL`) when available, otherwise use haversine.
      - `air`: use haversine × 1.09; `rail`: use haversine × 1.2.
    - Estimate base emissions:
      - Prefer Climatiq (`CLIMATIQ_API_KEY`) estimate (mode → activity id mapping). If Climatiq is unavailable or fails, fall back to the local `GLEC_FACTORS` lookup.
      - Nominal emissions = factor × distance_km × tonnes (where tonnes = weight_kg / 1000).
    - Apply deterministic corrections for operational context: a load-factor multiplier (captures under/over-loading effects), a reefer penalty (+35% when `is_reefer`), and an altitude multiplier (air ×2).
    - Optionally request short-term weather context from OpenWeather (`OPENWEATHER_API_KEY`) when `departure_date` is provided; incorporate weather-driven uncertainty (e.g., high sea wind, sub-zero road temps) into the uncertainty estimate.
    - Build uncertainty heuristically (base uncertainty plus contributions from factor source, load default, distance source, and weather). Convert uncertainty to a confidence label (`high`/`medium`/`low`) using thresholds.
    - Return a `LegForecast` containing: `distance_km` and `distance_source`, `emissions_nominal_kg`, `emissions_low_kg`, `emissions_high_kg`, `confidence`, `emission_factor_source`, `corrections_applied`, and `weather_context` when available.
  - Aggregation and response:
    - The API sums nominal/low/high across legs, picks the worst per-leg confidence as `overall_confidence`, and returns a `ForecastResponse` with per-leg forecasts, totals, and a `generated_at` timestamp.
  - Endpoints exposed:
    - `POST /forecast/emissions` — calculate per-leg forecasts and aggregated totals.
    - `GET /forecast/factors` — return the local `GLEC_FACTORS` fallback table used when external factor estimates are not available.
    - `GET /forecast/health` — simple health + integration flags (`CLIMATIQ_API_KEY`, `SEAROUTES_API_KEY`, `OPENWEATHER_API_KEY`).
  - Environment variables that influence behavior: `CLIMATIQ_API_KEY`, `SEAROUTES_API_KEY`, `OSRM_BASE_URL`, `OPENWEATHER_API_KEY`.
  - Default local `GLEC_FACTORS` used as fallbacks (implemented in code):
    - `sea`: diesel 0.011 kg/tkm, marine_diesel 0.013, lng 0.008
    - `road`: diesel 0.096 kg/tkm, electric 0.040
    - `air`: kerosene 0.602 kg/tkm
    - `rail`: diesel 0.028 kg/tkm, electric 0.018

## Backend features (API)

- **Health & metadata**:
  - `GET /health` — basic health check.
  - `GET /nodes` — list available logistics nodes (hubs, ports, airports).
  - `GET /data-sources/status` — returns graph metadata and which external integrations appear configured.
- **Optimization & shipments**:
  - `POST /optimize-route` — optimize routes (body: origin, destination, weight_kg, priority, optional weights, max_hops). Returns `OptimizeRouteResponse`.
  - `POST /shipments/create` — create a shipment record + ledger entries and produce a `passport_url`.
  - `POST /shipments/{shipment_id}/append-leg` — append an extra verified leg to an existing shipment (creates a ledger entry).
  - `GET /shipments/{shipment_id}/passport` — retrieve the digital passport for a shipment (includes legs, ledger, verification status).
  - `GET /shipments/{shipment_id}/passport/qr` — PNG QR (or SVG fallback) linking to the passport.
  - `GET /analytics/scope3` — simple Scope 3 snapshot across created shipments (counts, total emissions, breakdowns).

- **Emissions forecasting APIs**:
  - `POST /forecast/emissions` — per-leg probabilistic emissions forecast and totals (see "Emissions forecast (new)" for details).
  - `GET /forecast/factors` — return fallback emission factor table (`GLEC_FACTORS`).
  - `GET /forecast/health` — health and integration flags for forecast-related services.

## Tamper-evidence (ledger)

- **Hash-chain ledger**: Lightweight hash-chain of ledger entries per shipment. Each appended leg produces a `LedgerEntry` (payload hash, previous hash, entry hash) enabling tamper-evident verification via `ledger.verify()`.

## Frontend (UI) features

- **Dashboard (`/`)**
  - Route optimization form: origin, destination, weight (kg), priority selector.
  - Default demo route loaded on first visit (Chennai → Tokyo sample).
  - Recommendation card: concise explanation, CO2e, cost, time, carbon saved, button to create shipment passport.
  - Pareto-style route cards: show alternate tradeoff routes with metrics and tradeoffs text.
  - Carbon price simulator: slider to adjust $/tCO2 and see "true cost" adjusted ranking.
  - Route map: animated journey graph (Leaflet via CDN), waypoint markers, replay animation, accumulated CO2 counter.
  - Scope 3 snapshot panel with simple analytics (shipments, total CO2e, distance, avg per shipment).

- **Passport page (`/passport/[shipmentId]`)**
  - QR image for passport (served from backend endpoint).
  - Shipment summary: origin / destination, weight, totals (CO2e, cost, time), verification status.
  - Tamper-evident ledger viewer: list of ledger hashes and timestamps.
  - Carbon offset panel (demo): shows equivalencies (trees, km, flights), offset cost calculator, and a local/UI-only "confirm offset" flow. (Note: demo only — no real payment gateway integrated.)

## Data & ingestion

- **Seed/demo data**: Built-in nodes and edges in `backend/app/data.py` provide a demo logistics graph and representative emission factors.
- **Ingested graph (optional)**: If `USE_INGESTED_GRAPH=true` and a valid JSON artifact exists at `data/logistics_graph.json` (or overridden via `LOGISTICS_GRAPH_PATH`), the app will load that artifact at runtime. See [backend/app/ingestion.py](backend/app/ingestion.py).
- **Sample files**: `data/emission_factors.sample.json` — a sample emission factors file included in the repo.

## External integrations & configuration flags

- **LLM providers** (explanations):
  - `LLM_PROVIDER` — `ollama` (default) or `openai`/`openai-compatible`.
  - `OLLAMA_BASE_URL` / `LLM_BASE_URL` — base URL for Ollama server (default: `http://127.0.0.1:11434`).
  - `OLLAMA_MODEL` / `LLM_MODEL` — model name (default `llama3.1:8b`).
  - `OLLAMA_TIMEOUT_SECONDS` — request timeout for Ollama calls (default `20`).
  - `LLM_TEMPERATURE` — temperature for LLM generation (default `0.1`).
  - `OPENAI_API_KEY` — set to enable OpenAI provider; `OPENAI_MODEL` default `gpt-4.1-mini`.
- **Graph ingestion**: `USE_INGESTED_GRAPH`, `LOGISTICS_GRAPH_PATH`.
- **Networking & integrations**: `CORS_ALLOW_ORIGINS`, `PUBLIC_FRONTEND_URL`, `OSRM_BASE_URL`, `CLIMATIQ_API_KEY`, `SEAROUTES_API_KEY`, `OPENWEATHER_API_KEY` (used only for metadata flags; see `GET /data-sources/status`).

## Developer hints — how to run locally

- Backend (Python + FastAPI)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Run the API (default uvicorn port 8000)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Notes:
- The frontend expects the backend API base at `http://localhost:8000` by default; override with `NEXT_PUBLIC_API_BASE_URL`.
- To enable LLM explanations locally using Ollama, run a local Ollama server and set `OLLAMA_BASE_URL` plus any model selection env vars.

## Files of interest

- Backend entrypoint: `backend/app/main.py`
- Optimization & scoring: `backend/app/optimizer.py`
- Graph & demo data: `backend/app/graph.py`, `backend/app/data.py`, `data/logistics_graph.json`
- LLM explanations: `backend/app/explanations.py`
- Ledger: `backend/app/ledger.py`
- Frontend dashboard and passport: `frontend/app/page.tsx`, `frontend/app/passport/[shipmentId]/page.tsx`

## Limitations & next steps

- Optimization is algorithmic (graph enumeration + heuristic scoring). Add large-scale routing algorithms or external route optimization services for production scale.
- Carbon offsetting is a UI-only demo flow. Integrate with an offset marketplace (Patch, Gold Standard) for real offsets.
- Add authentication, persistence (DB), and background workers for long-running ingestion/refresh tasks.

---
