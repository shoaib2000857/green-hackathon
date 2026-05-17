# Full Project Documentation

## 1. Project Overview

Carbon Passport AI is a multimodal logistics intelligence MVP built to evaluate freight movement across `truck`, `rail`, `sea`, and `air` modes.

The system combines:

- route optimization
- shipment-level carbon accounting
- emissions forecasting
- AI-assisted route explanations
- logistics graph visualization
- shipment passport generation
- tamper-evident audit history

The project is designed as a working prototype rather than a pure mock UI. It uses a runtime logistics graph, backend APIs, data ingestion scripts, and a frontend dashboard that operates on real route outputs.

## 2. High-Level Goals

The system is intended to support:

- carbon-aware route selection
- tradeoff analysis between carbon, cost, speed, and risk
- explainable logistics decisions
- shipment transparency through passports and QR access
- public-data-backed graph construction for logistics nodes and lanes

## 3. Tech Stack

### Backend

- `FastAPI`
- `Pydantic`
- `httpx`
- `networkx`
- `python-dotenv`
- optional `qrcode`
- optional `Ollama`

### Frontend

- `Next.js`
- `React`
- `Tailwind CSS`
- custom Leaflet-based route map loader

### Data / Runtime Artifacts

- `data/logistics_graph.json`
- `data/raw/` public dataset downloads

## 4. Core Product Features

### 4.1 Route Optimization

Implemented in [backend/app/optimizer.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/optimizer.py:1).

The optimizer:

- resolves origin and destination nodes from the logistics graph
- enumerates feasible paths up to a configurable hop count
- calculates route-level distance, time, cost, emissions, and average risk
- scores candidates using weighted optimization profiles
- returns:
  - a recommended route
  - alternative routes
  - Pareto-style tradeoff routes

Supported strategy profiles:

- `balanced`
- `carbon_first`
- `express`
- `low_cost`
- `low_risk`

### 4.2 Multimodal Journey Graph

Implemented in:

- [frontend/components/RouteMap.jsx](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/frontend/components/RouteMap.jsx:1)
- [backend/app/graph.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/graph.py:1)
- [backend/app/schemas.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/schemas.py:1)

Current behavior:

- renders `truck`, `rail`, `sea`, and `air` legs
- uses backend-provided coordinates and geometry per leg
- animates route drawing leg by leg
- shows cumulative CO2e
- includes a visible legend for all four transport modes

Important implementation detail:

- the map no longer depends on fragile hardcoded city-name matching
- each optimized route leg now carries coordinates and geometry from the backend

### 4.3 AI / LLM Explanations

Implemented in [backend/app/explanations.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/explanations.py:1).

Explanation modes:

- `ollama`
- `openai`
- `deterministic` fallback

The system now returns:

- `explanation`
- `explanation_source`
- `explanation_details`

This is surfaced in the dashboard in [frontend/app/page.tsx](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/frontend/app/page.tsx:1).

Current explanation behavior:

- if local LLM is enabled and reachable, the optimizer asks the LLM for a short route explanation
- if the LLM fails or is disabled, the system falls back to deterministic route summaries
- the frontend clearly shows the explanation source

### 4.4 Forecasting Page

Implemented in:

- [backend/app/forecast_router.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/forecast_router.py:1)
- [backend/app/forecaster.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/forecaster.py:1)
- [frontend/app/forecast/page.tsx](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/frontend/app/forecast/page.tsx:1)

This feature supports custom per-leg emissions forecasting with:

- mode selection
- weight
- fuel type
- load percentage
- reefer toggle
- departure date

Outputs include:

- nominal emissions
- low and high uncertainty bounds
- confidence score
- data source status
- factor provenance
- weather context when available

### 4.5 Data Source Visibility

The forecast page displays whether each source is:

- `Active`
- `Fallback`
- `Not used`

Current sources:

- `searoute`
- `OSRM`
- `Climatiq`
- `OpenWeatherMap`

This behavior was explicitly corrected so that a source is not incorrectly labeled as broken when it simply does not apply to the current leg mix.

### 4.6 Shipment Passport

Implemented across:

- [backend/app/repository.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/repository.py:1)
- [backend/app/ledger.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/ledger.py:1)
- [backend/app/main.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/main.py:1)
- [backend/app/qr.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/qr.py:1)

Capabilities:

- creates shipment records from optimized routes
- exposes a passport endpoint
- generates a QR or fallback SVG
- tracks appended legs
- exposes verification status

### 4.7 Tamper-Evident Ledger

Implemented in [backend/app/ledger.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/ledger.py:1).

The ledger:

- uses a hash-chain model
- stores per-leg hashes
- links each entry to the previous entry
- verifies integrity at read time

This is an in-memory MVP implementation of a tamper-evident shipment trail.

### 4.8 Scope 3 Analytics

