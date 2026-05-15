from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha1

from .carbon import calculate_leg_emissions
from .explanations import build_explanation, build_tradeoffs
from .graph import LogisticsGraph, graph
from .schemas import (
    Edge,
    OptimizationWeights,
    OptimizeRouteRequest,
    OptimizeRouteResponse,
    Priority,
    RouteLeg,
    RouteOption,
)


PROFILE_WEIGHTS: dict[str, OptimizationWeights] = {
    Priority.carbon_first.value: OptimizationWeights(carbon=0.62, cost=0.14, time=0.14, risk=0.10),
    Priority.balanced.value: OptimizationWeights(carbon=0.35, cost=0.25, time=0.25, risk=0.15),
    Priority.express.value: OptimizationWeights(carbon=0.12, cost=0.13, time=0.65, risk=0.10),
    Priority.low_cost.value: OptimizationWeights(carbon=0.18, cost=0.55, time=0.17, risk=0.10),
    Priority.low_risk.value: OptimizationWeights(carbon=0.25, cost=0.20, time=0.15, risk=0.40),
}


@dataclass(frozen=True)
class Candidate:
    edges: tuple[Edge, ...]
    legs: tuple[RouteLeg, ...]
    total_distance_km: float
    total_time_hr: float
    total_cost_usd: float
    total_emissions_kg: float
    average_risk: float

    @property
    def signature(self) -> str:
        return ">".join(f"{edge.source_node}:{edge.target_node}:{edge.mode.value}" for edge in self.edges)


def optimize_route(request: OptimizeRouteRequest, logistics_graph: LogisticsGraph = graph) -> OptimizeRouteResponse:
    origin = logistics_graph.resolve_node(request.origin)
    destination = logistics_graph.resolve_node(request.destination)
    paths = logistics_graph.enumerate_paths(origin.node_id, destination.node_id, request.max_hops)
    if not paths:
        raise ValueError(f"No route found from {origin.name} to {destination.name}")

    candidates = [_build_candidate(path, request.weight_kg, logistics_graph) for path in paths]
    baseline = max(candidates, key=lambda item: item.total_emissions_kg)
    fastest = min(candidates, key=lambda item: item.total_time_hr)
    greenest = min(candidates, key=lambda item: item.total_emissions_kg)
    cheapest = min(candidates, key=lambda item: item.total_cost_usd)

    selected: list[RouteOption] = []
    seen: set[str] = set()
    profile_names = [
        request.priority.value,
        Priority.carbon_first.value,
        Priority.balanced.value,
        Priority.express.value,
        Priority.low_cost.value,
        Priority.low_risk.value,
    ]

    for strategy in dict.fromkeys(profile_names):
        weights = request.weights if strategy == request.priority.value and request.weights else PROFILE_WEIGHTS[strategy]
        route = _best_for_strategy(strategy, candidates, weights.normalized(), baseline, fastest, greenest, cheapest)
        if route.route_id not in seen:
            selected.append(route)
            seen.add(route.route_id)

    for candidate in _pareto_front(candidates):
        route = _route_option(
            strategy="pareto_tradeoff",
            candidate=candidate,
            score=0,
            baseline=baseline,
            fastest=fastest,
            greenest=greenest,
            cheapest=cheapest,
        )
        if route.route_id not in seen:
            selected.append(route)
            seen.add(route.route_id)
        if len(selected) >= 6:
            break

    recommendation = min(
        selected,
        key=lambda route: _score_route(
            _candidate_from_option(route),
            selected=[_candidate_from_option(item) for item in selected],
            weights=(request.weights or PROFILE_WEIGHTS[request.priority.value]).normalized(),
        ),
    )

    selected = sorted(selected, key=lambda option: 0 if option.route_id == recommendation.route_id else option.score)
    return OptimizeRouteResponse(
        origin=origin,
        destination=destination,
        weight_kg=request.weight_kg,
        recommendation=recommendation,
        route_options=selected,
    )


def _build_candidate(edges: list[Edge], weight_kg: float, logistics_graph: LogisticsGraph) -> Candidate:
    legs = tuple(logistics_graph.edge_to_leg(edge, weight_kg) for edge in edges)
    return Candidate(
        edges=tuple(edges),
        legs=legs,
        total_distance_km=round(sum(edge.distance_km for edge in edges), 3),
        total_time_hr=round(sum(edge.travel_time_hr for edge in edges), 3),
        total_cost_usd=round(sum(edge.base_cost_usd for edge in edges), 2),
        total_emissions_kg=round(sum(calculate_leg_emissions(edge, weight_kg) for edge in edges), 3),
        average_risk=round(sum(edge.risk for edge in edges) / len(edges), 4),
    )


