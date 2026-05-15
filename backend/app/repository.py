from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from .graph import graph
from .ledger import ledger
from .optimizer import optimize_route
from .schemas import (
    AnalyticsScope3,
    AppendLegRequest,
    OptimizeRouteRequest,
    Priority,
    RouteLeg,
    Shipment,
    ShipmentCreateRequest,
)


class ShipmentRepository:
    def __init__(self) -> None:
        self._shipments: dict[str, Shipment] = {}
        self._extra_legs: dict[str, list[RouteLeg]] = {}

    def create(self, request: ShipmentCreateRequest, public_base_url: str = "http://localhost:3000") -> Shipment:
        optimized = optimize_route(
            OptimizeRouteRequest(
                origin=request.origin,
                destination=request.destination,
                weight_kg=request.weight_kg,
                priority=request.priority,
            )
        )
        shipment_id = f"CP-{uuid4().hex[:10].upper()}"
        shipment = Shipment(
            shipment_id=shipment_id,
            origin=optimized.origin,
            destination=optimized.destination,
            weight_kg=request.weight_kg,
            priority=request.priority,
            selected_route=optimized.recommendation,
            created_at=datetime.now(UTC),
            passport_url=f"{public_base_url.rstrip('/')}/passport/{shipment_id}",
        )
        self._shipments[shipment_id] = shipment
        self._extra_legs[shipment_id] = []
        for leg in shipment.selected_route.legs:
            ledger.append_leg(shipment_id, leg)
        return shipment

    def get(self, shipment_id: str) -> Shipment:
        if shipment_id not in self._shipments:
            raise KeyError(shipment_id)
        return self._shipments[shipment_id]

    def append_leg(self, shipment_id: str, request: AppendLegRequest) -> RouteLeg:
        shipment = self.get(shipment_id)
        source = graph.resolve_node(request.from_node)
        target = graph.resolve_node(request.to_node)
        leg = RouteLeg(
            from_node=source.node_id,
            from_name=source.name,
            to_node=target.node_id,
            to_name=target.name,
            mode=request.mode,
            distance_km=request.distance_km,
            travel_time_hr=0,
            cost_usd=0,
            emissions_kg=request.emissions_kg,
            risk=0,
            reliability=1,
        )
        self._extra_legs.setdefault(shipment.shipment_id, []).append(leg)
        ledger.append_leg(shipment.shipment_id, leg, request.timestamp)
        return leg

    def legs_for(self, shipment_id: str) -> list[RouteLeg]:
        shipment = self.get(shipment_id)
        return [*shipment.selected_route.legs, *self._extra_legs.get(shipment_id, [])]

    def all(self) -> list[Shipment]:
        return list(self._shipments.values())

    def analytics(self) -> AnalyticsScope3:
        shipments = self.all()
        emissions_by_mode: dict[str, float] = {}
        emissions_by_lane: dict[str, float] = {}
        total_emissions = 0.0
        total_distance = 0.0

        for shipment in shipments:
            for leg in self.legs_for(shipment.shipment_id):
                emissions_by_mode[leg.mode.value] = emissions_by_mode.get(leg.mode.value, 0.0) + leg.emissions_kg
                lane = f"{leg.from_name} -> {leg.to_name}"
                emissions_by_lane[lane] = emissions_by_lane.get(lane, 0.0) + leg.emissions_kg
                total_emissions += leg.emissions_kg
                total_distance += leg.distance_km

        return AnalyticsScope3(
            shipment_count=len(shipments),
            total_emissions_kg=round(total_emissions, 3),
            total_distance_km=round(total_distance, 3),
            emissions_by_mode={key: round(value, 3) for key, value in emissions_by_mode.items()},
            emissions_by_lane={key: round(value, 3) for key, value in emissions_by_lane.items()},
            average_emissions_per_shipment_kg=round(total_emissions / len(shipments), 3) if shipments else 0,
        )


repository = ShipmentRepository()

