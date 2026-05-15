from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from .graph import graph
from .ledger import ledger
from .optimizer import optimize_route
from .qr import make_fallback_svg, make_qr_png
from .repository import repository
from .schemas import (
    AnalyticsScope3,
    AppendLegRequest,
    Node,
    OptimizeRouteRequest,
    OptimizeRouteResponse,
    Passport,
    Shipment,
    ShipmentCreateRequest,
)

app = FastAPI(
    title="Carbon Passport AI",
    version="0.1.0",
    description="Multimodal logistics carbon intelligence and shipment passport API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/nodes", response_model=list[Node])
def list_nodes() -> list[Node]:
    return list(graph.nodes.values())


@app.get("/data-sources/status")
def data_sources_status() -> dict[str, object]:
    return {
        "graph": graph.metadata,
        "nodes": len(graph.nodes),
        "edges": len(graph.edges),
        "external_api_config": {
            "osrm_base_url": os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org"),
            "climatiq_configured": bool(os.getenv("CLIMATIQ_API_KEY")),
            "searoutes_configured": bool(os.getenv("SEAROUTES_API_KEY")),
            "openweather_configured": bool(os.getenv("OPENWEATHER_API_KEY")),
            "ollama_configured": os.getenv("LLM_PROVIDER", "ollama") == "ollama",
        },
    }


@app.post("/optimize-route", response_model=OptimizeRouteResponse)
def optimize_route_endpoint(request: OptimizeRouteRequest) -> OptimizeRouteResponse:
    try:
        return optimize_route(request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/shipments/create", response_model=Shipment)
def create_shipment(request: ShipmentCreateRequest) -> Shipment:
    try:
        return repository.create(request, public_base_url=os.getenv("PUBLIC_FRONTEND_URL", "http://localhost:3000"))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/shipments/{shipment_id}/append-leg")
def append_leg(shipment_id: str, request: AppendLegRequest) -> dict[str, object]:
    try:
        leg = repository.append_leg(shipment_id, request)
        return {"status": "appended", "leg": leg}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Shipment not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/shipments/{shipment_id}/passport", response_model=Passport)
def get_passport(shipment_id: str) -> Passport:
    try:
        shipment = repository.get(shipment_id)
        legs = repository.legs_for(shipment_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Shipment not found") from exc

    total_emissions = round(sum(leg.emissions_kg for leg in legs), 3)
    total_cost = round(sum(leg.cost_usd for leg in legs), 2)
    total_time = round(sum(leg.travel_time_hr for leg in legs), 3)
    modes = list(dict.fromkeys(leg.mode for leg in legs))
    entries = ledger.entries_for(shipment_id)
    verified = ledger.verify(shipment_id)
    return Passport(
        shipment=shipment,
        total_emissions_kg=total_emissions,
        total_cost_usd=total_cost,
        total_time_hr=total_time,
        modes_used=modes,
        legs=legs,
        ledger=entries,
        verification_status="verified" if verified else "tampered",
        audit_summary={
            "ledger_entries": len(entries),
            "first_hash": entries[0].entry_hash if entries else None,
            "latest_hash": entries[-1].entry_hash if entries else None,
            "scope3_category": "Upstream and downstream transportation and distribution",
        },
    )


@app.get("/shipments/{shipment_id}/passport/qr")
def get_passport_qr(shipment_id: str, request: Request) -> Response:
    try:
        shipment = repository.get(shipment_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Shipment not found") from exc

    payload = shipment.passport_url or str(request.url_for("get_passport", shipment_id=shipment_id))
    png = make_qr_png(payload)
    if png:
        return Response(content=png, media_type="image/png")
    return Response(content=make_fallback_svg(payload), media_type="image/svg+xml")


@app.get("/analytics/scope3", response_model=AnalyticsScope3)
def analytics_scope3() -> AnalyticsScope3:
    return repository.analytics()
