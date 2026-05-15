from __future__ import annotations

from .schemas import Edge


def calculate_leg_emissions(edge: Edge, weight_kg: float) -> float:
    tonnes = weight_kg / 1000
    return round(edge.distance_km * tonnes * edge.emission_factor_kg_per_tonne_km, 3)

