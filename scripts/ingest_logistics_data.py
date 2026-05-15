#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from app.data import AIR_FACTOR, EDGES, NODES, RAIL_FACTOR, SEA_FACTOR, TRUCK_FACTOR
from app.ingestion import save_graph_artifact
from app.schemas import Edge, Node, TransportMode

FALLBACK_FACTORS = {
    TransportMode.truck: TRUCK_FACTOR,
    TransportMode.rail: RAIL_FACTOR,
    TransportMode.sea: SEA_FACTOR,
    TransportMode.air: AIR_FACTOR,
}

COST_PER_TONNE_KM = {
    TransportMode.truck: 0.42,
    TransportMode.rail: 0.18,
    TransportMode.sea: 0.09,
    TransportMode.air: 1.55,
}

MODE_SPEED_KMH = {
    TransportMode.truck: 58,
    TransportMode.rail: 44,
    TransportMode.sea: 33,
    TransportMode.air: 740,
}

MODE_DISTANCE_MULTIPLIER = {
    TransportMode.truck: 1.22,
    TransportMode.rail: 1.18,
    TransportMode.sea: 1.34,
    TransportMode.air: 1.08,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the Carbon Passport AI logistics graph artifact.")
    parser.add_argument("--output", default=os.getenv("LOGISTICS_GRAPH_PATH", "data/logistics_graph.json"))
    parser.add_argument("--unlocode", default=os.getenv("UNLOCODE_PATH"))
    parser.add_argument("--world-port-index", default=os.getenv("WORLD_PORT_INDEX_PATH"))
    parser.add_argument("--emission-factors", default=os.getenv("EMISSION_FACTORS_PATH"))
    parser.add_argument("--enable-apis", action="store_true", default=os.getenv("INGEST_ENABLE_APIS", "false").lower() == "true")
    parser.add_argument("--include-external-nodes", action="store_true")
    parser.add_argument("--max-external-nodes", type=int, default=250)
    args = parser.parse_args()

    nodes = {node.node_id: node for node in NODES}
    source_notes: list[str] = ["Built-in curated demo logistics hubs"]
    dataset_counts: dict[str, int] = {}

    if args.unlocode:
        count = merge_unlocode(Path(args.unlocode), nodes, args.include_external_nodes, args.max_external_nodes)
        dataset_counts["unlocode_rows_used"] = count
        source_notes.append(f"UN/LOCODE local file: {args.unlocode}")

    if args.world_port_index:
        count = merge_world_port_index(Path(args.world_port_index), nodes, args.include_external_nodes, args.max_external_nodes)
        dataset_counts["world_port_index_rows_used"] = count
        source_notes.append(f"World Port Index local file: {args.world_port_index}")

    factors = load_emission_factors(Path(args.emission_factors)) if args.emission_factors else FALLBACK_FACTORS
    source_notes.append(
        "Emission factors: local factor file"
        if args.emission_factors
        else "Emission factors: representative GLEC/Climatiq-style defaults"
    )

    api_sources: list[str] = []
    edges = [
        enrich_edge(edge, nodes, factors, args.enable_apis, api_sources)
        for edge in EDGES
        if edge.source_node in nodes and edge.target_node in nodes
    ]

    metadata = {
        "graph_source": "ingested",
        "generated_at": datetime.now(UTC).isoformat(),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "sources": source_notes,
        "api_sources_used": sorted(set(api_sources)),
        "dataset_counts": dataset_counts,
        "notes": [
            "The graph is built from local public-data exports when provided.",
            "API calls are optional and only run with --enable-apis or INGEST_ENABLE_APIS=true.",
            "Missing API credentials fall back to deterministic distance, time, cost, and risk heuristics.",
        ],
    }
    save_graph_artifact(Path(args.output), list(nodes.values()), edges, metadata)
    print(json.dumps({"output": args.output, **metadata}, indent=2))


def merge_unlocode(path: Path, nodes: dict[str, Node], include_external: bool, max_external: int) -> int:
    if not path.exists():
        return 0
    count = 0
    for row in read_rows(path):
        country = value_for(row, "country", "Country", "Country Code", "ISO 3166-1")
        location = value_for(row, "location", "Location", "LOCODE", "Code")
        name = value_for(row, "name", "Name", "Location Name")
        coordinates = value_for(row, "coordinates", "Coordinates", "coord")
        function = value_for(row, "function", "Function", "Function classifier")
        lat, lon = parse_coordinates(coordinates)
        if not country or not location or not name or lat is None or lon is None:
            continue
        locode = f"{country}{location}".replace(" ", "").upper()
        existing_ids = [node_id for node_id in nodes if node_id.startswith(locode)]
        node_type = unlocode_type(function)
        if existing_ids:
            for node_id in existing_ids:
                current = nodes[node_id]
                nodes[node_id] = current.model_copy(update={"latitude": lat, "longitude": lon, "type": node_type or current.type})
            count += 1
        elif include_external and count < max_external:
            nodes[f"{locode}_{node_type.upper()}"] = Node(
                node_id=f"{locode}_{node_type.upper()}",
                name=name,
                type=node_type,
                latitude=lat,
                longitude=lon,
                country=country,
            )
            count += 1
    return count


def merge_world_port_index(path: Path, nodes: dict[str, Node], include_external: bool, max_external: int) -> int:
    if not path.exists():
        return 0
    count = 0
    for row in read_rows(path):
        name = value_for(row, "Main Port Name", "PORT_NAME", "port_name", "name")
        country = value_for(row, "Country Code", "COUNTRY", "country")
        lat = parse_float(value_for(row, "Latitude", "LATITUDE", "lat"))
        lon = parse_float(value_for(row, "Longitude", "LONGITUDE", "lon", "lng"))
        if not name or lat is None or lon is None:
            continue
        matched = [
            node_id
            for node_id, node in nodes.items()
            if node.type == "port" and (node.name.lower() in name.lower() or name.lower() in node.name.lower())
        ]
        if matched:
            for node_id in matched:
                current = nodes[node_id]
                nodes[node_id] = current.model_copy(update={"latitude": lat, "longitude": lon})
            count += 1
        elif include_external and count < max_external:
            node_id = slug_node_id(country or "PORT", name, "PORT")
            nodes[node_id] = Node(node_id=node_id, name=name, type="port", latitude=lat, longitude=lon, country=country or "")
            count += 1
    return count


def enrich_edge(
    edge: Edge,
    nodes: dict[str, Node],
    factors: dict[TransportMode, float],
    enable_apis: bool,
    api_sources: list[str],
) -> Edge:
    source = nodes[edge.source_node]
    target = nodes[edge.target_node]
    distance = edge.distance_km

    if enable_apis and edge.mode == TransportMode.truck:
        routed = osrm_distance_km(source, target)
        if routed:
            distance = routed
            api_sources.append("OSRM")
    elif enable_apis and edge.mode == TransportMode.sea:
        routed = searoutes_distance_km(source, target)
        if routed:
            distance = routed
            api_sources.append("SeaRoutes")
    elif not distance:
        distance = heuristic_distance_km(source, target, edge.mode)

    factor = factors.get(edge.mode, edge.emission_factor_kg_per_tonne_km)
    travel_time = max(distance / MODE_SPEED_KMH[edge.mode], 0.5)
    cost = max(distance * COST_PER_TONNE_KM[edge.mode], 25.0)
    risk = estimate_risk(edge, source, target, enable_apis, api_sources)
    reliability = max(0.55, min(0.99, 1 - risk))
    return edge.model_copy(
        update={
            "distance_km": round(distance, 3),
            "travel_time_hr": round(travel_time, 3),
            "base_cost_usd": round(cost, 2),
            "emission_factor_kg_per_tonne_km": factor,
            "risk": round(risk, 4),
            "reliability": round(reliability, 4),
        }
    )


def osrm_distance_km(source: Node, target: Node) -> float | None:
    base_url = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org").rstrip("/")
    url = f"{base_url}/route/v1/driving/{source.longitude},{source.latitude};{target.longitude},{target.latitude}"
    try:
        response = httpx.get(url, params={"overview": "false"}, timeout=20)
        response.raise_for_status()
        routes = response.json().get("routes") or []
        if routes:
            return float(routes[0]["distance"]) / 1000
    except Exception:
        return None
    return None


def searoutes_distance_km(source: Node, target: Node) -> float | None:
    api_key = os.getenv("SEAROUTES_API_KEY")
    if not api_key:
        return None
    base_url = os.getenv("SEAROUTES_BASE_URL", "https://api.searoutes.com").rstrip("/")
    url = f"{base_url}/route/v2/sea/{source.longitude},{source.latitude};{target.longitude},{target.latitude}"
    try:
        response = httpx.get(url, headers={"x-api-key": api_key}, timeout=30)
        response.raise_for_status()
        data = response.json()
        distance = data.get("properties", {}).get("distance")
        if distance:
            return float(distance) / 1000
    except Exception:
        return None
    return None


def estimate_risk(edge: Edge, source: Node, target: Node, enable_apis: bool, api_sources: list[str]) -> float:
    base = edge.risk
    if enable_apis:
        weather = openweather_risk(target)
        if weather is not None:
            api_sources.append("OpenWeatherMap")
            base = max(base, weather)
    if edge.mode == TransportMode.sea and target.type == "port":
        base += 0.03
    if source.country != target.country and edge.mode in {TransportMode.truck, TransportMode.rail}:
        base += 0.04
    return max(0.02, min(0.45, base))


def openweather_risk(node: Node) -> float | None:
    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key:
        return None
    try:
        response = httpx.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"lat": node.latitude, "lon": node.longitude, "appid": api_key},
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
        wind = float(data.get("wind", {}).get("speed", 0))
        visibility = float(data.get("visibility", 10000))
        weather_ids = [item.get("id", 0) for item in data.get("weather", [])]
        storm = any(200 <= int(item) < 600 for item in weather_ids)
        return min(0.45, 0.06 + (0.12 if storm else 0) + min(wind / 120, 0.12) + (0.08 if visibility < 3000 else 0))
    except Exception:
        return None


