from __future__ import annotations

import asyncio
import importlib.util
import math
import os
from datetime import UTC, datetime
from typing import Any

import httpx
from pydantic import BaseModel

from .graph import graph


class ForecastLeg(BaseModel):
    from_node: str
    to_node: str
    mode: str
    weight_kg: float
    load_pct: float = 75.0
    fuel_type: str = "diesel"
    is_reefer: bool = False
    departure_date: str = ""


class ForecastRequest(BaseModel):
    legs: list[ForecastLeg]
    currency: str = "USD"


class LegForecast(BaseModel):
    from_node: str
    to_node: str
    mode: str
    distance_km: float
    distance_source: str
    emissions_nominal_kg: float
    emissions_low_kg: float
    emissions_high_kg: float
    confidence: str
    emission_factor_source: str
    corrections_applied: list[str]
    weather_context: dict | None


class ForecastResponse(BaseModel):
    legs: list[LegForecast]
    total_nominal_kg: float
    total_low_kg: float
    total_high_kg: float
    overall_confidence: str
    generated_at: str


GLEC_FACTORS = {
    "sea": {"diesel": 0.011, "marine_diesel": 0.013, "lng": 0.008},
    "road": {"diesel": 0.096, "electric": 0.040},
    "air": {"kerosene": 0.602},
    "rail": {"diesel": 0.028, "electric": 0.018},
}

CLIMATIQ_ACTIVITY_IDS = {
    "sea": "sea_freight-vessel_type_bulk_carrier-route_type_na-vessel_length_na-tonnage_gt_100dwkt-fuel_source_mgo-distance_uplift_excluded",
    "road": "freight_vehicle-vehicle_type_hgv-fuel_source_na-vehicle_weight_gt_20t-distance_basis_sfd",
    "air": "freight_flight-route_type_na-distance_long_haul_gt_3700km-weight_na-rf_excluded-method_en16258-aircraft_type_belly_freight-distance_uplift_excluded",
    "rail": "freight_train-route_type_na-fuel_type_diesel-load_type_container-distance_basis_sfd",
}

CONFIDENCE_RANK = {"high": 0, "medium": 1, "low": 2}


def searoute_available() -> bool:
    return importlib.util.find_spec("searoute") is not None


def load_factor_correction(load_pct: float) -> float:
    return max(0.5, 2.0 - (load_pct / 100.0) * 1.0)


def reefer_correction(is_reefer: bool) -> float:
    return 1.35 if is_reefer else 1.0


def altitude_correction(mode: str) -> float:
    return 2.0 if mode == "air" else 1.0


def _round(value: float) -> float:
    return round(value, 2)


def _node_attrs(node_query: str) -> dict[str, Any]:
    node = graph.resolve_node(node_query)
    nx_graph = getattr(graph, "G", None) or getattr(graph, "nx_graph", None)
    if nx_graph is not None and node.node_id in nx_graph.nodes:
        attrs = dict(nx_graph.nodes[node.node_id])
    else:
        attrs = node.model_dump()
    attrs.setdefault("node_id", node.node_id)
    attrs.setdefault("name", node.name)
    attrs.setdefault("latitude", node.latitude)
    attrs.setdefault("longitude", node.longitude)
    return attrs


def _lat_lon(attrs: dict[str, Any]) -> tuple[float, float]:
    lat = attrs.get("lat", attrs.get("latitude"))
    lon = attrs.get("lon", attrs.get("lng", attrs.get("longitude")))
    if lat is None or lon is None:
        raise ValueError("Node is missing latitude/longitude")
    return float(lat), float(lon)


def _haversine_km(origin: dict[str, Any], destination: dict[str, Any]) -> float:
    lat1, lon1 = _lat_lon(origin)
    lat2, lon2 = _lat_lon(destination)
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def _resolve_sea_distance(client: httpx.AsyncClient, origin: dict[str, Any], destination: dict[str, Any]) -> tuple[float, str]:
    distance_km = _searoute_distance_km(origin, destination)
    if distance_km:
        return distance_km, "searoute_local"
    return _haversine_km(origin, destination) * 1.25, "haversine_fallback"


