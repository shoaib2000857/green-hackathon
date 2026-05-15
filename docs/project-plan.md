# Carbon Passport AI Project Plan

## Product Positioning

Carbon Passport AI is an AI-powered multimodal logistics intelligence system. It focuses on shipment-level carbon tracking, route optimization, Scope 3 emissions intelligence, explainable recommendations, and optional tamper-evident verification.

## MVP Priorities

- Route graph across multimodal logistics hubs.
- Emissions engine using distance, weight, and mode factors.
- Route optimizer that compares carbon, cost, time, and risk.
- Dashboard for analytics and route comparison.
- AI explanation layer with LLM-ready interface.
- QR passport for consumer and auditor visibility.

## Architecture

```text
Ingested logistics data or built-in seed graph
        |
Transport graph builder
        |
Carbon, cost, time, risk engine
        |
Route optimization engine
        |
Explanation layer
        |
Dashboard and QR passport
```

## Next Production Steps

- Add scheduled ingestion for UN/LOCODE, World Port Index, OSM/OSRM, SeaRoutes, Climatiq/GLEC, ICAO, and OpenWeatherMap.
- Replace representative fallback factors with certified GLEC/Climatiq/ICAO factors per lane, vehicle, and region.
- Move in-memory repositories to PostgreSQL.
- Add authenticated tenant workspaces for enterprise users.
- Add real carrier tracking and ingestion pipelines.