def load_emission_factors(path: Path) -> dict[TransportMode, float]:
    if not path.exists():
        return FALLBACK_FACTORS
    payload = json.loads(path.read_text(encoding="utf-8"))
    factors = FALLBACK_FACTORS.copy()
    for mode in TransportMode:
        value = payload.get(mode.value)
        if isinstance(value, dict):
            value = value.get("kg_co2e_per_tonne_km")
        if value:
            factors[mode] = float(value)
    return factors


def heuristic_distance_km(source: Node, target: Node, mode: TransportMode) -> float:
    return haversine_km(source.latitude, source.longitude, target.latitude, target.longitude) * MODE_DISTANCE_MULTIPLIER[mode]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        sample = handle.read(4096)
        handle.seek(0)
        delimiter = "\t" if sample.count("\t") > sample.count(",") else ","
        return list(csv.DictReader(handle, delimiter=delimiter))


def value_for(row: dict[str, Any], *names: str) -> str:
    lower_map = {key.lower(): key for key in row}
    for name in names:
        key = lower_map.get(name.lower())
        if key and row.get(key) is not None:
            return str(row[key]).strip()
    return ""


def parse_coordinates(value: str) -> tuple[float | None, float | None]:
    if not value:
        return None, None
    parts = value.replace(",", " ").split()
    if len(parts) == 2 and any(char in parts[0].upper() for char in "NS"):
        return parse_unlocode_coord(parts[0], "NS"), parse_unlocode_coord(parts[1], "EW")
    if len(parts) >= 2:
        lat = parse_float(parts[0])
        lon = parse_float(parts[1])
        if lat is not None and lon is not None:
            return lat, lon
    return None, None


def parse_unlocode_coord(value: str, axis: str) -> float | None:
    value = value.strip().upper()
    direction = next((char for char in axis if char in value), "")
    digits = "".join(char for char in value if char.isdigit())
    if not direction or len(digits) < 4:
        return None
    degree_digits = 2 if axis == "NS" else 3
    degrees = int(digits[:degree_digits])
    minutes = int(digits[degree_digits:degree_digits + 2])
    decimal = degrees + minutes / 60
    return -decimal if direction in {"S", "W"} else decimal


def parse_float(value: str) -> float | None:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def unlocode_type(function: str) -> str:
    function = function or ""
    if "1" in function:
        return "port"
    if "4" in function:
        return "airport"
    if "2" in function:
        return "rail"
    if "3" in function:
        return "inland_terminal"
    return "logistics_hub"


def slug_node_id(country: str, name: str, suffix: str) -> str:
    stem = "".join(char if char.isalnum() else "_" for char in f"{country}_{name}_{suffix}".upper())
    return "_".join(part for part in stem.split("_") if part)[:64]


if __name__ == "__main__":
    main()