def _best_for_strategy(
    strategy: str,
    candidates: list[Candidate],
    weights: OptimizationWeights,
    baseline: Candidate,
    fastest: Candidate,
    greenest: Candidate,
    cheapest: Candidate,
) -> RouteOption:
    best = min(candidates, key=lambda candidate: _score_route(candidate, candidates, weights))
    score = _score_route(best, candidates, weights)
    return _route_option(strategy, best, score, baseline, fastest, greenest, cheapest)


def _score_route(candidate: Candidate, selected: list[Candidate], weights: OptimizationWeights) -> float:
    carbon = _normalize(candidate.total_emissions_kg, [item.total_emissions_kg for item in selected])
    cost = _normalize(candidate.total_cost_usd, [item.total_cost_usd for item in selected])
    time = _normalize(candidate.total_time_hr, [item.total_time_hr for item in selected])
    risk = _normalize(candidate.average_risk, [item.average_risk for item in selected])
    return round(
        (weights.carbon * carbon)
        + (weights.cost * cost)
        + (weights.time * time)
        + (weights.risk * risk),
        6,
    )


def _normalize(value: float, values: list[float]) -> float:
    low = min(values)
    high = max(values)
    if high == low:
        return 0
    return (value - low) / (high - low)


def _route_option(
    strategy: str,
    candidate: Candidate,
    score: float,
    baseline: Candidate,
    fastest: Candidate,
    greenest: Candidate,
    cheapest: Candidate,
) -> RouteOption:
    carbon_saving = 0.0
    if baseline.total_emissions_kg:
        carbon_saving = max(0, (baseline.total_emissions_kg - candidate.total_emissions_kg) / baseline.total_emissions_kg * 100)

    route = RouteOption(
        route_id=_route_id(candidate),
        strategy=strategy,
        score=score,
        total_distance_km=candidate.total_distance_km,
        total_time_hr=candidate.total_time_hr,
        total_cost_usd=candidate.total_cost_usd,
        total_emissions_kg=candidate.total_emissions_kg,
        average_risk=candidate.average_risk,
        carbon_saving_percent=round(carbon_saving, 2),
        legs=list(candidate.legs),
        explanation="",
        tradeoffs=[],
    )
    route.tradeoffs = build_tradeoffs(
        route,
        fastest=_option_from_candidate(fastest),
        greenest=_option_from_candidate(greenest),
        cheapest=_option_from_candidate(cheapest),
    )
    route.explanation = build_explanation(route, baseline=_option_from_candidate(baseline))
    return route


def _option_from_candidate(candidate: Candidate) -> RouteOption:
    return RouteOption(
        route_id=_route_id(candidate),
        strategy="reference",
        score=0,
        total_distance_km=candidate.total_distance_km,
        total_time_hr=candidate.total_time_hr,
        total_cost_usd=candidate.total_cost_usd,
        total_emissions_kg=candidate.total_emissions_kg,
        average_risk=candidate.average_risk,
        carbon_saving_percent=0,
        legs=list(candidate.legs),
        explanation="",
        tradeoffs=[],
    )


def _candidate_from_option(option: RouteOption) -> Candidate:
    edges = tuple(
        Edge(
            edge_id=f"{leg.from_node}-{leg.to_node}-{leg.mode.value}",
            source_node=leg.from_node,
            target_node=leg.to_node,
            mode=leg.mode,
            distance_km=leg.distance_km,
            travel_time_hr=leg.travel_time_hr,
            base_cost_usd=leg.cost_usd,
            emission_factor_kg_per_tonne_km=max(leg.emissions_kg / max(leg.distance_km, 1), 0.0001),
            reliability=leg.reliability,
            risk=leg.risk,
        )
        for leg in option.legs
    )
    return Candidate(
        edges=edges,
        legs=tuple(option.legs),
        total_distance_km=option.total_distance_km,
        total_time_hr=option.total_time_hr,
        total_cost_usd=option.total_cost_usd,
        total_emissions_kg=option.total_emissions_kg,
        average_risk=option.average_risk,
    )


def _route_id(candidate: Candidate) -> str:
    return "rt_" + sha1(candidate.signature.encode("utf-8")).hexdigest()[:10]


def _pareto_front(candidates: list[Candidate]) -> list[Candidate]:
    front: list[Candidate] = []
    for candidate in candidates:
        dominated = False
        for other in candidates:
            if other is candidate:
                continue
            no_worse = (
                other.total_emissions_kg <= candidate.total_emissions_kg
                and other.total_cost_usd <= candidate.total_cost_usd
                and other.total_time_hr <= candidate.total_time_hr
                and other.average_risk <= candidate.average_risk
            )
            strictly_better = (
                other.total_emissions_kg < candidate.total_emissions_kg
                or other.total_cost_usd < candidate.total_cost_usd
                or other.total_time_hr < candidate.total_time_hr
                or other.average_risk < candidate.average_risk
            )
            if no_worse and strictly_better:
                dominated = True
                break
        if not dominated:
            front.append(candidate)

    return sorted(front, key=lambda item: (item.total_emissions_kg, item.total_time_hr, item.total_cost_usd))