def _searoute_distance_km(origin: dict[str, Any], destination: dict[str, Any]) -> float | None:
    try:
        import searoute as sr

        origin_lat, origin_lon = _lat_lon(origin)
        destination_lat, destination_lon = _lat_lon(destination)
        route = sr.searoute([origin_lon, origin_lat], [destination_lon, destination_lat], units="km")
        properties = getattr(route, "properties", None) or route.get("properties", {})
        length = float(properties["length"])
        return length if length > 0 else None
    except Exception:
        return None


async def _resolve_road_distance(client: httpx.AsyncClient, origin: dict[str, Any], destination: dict[str, Any]) -> tuple[float, str]:
    lat1, lon1 = _lat_lon(origin)
    lat2, lon2 = _lat_lon(destination)
    base_url = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org").rstrip("/")
    try:
        url = f"{base_url}/route/v1/driving/{lon1},{lat1};{lon2},{lat2}"
        response = await client.get(url, params={"overview": "false"}, timeout=10.0)
        response.raise_for_status()
        distance_m = float(response.json()["routes"][0]["distance"])
        if distance_m > 0:
            return distance_m / 1000.0, "osrm"
    except Exception:
        pass
    return _haversine_km(origin, destination), "formula"


async def resolve_distance(client: httpx.AsyncClient, leg: ForecastLeg, origin: dict[str, Any], destination: dict[str, Any]) -> tuple[float, str]:
    mode = leg.mode.lower()
    if mode == "sea":
        return await _resolve_sea_distance(client, origin, destination)
    if mode == "road":
        return await _resolve_road_distance(client, origin, destination)
    if mode == "air":
        return _haversine_km(origin, destination) * 1.09, "formula"
    if mode == "rail":
        return _haversine_km(origin, destination) * 1.2, "formula"
    return _haversine_km(origin, destination), "formula"


async def estimate_base_emissions(client: httpx.AsyncClient, leg: ForecastLeg, distance_km: float) -> tuple[float, str]:
    mode = leg.mode.lower()
    tonnes = max(leg.weight_kg, 0) / 1000.0
    api_key = os.getenv("CLIMATIQ_API_KEY")
    activity_id = CLIMATIQ_ACTIVITY_IDS.get(mode)
    if api_key and activity_id:
        try:
            response = await client.post(
                "https://api.climatiq.io/data/v1/estimate",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "emission_factor": {
                        "activity_id": activity_id,
                        "source": "GLEC",
                        "data_version": os.getenv("CLIMATIQ_DATA_VERSION", "33.33"),
                    },
                    "parameters": {
                        "distance": distance_km,
                        "weight": tonnes,
                        "weight_unit": "t",
                        "distance_unit": "km",
                    },
                },
                timeout=10.0,
            )
            response.raise_for_status()
            co2e = float(response.json()["co2e"])
            if co2e >= 0:
                return co2e, "climatiq"
        except Exception:
            pass

    mode_factors = GLEC_FACTORS.get(mode, {})
    fallback_factor = next(iter(mode_factors.values()), 0.0)
    factor = mode_factors.get(leg.fuel_type, fallback_factor)
    return factor * distance_km * tonnes, "glec_local"


async def weather_context(client: httpx.AsyncClient, leg: ForecastLeg, origin: dict[str, Any]) -> tuple[dict | None, float]:
    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key or not leg.departure_date:
        return None, 0.0

    try:
        lat, lon = _lat_lon(origin)
        response = await client.get(
            "https://api.openweathermap.org/data/2.5/forecast",
            params={"lat": lat, "lon": lon, "appid": api_key, "units": "metric"},
            timeout=10.0,
        )
        response.raise_for_status()
        forecasts = response.json().get("list", [])
        selected = forecasts[0] if forecasts else {}
        if forecasts:
            target_date = leg.departure_date[:10]
            selected = min(forecasts, key=lambda item: 0 if str(item.get("dt_txt", "")).startswith(target_date) else 1)
        context = {
            "wind_speed_ms": float(selected.get("wind", {}).get("speed", 0.0)),
            "temp_c": float(selected.get("main", {}).get("temp", 0.0)),
            "weather_description": selected.get("weather", [{}])[0].get("description", ""),
        }
        uncertainty = 0.0
        if leg.mode.lower() == "sea" and context["wind_speed_ms"] > 15:
            uncertainty += 0.08
        if leg.mode.lower() == "road" and context["temp_c"] < 0:
            uncertainty += 0.05
        return context, uncertainty
    except Exception:
        return None, 0.0


