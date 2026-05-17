from app.optimizer import optimize_route
from app.schemas import OptimizeRouteRequest, Priority


def test_optimizer_returns_tradeoff_routes_for_demo_lane() -> None:
    response = optimize_route(
        OptimizeRouteRequest(
            origin="Chennai",
            destination="Tokyo",
            weight_kg=1200,
            priority=Priority.balanced,
        )
    )

    assert response.recommendation.total_emissions_kg > 0
    assert len(response.route_options) >= 3
    strategies = {option.strategy for option in response.route_options}
    assert Priority.balanced.value in strategies
    assert strategies & {
        Priority.carbon_first.value,
        Priority.express.value,
        Priority.low_cost.value,
        Priority.low_risk.value,
        "pareto_tradeoff",
    }
    assert any(leg.mode.value == "sea" for leg in response.recommendation.legs)


def test_optimizer_supports_india_to_vietnam() -> None:
    response = optimize_route(
        OptimizeRouteRequest(
            origin="India",
            destination="Vietnam",
            weight_kg=800,
            priority=Priority.carbon_first,
        )
    )

    assert response.origin.country == "India"
    assert response.destination.country == "Vietnam"
    assert response.recommendation.total_cost_usd > 0