Implemented in [backend/app/repository.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/repository.py:1).

The analytics endpoint summarizes:

- shipment count
- total emissions
- total distance
- emissions by mode
- emissions by lane
- average emissions per shipment

## 5. Backend Architecture

### 5.1 App Entry Point

[backend/app/main.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/main.py:1)

Responsibilities:

- loads `.env`
- configures CORS
- mounts forecast router
- exposes core API endpoints
- exposes shipment, passport, QR, and analytics endpoints

### 5.2 Graph Layer

[backend/app/graph.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/graph.py:1)

Responsibilities:

- loads runtime graph artifact
- builds node and edge adjacency
- resolves nodes by id, name, or country substring
- enumerates candidate paths
- converts graph edges into route legs

### 5.3 Data Models

[backend/app/schemas.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/schemas.py:1)

Key models:

- `Node`
- `Edge`
- `RouteLeg`
- `RouteOption`
- `OptimizeRouteRequest`
- `OptimizeRouteResponse`
- `Shipment`
- `Passport`
- `AnalyticsScope3`
- forecast request and response models

### 5.4 Carbon Calculation

[backend/app/carbon.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/app/carbon.py:1)

Current model:

- emissions = distance * tonnes * emission_factor

This is simple but usable for MVP route-level comparison.

## 6. Frontend Architecture

### 6.1 Dashboard

[frontend/app/page.tsx](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/frontend/app/page.tsx:1)

Responsibilities:

- collect optimization input
- call `/optimize-route`
- show recommended route
- render route metrics
- render journey graph
- show explanation block
- compare tradeoff routes
- create shipment passports

### 6.2 Forecast Page

[frontend/app/forecast/page.tsx](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/frontend/app/forecast/page.tsx:1)

Responsibilities:

- collect custom forecast legs
- call `/forecast/emissions`
- render data source methodology
- render uncertainty and confidence details
- render per-leg emissions cards

### 6.3 Map Component

[frontend/components/RouteMap.jsx](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/frontend/components/RouteMap.jsx:1)

Responsibilities:

- lazy-load Leaflet
- render animated route geometry
- show legend
- show cumulative CO2e
- replay animation

### 6.4 Shared API Types

[frontend/lib/api.ts](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/frontend/lib/api.ts:1)

Responsibilities:

- frontend type definitions
- JSON fetch helpers

## 7. Data Ingestion System

### 7.1 Fetch Script

[scripts/fetch_public_logistics_data.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/scripts/fetch_public_logistics_data.py:1)

Purpose:

- downloads public raw datasets into `data/raw/`

Sources currently handled:

- `UN/LOCODE`
- `World Port Index`
- `OurAirports`

Important implementation details:

- uses a browser-style user agent
- retries transient failures
- falls back to unverified SSL for problematic upstream TLS chains
- reuses existing local files if refresh fails
- reports partial success instead of aborting everything

### 7.2 Ingest Script

[scripts/ingest_logistics_data.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/scripts/ingest_logistics_data.py:1)

Purpose:

- reads public raw files
- merges them into the runtime node set
- enriches curated demo edges
- auto-generates multimodal edges
- writes `data/logistics_graph.json`

Supported inputs:

- `UN/LOCODE` zip
- `World Port Index` geojson
- `OurAirports` airports CSV
- local emission factor JSON

Supported behaviors:

- external node inclusion
- API-based route enrichment
- graph density limiting
- progress logging

### 7.3 Ingest Progress Logging

This was explicitly improved because the script appeared stuck.

Current progress output includes:

- startup
- dataset load start/end
- curated edge enrichment progress
- generated edge totals per mode
- final artifact summary

### 7.4 Current Graph Scale

Using the present raw data import path, the generated runtime graph reached approximately:

- `758` nodes
- `3900` edges

This includes:

- built-in curated demo nodes
- external airport nodes
- external port nodes
- external UN/LOCODE logistics nodes
- auto-generated edges for all four transport modes

## 8. Data Sources and External Integrations

### 8.1 UN/LOCODE

Used for:

- logistics locations
- port / airport / rail / inland node classification

### 8.2 World Port Index

Used for:

- port enrichment
- port coordinate improvement

### 8.3 OurAirports

Used for:

- airport node ingestion
- airport coordinate enrichment

### 8.4 OSRM

Used for:

- truck road distance enrichment

### 8.5 searoute

Used for:

- sea route distance enrichment
- sea-leg forecast distance resolution

### 8.6 Climatiq

Used for:

- verified freight emission factor estimation in forecasting

### 8.7 OpenWeatherMap

Used for:

- weather-adjusted uncertainty context in forecasting
- optional risk estimation in ingest enrichment

### 8.8 Ollama

Used for:

- local AI route explanations

## 9. API Surface

### Core Backend