def _corrections(leg: ForecastLeg) -> tuple[float, list[str]]:
    corrections: list[str] = []
    load_multiplier = load_factor_correction(leg.load_pct)
    if abs(load_multiplier - 1.0) > 0.001:
        corrections.append("load factor")

    reefer_multiplier = reefer_correction(leg.is_reefer)
    if reefer_multiplier > 1.0:
        corrections.append("reefer +35%")

    altitude_multiplier = altitude_correction(leg.mode.lower())
    if altitude_multiplier > 1.0:
        corrections.append("altitude x2")

    return load_multiplier * reefer_multiplier * altitude_multiplier, corrections


def _confidence(uncertainty: float) -> str:
    if uncertainty < 0.15:
        return "high"
    if uncertainty < 0.25:
        return "medium"
    return "low"


async def forecast_leg(client: httpx.AsyncClient, leg: ForecastLeg) -> LegForecast:
    try:
        origin = _node_attrs(leg.from_node)
        destination = _node_attrs(leg.to_node)
    except Exception as exc:
        return LegForecast(
            from_node=leg.from_node,
            to_node=leg.to_node,
            mode=leg.mode,
            distance_km=0.0,
            distance_source="formula",
            emissions_nominal_kg=0.0,
            emissions_low_kg=0.0,
            emissions_high_kg=0.0,
            confidence="low",
            emission_factor_source="glec_local",
            corrections_applied=[f"error: {exc}"],
            weather_context=None,
        )

    distance_task = resolve_distance(client, leg, origin, destination)
    weather_task = weather_context(client, leg, origin)
    (distance_km, distance_source), (weather, weather_uncertainty) = await asyncio.gather(distance_task, weather_task)
    base_emissions, factor_source = await estimate_base_emissions(client, leg, distance_km)
    correction_multiplier, corrections = _corrections(leg)
    nominal = base_emissions * correction_multiplier

    uncertainty = 0.12
    if factor_source == "glec_local":
        uncertainty += 0.08
    if leg.load_pct == 75.0:
        uncertainty += 0.06
    if distance_source in {"formula", "haversine_fallback"}:
        uncertainty += 0.05
    uncertainty += weather_uncertainty

    confidence = _confidence(uncertainty)
    return LegForecast(
        from_node=str(origin.get("name") or origin.get("node_id") or leg.from_node),
        to_node=str(destination.get("name") or destination.get("node_id") or leg.to_node),
        mode=leg.mode.lower(),
        distance_km=_round(distance_km),
        distance_source=distance_source,
        emissions_nominal_kg=_round(nominal),
        emissions_low_kg=_round(max(0.0, nominal * (1 - uncertainty))),
        emissions_high_kg=_round(nominal * (1 + uncertainty)),
        confidence=confidence,
        emission_factor_source=factor_source,
        corrections_applied=corrections,
        weather_context=weather,
    )


async def forecast_emissions(request: ForecastRequest) -> ForecastResponse:
    async with httpx.AsyncClient(timeout=10.0) as client:
        legs = await asyncio.gather(*(forecast_leg(client, leg) for leg in request.legs))

    total_nominal = sum(leg.emissions_nominal_kg for leg in legs)
    total_low = sum(leg.emissions_low_kg for leg in legs)
    total_high = sum(leg.emissions_high_kg for leg in legs)
    overall_confidence = "high"
    if legs:
        overall_confidence = max((leg.confidence for leg in legs), key=lambda item: CONFIDENCE_RANK[item])

    return ForecastResponse(
        legs=legs,
        total_nominal_kg=_round(total_nominal),
        total_low_kg=_round(total_low),
        total_high_kg=_round(total_high),
        overall_confidence=overall_confidence,
        generated_at=datetime.now(UTC).isoformat(),
    )
