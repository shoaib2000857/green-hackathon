from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class TransportMode(StrEnum):
    truck = "truck"
    rail = "rail"
    sea = "sea"
    air = "air"


class Priority(StrEnum):
    carbon_first = "carbon_first"
    balanced = "balanced"
    express = "express"
    low_cost = "low_cost"
    low_risk = "low_risk"


class Node(BaseModel):
    node_id: str
    name: str
    type: str
    latitude: float
    longitude: float
    country: str


class Edge(BaseModel):
    edge_id: str
    source_node: str
    target_node: str
    mode: TransportMode
    distance_km: float = Field(gt=0)
    travel_time_hr: float = Field(gt=0)
    base_cost_usd: float = Field(gt=0)
    emission_factor_kg_per_tonne_km: float = Field(gt=0)
    reliability: float = Field(ge=0, le=1)
    risk: float = Field(ge=0, le=1)


class OptimizationWeights(BaseModel):
    carbon: float = Field(default=0.35, ge=0)
    cost: float = Field(default=0.25, ge=0)
    time: float = Field(default=0.25, ge=0)
    risk: float = Field(default=0.15, ge=0)

    def normalized(self) -> "OptimizationWeights":
        total = self.carbon + self.cost + self.time + self.risk
        if total <= 0:
            return OptimizationWeights()
        return OptimizationWeights(
            carbon=self.carbon / total,
            cost=self.cost / total,
            time=self.time / total,
            risk=self.risk / total,
        )


class OptimizeRouteRequest(BaseModel):
    origin: str = Field(examples=["Chennai"])
    destination: str = Field(examples=["Tokyo"])
    weight_kg: float = Field(default=1000, gt=0)
    priority: Priority = Priority.balanced
    weights: OptimizationWeights | None = None
    max_hops: int = Field(default=6, ge=1, le=10)


class RouteLeg(BaseModel):
    from_node: str
    from_name: str
    to_node: str
    to_name: str
    mode: TransportMode
    distance_km: float
    travel_time_hr: float
    cost_usd: float
    emissions_kg: float
    risk: float
    reliability: float


class RouteOption(BaseModel):
    route_id: str
    strategy: str
    score: float
    total_distance_km: float
    total_time_hr: float
    total_cost_usd: float
    total_emissions_kg: float
    average_risk: float
    carbon_saving_percent: float
    legs: list[RouteLeg]
    explanation: str
    tradeoffs: list[str]


class OptimizeRouteResponse(BaseModel):
    origin: Node
    destination: Node
    weight_kg: float
    recommendation: RouteOption
    route_options: list[RouteOption]


class ShipmentCreateRequest(BaseModel):
    origin: str = Field(examples=["Chennai"])
    destination: str = Field(examples=["Tokyo"])
    weight_kg: float = Field(default=1000, gt=0)
    priority: Priority = Priority.balanced


class AppendLegRequest(BaseModel):
    from_node: str
    to_node: str
    mode: TransportMode
    distance_km: float = Field(gt=0)
    emissions_kg: float = Field(ge=0)
    timestamp: datetime | None = None


class LedgerEntry(BaseModel):
    leg_index: int
    payload_hash: str
    previous_hash: str
    entry_hash: str
    created_at: datetime


class Shipment(BaseModel):
    shipment_id: str
    origin: Node
    destination: Node
    weight_kg: float
    priority: Priority
    selected_route: RouteOption
    created_at: datetime
    passport_url: str


class Passport(BaseModel):
    shipment: Shipment
    total_emissions_kg: float
    total_cost_usd: float
    total_time_hr: float
    modes_used: list[TransportMode]
    legs: list[RouteLeg]
    ledger: list[LedgerEntry]
    verification_status: str
    audit_summary: dict[str, Any]


class AnalyticsScope3(BaseModel):
    shipment_count: int
    total_emissions_kg: float
    total_distance_km: float
    emissions_by_mode: dict[str, float]
    emissions_by_lane: dict[str, float]
    average_emissions_per_shipment_kg: float