- `GET /health`
- `GET /nodes`
- `GET /data-sources/status`
- `POST /optimize-route`
- `POST /shipments/create`
- `POST /shipments/{shipment_id}/append-leg`
- `GET /shipments/{shipment_id}/passport`
- `GET /shipments/{shipment_id}/passport/qr`
- `GET /analytics/scope3`

### Forecast API

- `POST /forecast/emissions`
- `GET /forecast/factors`
- `GET /forecast/health`

## 10. Environment Variables

Defined in [.env.example](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/.env.example:1).

### LLM / Explanations

- `ENABLE_LLM_EXPLANATIONS`
- `LLM_PROVIDER`
- `LLM_MODEL`
- `LLM_BASE_URL`
- `LLM_TEMPERATURE`
- `OLLAMA_MODEL`
- `OLLAMA_BASE_URL`
- `OLLAMA_TIMEOUT_SECONDS`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

### App / Frontend

- `DATABASE_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `PUBLIC_FRONTEND_URL`

### Graph / Ingest

- `USE_INGESTED_GRAPH`
- `LOGISTICS_GRAPH_PATH`
- `INGEST_ENABLE_APIS`
- `INGEST_GENERATE_NETWORK`
- `INGEST_MAX_NEIGHBORS_PER_MODE`
- `UNLOCODE_PATH`
- `WORLD_PORT_INDEX_PATH`
- `OURAIRPORTS_PATH`
- `EMISSION_FACTORS_PATH`

### External Services

- `OSRM_BASE_URL`
- `CLIMATIQ_API_KEY`
- `CLIMATIQ_DATA_VERSION`
- `OPENWEATHER_API_KEY`

## 11. Features Added and Corrected During This Buildout

This section summarizes concrete implemented changes reflected in the current codebase.

### Route Map / Journey Graph

- moved map rendering off hardcoded waypoint name matching
- added backend coordinates and geometry into route legs
- enabled all four transport modes in the legend
- added geometry-aware rendering for generated routes

### Forecasting

- switched sea routing from paid SeaRoutes integration to free local `searoute`
- corrected `.env` loading so API keys are read by the backend
- fixed source-status UI to distinguish `Not used` from `Fallback`
- repaired Climatiq factor payloads and selectors

### Data Ingestion

- added public-data downloader
- added support for `UN/LOCODE`, `World Port Index`, and `OurAirports`
- added automatic edge generation for `truck`, `rail`, `air`, and `sea`
- added ingest progress logging
- fixed parser handling for:
  - UN/LOCODE zip contents
  - WPI geojson property names
  - zero-distance generated edges

### Explanations

- kept deterministic fallback explanations
- added provider-aware explanation output
- added structured explanation detail bullets
- exposed explanation source on the frontend

## 12. Testing and Validation

Backend tests live in:

- [backend/tests/test_optimizer.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/tests/test_optimizer.py:1)
- [backend/tests/test_ingestion.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/tests/test_ingestion.py:1)
- [backend/tests/test_cors.py](/media/shoaib/STUDYLINUX/Hackathons/green-hackathon/backend/tests/test_cors.py:1)

Common verification commands:

```bash
ENABLE_LLM_EXPLANATIONS=false PYTHONPATH=backend pytest backend/tests -q
```

```bash
cd frontend
npm run build
```

## 13. Current Limitations

This is still an MVP. Important constraints remain:

- air and rail routes are generated from coordinates and heuristics, not from live timetable or carrier APIs
- the optimizer operates on a graph approximation, not a fully validated global freight network
- many cost and risk values are estimated rather than sourced from live commercial systems
- persistence is in-memory for shipment and ledger state
- shipment passports are not yet backed by a real database

## 14. Recommended Next Steps

If this project continues, the highest-value next improvements are:

1. move shipment, ledger, and analytics storage into PostgreSQL
2. add richer explanation comparisons between recommended and rejected routes
3. add more realistic rail and air network generation from better public route sources
4. add lane caching for OSRM and sea route enrichment
5. add an admin page for graph metadata, ingestion stats, and source health
6. add exportable route / passport reports

## 15. Operational Commands

### Fetch Public Data

```bash
python scripts/fetch_public_logistics_data.py
```

### Build Runtime Graph

```bash
PYTHONPATH=backend python scripts/ingest_logistics_data.py \
  --unlocode data/raw/unlocode.zip \
  --world-port-index data/raw/world_port_index.geojson \
  --ourairports data/raw/ourairports_airports.csv \
  --include-external-nodes \
  --enable-apis
```

### Run Backend

```bash
PYTHONPATH=backend uvicorn app.main:app --reload --port 8000
```

### Run Frontend

```bash
cd frontend
npm run dev
```

### Run Tests

```bash
ENABLE_LLM_EXPLANATIONS=false PYTHONPATH=backend pytest backend/tests -q
```
