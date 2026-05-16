from __future__ import annotations

import os

from fastapi import APIRouter

from .forecaster import ForecastRequest, ForecastResponse, GLEC_FACTORS, forecast_emissions, searoute_available

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.post("/emissions", response_model=ForecastResponse)
async def emissions_forecast(request: ForecastRequest) -> ForecastResponse:
    return await forecast_emissions(request)


@router.get("/factors")
async def forecast_factors() -> dict[str, dict[str, float]]:
    return GLEC_FACTORS


@router.get("/health")
async def forecast_health() -> dict[str, bool | str]:
    return {
        "status": "ok",
        "climatiq_configured": bool(os.getenv("CLIMATIQ_API_KEY")),
        "searoute_available": searoute_available(),
        "openweather_configured": bool(os.getenv("OPENWEATHER_API_KEY")),
    }
